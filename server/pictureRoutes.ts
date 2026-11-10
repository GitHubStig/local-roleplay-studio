/**
 * What every kind of Session does with its pictures beyond its jobs: its Image Model, the
 * thumbnail, a model's pictures, versions and upscales, the style scores and the Pictures export.
 */
import { join } from '@std/path'
import { error, json, readJson, type Route } from './http.ts'
import { anyImageModel, findImageModel } from './images/imageModels.ts'
import { IMAGE_BACKEND_NAMES, IMAGE_BACKENDS, type ImageBackendKind } from '../shared/images.ts'
import { deleteNewestEdit, deleteUpscale, pickVersion } from './pictureEdits.ts'
import { loadStyleCache, styleScores, unembedded } from './style/scores.ts'
import { isOpen, onModelPictures } from './jobs.ts'
import { comparisonTitle, parseComparisonExport, writeComparison } from './export/comparison.ts'
import {
  chooseThumbnail,
  deleteModelPictures,
  refuseOwnModel,
  switchImageModel,
} from './pictures.ts'
import type { AppContext } from './appContext.ts'

export function pictureRoutes(ctx: AppContext): Route[] {
  const { deps, jobs, loadSession, heavyBackend } = ctx

  return [
    // Switches the Session's Image Model: `{ imageModel, imageBackend? }`, by name, and the kind of
    // backend it would rather render on, if picked (ADR 0022): one a Backend listed can render.
    ['PUT', new URLPattern({ pathname: '/api/sessions/:id/image-model' }), async (req, p) => {
      const body = await readJson(req) as
        | { imageModel?: unknown; imageBackend?: unknown }
        | undefined
      if (typeof body?.imageModel !== 'string') return error('imageModel must be a string', 400)
      const on = body.imageBackend as ImageBackendKind | undefined
      if (on !== undefined && !IMAGE_BACKENDS.includes(on)) {
        return error(`imageBackend must be one of: ${IMAGE_BACKENDS.join(', ')}`, 400)
      }
      if (on && anyImageModel(body.imageModel) && !findImageModel(on, body.imageModel)) {
        return error(`${IMAGE_BACKEND_NAMES[on]} has no Image Model "${body.imageModel}"`, 400)
      }
      const session = await loadSession(p.id!)
      const backend = await heavyBackend({ kind: 'render', model: body.imageModel, on })
      if (
        !backend && body.imageModel !== session.settings.imageModel &&
        anyImageModel(body.imageModel)
      ) {
        return error(
          `No Backend renders ${body.imageModel}: add one in Settings, on the Machines tab`,
          409,
        )
      }
      return json(await switchImageModel(deps.sessions, session, body.imageModel, on))
    }],

    // Chooses the image that shows the Session on Home, and sends the Session back.
    ['PUT', new URLPattern({ pathname: '/api/sessions/:id/thumbnail' }), async (req, p) => {
      const body = await readJson(req) as { image?: unknown } | undefined
      if (typeof body?.image !== 'string') return error('image must be a string', 400)
      const session = await loadSession(p.id!)
      return json(await chooseThumbnail(deps.sessions, session, body.image))
    }],

    // Goes back to Home showing the newest picture.
    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/thumbnail' }), async (_req, p) => {
      const session = await loadSession(p.id!)
      return json(await chooseThumbnail(deps.sessions, session, null))
    }],

    // Deletes every picture by one Image Model (`?imageModel=`), with its upscales and 3D, from
    // Pictures' hidden columns; not the Session's own model. The work queued or running on them is
    // cancelled first, and what's running has ended before anything goes, so none saves after.
    // Sends back the Session, and how many pictures went.
    ['DELETE', new URLPattern({ pathname: '/api/sessions/:id/pictures' }), async (req, p) => {
      const model = new URL(req.url).searchParams.get('imageModel')
      if (!model) return error('imageModel is required', 400)
      const session = await loadSession(p.id!)
      refuseOwnModel(session, model)
      if (jobs.list(session.id).some((j) => j.kind === 'style' && j.status === 'running')) {
        return error('Style scores are being worked out: wait for them to finish first', 409)
      }
      return json(
        await jobs.without(
          session.id,
          onModelPictures(session, model, jobs.list(session.id)),
          () => deleteModelPictures(deps.sessions, session, model),
        ),
      )
    }],

    // Picks which version of Frame `:index`'s picture is the picture (ADR 0021): `{ picked }`, 0
    // for its render, n for its edit n. Sends back the Session.
    [
      'PUT',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/picked' }),
      async (req, p) => {
        const body = await readJson(req) as { picked?: unknown } | undefined
        const session = await loadSession(p.id!)
        return json(
          await pickVersion(deps.sessions, session, Number(p.index), Number(body?.picked)),
        )
      },
    ],

    // Deletes edit `:version` of Frame `:index`'s picture, the newest of its edit model's line,
    // unless an edit is queued or running on it (made from it, or making it again). Sends back the
    // Session.
    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/edits/:version' }),
      async (_req, p) => {
        const session = await loadSession(p.id!)
        const index = Number(p.index)
        const editing = jobs.list(session.id)
          .some((j) => j.kind === 'edit' && j.frameIndex === index && isOpen(j))
        if (editing) return error('That picture is being edited: wait for it first', 409)
        return json(await deleteNewestEdit(deps.sessions, session, index, Number(p.version)))
      },
    ],

    // Deletes the upscale of the picked version of Frame `:index`'s picture, unless one is queued
    // or running on the Frame. Sends back the Session.
    [
      'DELETE',
      new URLPattern({ pathname: '/api/sessions/:id/pictures/:index/upscale' }),
      async (_req, p) => {
        const session = await loadSession(p.id!)
        const index = Number(p.index)
        const upscaling = jobs.list(session.id)
          .some((j) => j.kind === 'upscale' && j.frameIndex === index && isOpen(j))
        if (upscaling) return error('That picture is being upscaled: wait for it first', 409)
        return json(await deleteUpscale(deps.sessions, session, index))
      },
    ],

    // The Compare dialog's style scores, against Frame `base`, for the Image Models in `models`
    // (comma-separated; all of them if left out), from the pictures the `style` job embedded.
    ['GET', new URLPattern({ pathname: '/api/sessions/:id/style-scores' }), async (req, p) => {
      const session = await loadSession(p.id!)
      const query = new URL(req.url).searchParams
      const base = Number(query.get('base') ?? 0)
      if (!Number.isInteger(base) || !session.frames[base]) return error('No such Frame', 404)
      const models = query.get('models')?.split(',').filter(Boolean)
      const cache = await loadStyleCache(deps.sessions.dir(session.id))
      if (!cache) return error('Not scored yet', 404)
      const todo = unembedded(session, cache)
      return json({
        ...styleScores(session, cache, base, models),
        unembedded: todo.images.length + todo.texts.length,
      })
    }],

    // The Compare dialog as a page of its own, with its pictures as WebP, in a folder under
    // `exports/` named for the Session: `ComparisonExport`. It says where the folder went.
    ['POST', new URLPattern({ pathname: '/api/sessions/:id/export' }), async (req, p) => {
      if (!deps.exports) return error("Exporting isn't set up", 404)
      const comparison = parseComparisonExport(await readJson(req))
      if (typeof comparison === 'string') return error(comparison, 400)
      const session = await loadSession(p.id!)
      const folder = join(deps.exports.dir, p.id!)
      const { pictures } = await writeComparison(
        deps.sessions.dir(p.id!),
        folder,
        await deps.exports.page(),
        comparison,
        comparisonTitle(new Date(), session.seed),
      )
      return json({ folder, pictures })
    }],
  ]
}
