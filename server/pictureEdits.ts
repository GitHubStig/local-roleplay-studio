/**
 * Editing a Frame's picture (ADR 0021), the same in every kind of Session: an edit model repaints
 * it as told, in the area painted over it or all of it, as a new version made from that model's
 * newest, or from the Original. Each edit model's versions stay in a straight line of their own:
 * only a line's newest can be retried (in its place, with a new seed) or deleted, and the one
 * picked is the picture everywhere (`pickedVersion`).
 */
import { type FrameDeps, frameName, imageProgress, removeImage } from './frames.ts'
import { error } from './http.ts'
import type { EditModel } from './images/editModels.ts'
import type { EditOrder, JobEmit, JobKind } from './jobs.ts'
import { crossedLimit } from './limits.ts'
import { imageKindOf } from './backends.ts'
import { editJob } from './machine.ts'
import {
  changeFramePicture,
  changeRenderedPicture,
  editLine,
  editSource,
  pickedVersion,
  type PictureEdit,
  PictureGoneError,
  removeFiles,
  shownPictureOf,
  versionFiles,
} from './pictures.ts'
import { RenderQueue } from './renderQueue.ts'
import type { Session, SessionStore } from './session.ts'
import { updateSession } from './update.ts'

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
  deps: Pick<FrameDeps, 'store' | 'imageGenerator' | 'renderQueue' | 'backendOf'>,
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
  const { instruction, mask } = order
  const seed = redo ? redo.seed + 1 : session.seed
  // Found once, so the edit records where it was made.
  const backend = await deps.backendOf?.(editJob(model, order.backend))
  const kind = backend && imageKindOf(backend)
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: editJob(model, order.backend) })
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    const { onProgress, onDownload } = imageProgress(emit)
    const image = await deps.imageGenerator.edit(
      {
        model,
        ...(backend && { backend }),
        image: from.image,
        mask,
        instruction,
        seed,
        dir,
        name,
      },
      signal,
      onProgress,
      onDownload,
    )
    signal.throwIfAborted()
    const edit: PictureEdit = {
      image,
      instructions: [instruction],
      editModel: model,
      ...(kind && { imageBackend: kind }),
      seed,
      ...(mask && { mask }),
      timings: { ...(queued !== undefined ? { queued } : {}), edit: secondsSince(began) },
    }
    let replaced: PictureEdit | undefined
    const updated = await save((latest) =>
      changeRenderedPicture(latest, picture.image, (p) => {
        if (editSource(p, model).image !== (redo ?? from).image) {
          throw new PictureGoneError('That picture changed while it was being edited')
        }
        const now = p.edits ?? []
        // A retry takes its edit's place, so every other edit keeps its number.
        const at = redo ? now.findIndex((e) => e.image === redo.image) : now.length
        if (redo) replaced = now[at]
        const edits = now.toSpliced(at, redo ? 1 : 0, edit)
        return { ...p, edits, picked: at + 1 }
      })
    )
    // The edit it replaced, with what was made from it and its painted area.
    if (replaced) {
      const files = versionFiles(replaced)
      if (replaced.mask && replaced.mask !== mask) files.push(replaced.mask)
      await removeFiles(dir, files)
    }
    emit({ type: 'edited' })
    return updated
  } catch (err) {
    // The painted area stays with the job, to retry; it goes when the job is dismissed.
    await removeImage(dir, name)
    throw err
  } finally {
    release()
  }
}

export class VersionError extends Error {}

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
    return changeRenderedPicture(latest, picture.image, (p) => ({ ...p, picked }))
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
    return changeRenderedPicture(latest, picture.image, (p) => {
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
  await removeFiles(store.dir(session.id), [
    ...versionFiles(gone!),
    ...(gone!.mask ? [gone!.mask] : []),
  ])
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
    return changeFramePicture(latest, version.image, (v) => {
      const { upscaled: _, ...rest } = v
      return rest as typeof v
    })
  })
  await removeFiles(store.dir(session.id), [gone!])
  return updated
}
