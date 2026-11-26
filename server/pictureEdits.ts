/**
 * Editing a Frame's picture (ADR 0021), the same in every kind of Session: an edit model repaints
 * it as told, in the area painted over it or all of it, as a new version made from that model's
 * newest, or from the Original. Each edit model's versions stay in a straight line of their own:
 * only a line's newest can be retried (in its place, with a new seed) or deleted, and the one
 * picked is the picture everywhere (`pickedVersion`).
 */
import {
  facesOfFrame,
  type FrameDeps,
  frameName,
  imageProgress,
  passFaces,
  removeImage,
} from './frames.ts'
import { error } from './http.ts'
import type { EditModel } from '../shared/images.ts'
import type { JobEmit } from './jobs.ts'
import type { EditOrder } from '../shared/jobs.ts'
import type { JobKind } from '../shared/jobKinds.ts'
import { crossedLimit } from './limits.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { imageKindOf } from './backends.ts'
import { editJob } from './machine.ts'
import {
  changeFramePicture,
  changeRenderedPicture,
  editFiles,
  editLine,
  editSource,
  pickedVersion,
  PictureGoneError,
  removeFiles,
  seedOf,
  shownPictureOf,
  swapFaces,
} from './pictures.ts'
import type { FacePass, PictureEdit, PictureVersion } from '../shared/pictures.ts'
import { RenderQueue } from './renderQueue.ts'
import type { SessionStore } from './session.ts'
import type { Session } from '../shared/session.ts'
import { updateSession } from './update.ts'
import { Refusal } from './refusal.ts'

export class EditError extends Error {}

const secondsSince = (start: number) => Math.round(performance.now() - start) / 1000

/**
 * Why an edit can't be queued on the picture Frame `index` shows (the Frame called `name`), or null
 * if it can, by edit model `model`. Without a picture it can still wait behind a render already
 * queued (`pending`). Not while another edit is queued or running on it; a retry needs an edit by
 * `model` to make again.
 */
export function checkEdit(
  session: Session,
  index: number,
  name: string,
  pending: readonly JobKind[],
  order: EditOrder,
  model: string,
): Response | null {
  const picture = shownPictureOf(session, index)
  const coming = pending.some((k) => k === 'render' || k === 'picture')
  if (!picture && !coming) return error(`${name} has no picture to edit yet`, 409)
  if (pending.includes('edit')) return error(`${name} is being edited: wait for it first`, 409)
  if (order.retry) {
    const newest = picture && editLine(picture, model).at(-1)
    if (!newest) return error(`${name} has no edit by that model to retry`, 409)
    if (newest.copied) {
      return error(
        `${name}'s edit was copied from another Session: it can't be made again here`,
        409,
      )
    }
  }
  const limit = crossedLimit(order.instruction)
  return limit ? error(`That crosses a limit: ${limit.message}`, 422) : null
}

/**
 * Edits the picture Frame `index` shows, in its turn behind any render, as `order` says: a new
 * version at the end of `model`'s line, made from its newest (or the Original), or its newest made
 * again, as told now, with the next seed, in its place. Saves it onto the picture, if it's still
 * there and the line's newest is still the one it was made from, and picks it. Its painted area,
 * saved when it was queued, is kept beside it.
 */
