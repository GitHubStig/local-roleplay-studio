/**
 * Editing a Frame's picture (ADR 0021), the same in every kind of Session: an edit model repaints
 * it as told, in the area painted over it or all of it, as a new version made from the newest. The
 * versions stay in a straight line: only the newest can be retried (in its place, with a new seed)
 * or deleted, and the one picked is the picture everywhere (`pickedVersion`).
 */
import { type FrameDeps, imageProgress, removeImage } from './frames.ts'
import { error } from './http.ts'
import type { EditModel } from './images/editModels.ts'
import type { EditOrder, JobEmit, JobKind } from './jobs.ts'
import { crossedLimit } from './limits.ts'
import { editJob } from './machine.ts'
import {
  changeRenderedPicture,
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
 * if it can. Without a picture it can still wait behind a render already queued (`pending`). Not
 * while another edit is queued or running on it, which it would be made from; a retry needs an
 * edit of its own to make again.
 */
export function checkEdit(
  session: Session,
  index: number,
  name: string,
  pending: readonly JobKind[],
  order: EditOrder,
): Response | null {
  const picture = shownPictureOf(session, index)
  const coming = pending.some((k) => k === 'render' || k === 'picture')
  if (!picture && !coming) return error(`${name} has no picture to edit yet`, 409)
  if (pending.includes('edit')) return error(`${name} is being edited: wait for it first`, 409)
  if (order.retry) {
    const newest = picture?.edits?.at(-1)
    if (!newest) return error(`${name} has no edit to retry`, 409)
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
 * version made from the newest, or the newest made again, as told now, with the next seed, in its
 * place. Saves it onto the picture, if it's still there and its newest version is still the one it
 * was made from, and picks it. Its painted area, saved when it was queued, is kept beside it.
 */
export async function editFrame<S extends Session>(
  deps: Pick<FrameDeps, 'store' | 'imageGenerator' | 'renderQueue'>,
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
  if (!picture) throw new EditError(`Frame ${index + 1} has no picture to edit`)
  const edits = picture.edits ?? []
  const redo = order.retry ? edits.at(-1) : undefined
  if (order.retry && (!redo || redo.copied)) {
    throw new EditError(`Frame ${index + 1} has no edit to make again`)
  }
  // Made from the newest version; a retry, from the one before the edit it replaces.
  const from = (redo ? edits.at(-2) : edits.at(-1)) ?? picture
  const dir = deps.store.dir(session.id)
  const name = `edit-${index}-${crypto.randomUUID().slice(0, 8)}`
  const { instruction, mask } = order
  const seed = redo ? redo.seed + 1 : session.seed
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: editJob(model, session.settings) })
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    const { onProgress, onDownload } = imageProgress(emit)
    const image = await deps.imageGenerator.edit(
      {
        model,
        imageBaseUrl: session.settings.imageBaseUrl,
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
      seed,
      ...(mask && { mask }),
      timings: { ...(queued !== undefined ? { queued } : {}), edit: secondsSince(began) },
    }
    let replaced: PictureEdit | undefined
    const updated = await save((latest) =>
      changeRenderedPicture(latest, picture.image, (p) => {
        const now = p.edits ?? []
        const newest = now.at(-1) ?? p
        if (newest.image !== (redo ?? from).image) {
          throw new PictureGoneError('That picture changed while it was being edited')
        }
        if (redo) replaced = now.at(-1)
        const kept = redo ? now.slice(0, -1) : now
        return { ...p, edits: [...kept, edit], picked: kept.length + 1 }
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
    if (!picture) throw new VersionError(`Frame ${index + 1} has no picture`)
    const count = picture.edits?.length ?? 0
    if (!Number.isInteger(picked) || picked < 0 || picked > count) {
      throw new VersionError(`Frame ${index + 1}'s picture has no version ${picked}`)
    }
    return changeRenderedPicture(latest, picture.image, (p) => ({ ...p, picked }))
  })
}

/**
 * Deletes the newest edit of the picture Frame `index` shows, with what was made from it and its
 * painted area. If it was picked, the version before it is picked instead.
 */
export async function deleteNewestEdit(
  store: SessionStore,
  session: Session,
  index: number,
): Promise<Session> {
  let gone: PictureEdit | undefined
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    const picture = shownPictureOf(latest, index)
    gone = picture?.edits?.at(-1)
    if (!picture || !gone) throw new VersionError(`Frame ${index + 1}'s picture has no edit`)
    return changeRenderedPicture(latest, picture.image, (p) => {
      const edits = p.edits!.slice(0, -1)
      const picked = Math.min(p.picked ?? 0, edits.length)
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