export async function editFrame<S extends Session>(
  deps: Pick<
    FrameDeps,
    'store' | 'imageGenerator' | 'renderQueue' | 'backendOf' | 'settings' | 'faces'
  >,
  session: S,
  index: number,
  order: EditOrder,
  model: EditModel,
  emit: JobEmit,
  signal: AbortSignal,
  /** Saves the change onto the Session as it is now (`updateSession`): a job runs beside it. */
  save: (change: (s: S) => S) => Promise<S>,
): Promise<S> {
  const picture = shownPictureOf(session, index)
  if (!picture) throw new EditError(`${frameName(index)} has no picture to edit`)
  const line = editLine(picture, model)
  const redo = order.retry ? line.at(-1) : undefined
  if (order.retry && (!redo || redo.copied)) {
    throw new EditError(`${frameName(index)} has no edit to make again`)
  }
  // Made from the line's newest version; a retry, from the one before the edit it replaces.
  const from = (redo ? line.at(-2) : line.at(-1)) ?? picture
  const dir = deps.store.dir(session.id)
  const name = `edit-${index}-${crypto.randomUUID().slice(0, 8)}`
  const { instruction, mask, camera } = order
  // Never the seed its source was made with: on ComfyUI the same seed at the same size is the
  // same starting noise, and an edit started from its own picture's noise, with that picture as
  // its reference, redraws the picture over-sharpened and ignores the instruction ("noise replay",
  // docs/research/image-models.md). The render is made with the Session's seed (its faces, if it
  // had a face pass in use, with the pass's last), and each edit is one on from what it's made
  // from (its face pass's last, likewise); a retry, one on from the edit it replaces.
  const seed = redo ? redo.seed + 1 : seedOf(from, session.seed) + 1
  // Found once, so the edit records where it was made.
  const backend = await deps.backendOf?.(editJob(model, order.backend))
  const kind = backend && imageKindOf(backend)
  const start = performance.now()
  let waited = false
  let updated: S
  let image: string
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: editJob(model, order.backend) })
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    const { onProgress, onDownload } = imageProgress(emit)
    image = await deps.imageGenerator.edit(
      {
        model,
        ...(backend && { backend }),
        image: from.file,
        mask,
        instruction,
        seed,
        quantize: (deps.settings ? await deps.settings() : DEFAULT_SETTINGS).editQuantize,
        dir,
        name,
      },
      signal,
      onProgress,
      onDownload,
    )
    signal.throwIfAborted()
    const edit: PictureEdit = {
      file: image,
      instructions: [instruction],
      editModel: model,
      ...(kind && { imageBackend: kind }),
      seed,
      ...(mask && { mask }),
      timings: { ...(queued !== undefined ? { queued } : {}), edit: secondsSince(began) },
    }
    let replaced: PictureEdit | undefined
    updated = await save((latest) =>
      changeRenderedPicture(latest, picture.file, (p) => {
        if (editSource(p, model).file !== (redo ?? from).file) {
          throw new PictureGoneError('That picture changed while it was being edited')
        }
        const now = p.edits ?? []
        // A retry takes its edit's place, so every other edit keeps its number.
        const at = redo ? now.findIndex((e) => e.file === redo.file) : now.length
        if (redo) replaced = now[at]
        const edits = now.toSpliced(at, redo ? 1 : 0, edit)
        return { ...p, edits, picked: at + 1 }
      })
    )
    // The edit it replaced, with what was made from it and its painted area.
    if (replaced) await removeFiles(dir, editFiles(replaced).filter((f) => f !== mask))
    emit({ type: 'edited' })
  } catch (err) {
    // The painted area stays with the job, to retry; it goes when the job is dismissed.
    await removeImage(dir, name)
    throw err
  } finally {
    release()
  }
  // Then its face pass, in a Session with sheets, as a render's (ADR 0045,
  // stage 5): never one edit with both instructions, as a sheet passed into an edit that redraws a
  // person pulls their expression and pose to the sheet's. Only the heads its painted area touches,
  // or every head for an edit of all of the picture; each told to keep what the edit changed (a
  // smile, a cap, a cut), which the pass painted out when told the Frame's expression or nothing.
  // But a camera move (the Camera list's) is told the Frame's expression, as a render's pass is,
  // which kept a close-up's lowered gaze where naming the move didn't
  // (docs/bench/reference-sheets/2026-11-26/edits/).
  const faces = facesOfFrame(session, index)
  if (!faces) return updated
  const faced = await passFaces(
    deps,
    updated,
    index,
    {
      file: image,
      seed,
      edited: true,
      ...(mask && { area: mask }),
      ...((mask || !camera) && { change: instruction }),
    },
    faces,
    emit,
    signal,
    save,
    (latest, pass) => changeFramePicture(latest, image, (v) => swapFaces({ ...v, faces: pass })),
  )
  return faced ?? updated
}

export class VersionError extends Refusal {}

/**
 * Picks version `picked` of the picture Frame `index` shows (0 its render, n its edit n), so it's
 * the picture everywhere from now on.
 */
export function pickVersion(
  store: SessionStore,
  session: Session,
  index: number,
  picked: number,
): Promise<Session> {
  return updateSession(store, session.id, session.kind, (latest: Session) => {
    const picture = shownPictureOf(latest, index)
    if (!picture) throw new VersionError(`${frameName(index)} has no picture`)
    const count = picture.edits?.length ?? 0
    if (!Number.isInteger(picked) || picked < 0 || picked > count) {
      throw new VersionError(`${frameName(index)}'s picture has no version ${picked}`)
    }
    return changeRenderedPicture(latest, picture.file, (p) => ({ ...p, picked }))
  })
}

/**
 * Uses the version Frame `index`'s picture shows (its render, or its picked edit) without its face
 * pass (`without`), or its faces again: the two swap, each keeping what was made from it
 * (`swapFaces`). Refused once the picture before the pass was left out (the Session manager).
 */
export function useFaces(
  store: SessionStore,
  session: Session,
  index: number,
  without: boolean,
): Promise<Session> {
  return updateSession(store, session.id, session.kind, (latest: Session) => {
    const picture = shownPictureOf(latest, index)
    const version: PictureVersion & { faces?: FacePass } | undefined = picture &&
      pickedVersion(picture)
    if (!version?.faces) throw new VersionError(`${frameName(index)}'s picture had no face pass`)
    if (version.faces.without === without) return latest
    if (!version.faces.other) {
      throw new VersionError(`${frameName(index)}'s picture before its face pass wasn't kept`)
    }
    return changeFramePicture(latest, version.file, swapFaces)
  })
}

/**
 * Deletes edit `version` (n for `edits[n - 1]`) of the picture Frame `index` shows, if it's the
 * newest of its edit model's line, with what was made from it and its painted area. If it was
 * picked, the version before it in its line is picked instead (the Original, for its first).
 */
export async function deleteNewestEdit(
  store: SessionStore,
  session: Session,
  index: number,
  version: number,
): Promise<Session> {
  let gone: PictureEdit | undefined
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    const picture = shownPictureOf(latest, index)
    gone = picture?.edits?.[version - 1]
    if (!picture || !gone) {
      throw new VersionError(`${frameName(index)}'s picture has no edit ${version}`)
    }
    const line = editLine(picture, gone.editModel)
    if (line.at(-1) !== gone) {
      throw new VersionError(`Only the newest edit by ${gone.editModel} can be deleted`)
    }
    return changeRenderedPicture(latest, picture.file, (p) => {
      const at = version - 1
      const edits = p.edits!.toSpliced(at, 1)
      const before = line.at(-2)
      const was = p.picked ?? 0
      const picked = was === version
        ? (before ? edits.indexOf(before) + 1 : 0)
        : was > version
        ? was - 1
        : was
      const { edits: _, picked: __, ...render } = p
      return { ...render, ...(edits.length && { edits }), ...(picked && { picked }) }
    })
  })
  await removeFiles(store.dir(session.id), editFiles(gone!))
  return updated
}

/**
 * Deletes the upscale of the version of Frame `index`'s picture that is picked, keeping the version
 * itself: a picture that looks worse upscaled goes back to its image as rendered or edited.
 */
export async function deleteUpscale(
  store: SessionStore,
  session: Session,
  index: number,
): Promise<Session> {
  let gone: string | undefined
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    const picture = shownPictureOf(latest, index)
    const version = picture && pickedVersion(picture)
    if (!version?.upscaled) throw new VersionError(`${frameName(index)}'s picture isn't upscaled`)
    gone = version.upscaled
    return changeFramePicture(latest, version.file, (v) => {
      const { upscaled: _, ...rest } = v
      return rest as typeof v
    })
  })
  await removeFiles(store.dir(session.id), [gone!])
  return updated
}
