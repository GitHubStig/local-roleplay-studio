import { join } from '@std/path'
import { frameName, secondsSince } from '../frames.ts'
import type { ClipOrder, JobEmit } from '../jobs.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { Session, SessionStore } from '../session.ts'
import { anyImageModel } from '../images/imageModels.ts'
import { changeFramePicture, pickedVersion } from '../pictures.ts'
import { CLIP_ENDS, type ClipKind, type VideoGenerator } from './videoGenerator.ts'

/**
 * A clip made from a picture (ADR 0025), kept on the picture version it was made from:
 * one of each kind, a new one replacing the old.
 */
export interface Clip {
  kind: ClipKind
  /** The video model that made it (`comfyui/models.ts`). */
  model: string
  /** File name of the clip (an MP4) inside the Session directory. */
  file: string
  /** What it was told happens, and whether anyone could speak. */
  prompt: string
  speech: boolean
  seconds: number
  seed: number
  /** Into Next's last picture: the next Frame's image it ends on. */
  next?: string
  /** Seconds it waited for another render (only if it had to) and took. */
  timings: { queued?: number; clip: number }
}

export interface ClipDeps {
  store: SessionStore
  /** LTX 2.5 on a ComfyUI, when clips are available. */
  video?: VideoGenerator
  /** The video model chosen in Settings now: read as the clip starts, as Upscale's upscaler is. */
  videoModel(): Promise<string>
  renderQueue?: RenderQueue
}

export class ClipError extends Error {}

/** Why no clip can be made: no video generator is set up. */
export const CLIPS_OFF = "Clips aren't set up on this server"

/** The picked version of Frame `index`'s picture by Image Model `model`, if it has one. */
const versionBy = (session: Session, index: number, model: string) => {
  const picture = session.frames[index]?.pictures.find((p) => p.imageModel === model)
  return picture && pickedVersion(picture)
}

/**
 * Why a clip of `kind` can't be made from Frame `index` of `session` (named `name`) by Image Model
 * `model` (the Session's, unless given), or null if it can. A clip is of a picture by that model,
 * not one by another the Frame shows until it renders: unless one is `coming` (a render queued
 * ahead). Into Next needs the next Frame's picture by it, now (another Frame's render isn't
 * waited for).
 */
export function clipRefusal(
  session: Session,
  index: number,
  kind: ClipKind,
  name: string,
  model = session.settings.imageModel,
  coming = false,
) {
  const label = anyImageModel(model)?.label ?? model
  if (!coming && !versionBy(session, index, model)) return `${name} has no picture by ${label} yet`
  if (kind === 'into-next' && !versionBy(session, index + 1, model)) {
    return `${name}'s next Frame has no picture by ${label} to end on`
  }
  return null
}

/**
 * Makes a clip from Frame `index`'s picture by Image Model `model` (the one it was queued for,
 * whatever the Session shows now), as `order` says, in its turn behind any render: LTX 2.5 takes a
 * whole 12 GB card. Into Next ends on the next Frame's picture by the same model.
 * Saved onto the picture it was made from, if the Frame still has it.
 */
export async function makeClip<S extends Session>(
  deps: ClipDeps,
  session: S,
  index: number,
  order: ClipOrder,
  model: string | undefined,
  emit: JobEmit,
  signal: AbortSignal,
  /** Saves the change onto the Session as it is now (`updateSession`). */
  save: (change: (s: S) => S) => Promise<S>,
): Promise<S> {
  if (!deps.video) throw new ClipError(CLIPS_OFF)
  const by = model ?? session.settings.imageModel
  const refused = clipRefusal(session, index, order.kind, frameName(index), by)
  if (refused) throw new ClipError(refused)
  const picture = versionBy(session, index, by)!
  const next = order.kind === 'into-next' ? versionBy(session, index + 1, by)!.image : undefined
  const ends = CLIP_ENDS[order.kind]
  const videoModel = await deps.videoModel()
  const pictureAt = (end?: 'still' | 'next') => end === 'still' ? picture.image : end && next
  const dir = deps.store.dir(session.id)
  const name = `clip-${index}-${order.kind}-${crypto.randomUUID().slice(0, 8)}`
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: { kind: 'video' } })
  let file: string | undefined
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    file = await deps.video.makeClip(
      {
        model: videoModel,
        first: pictureAt(ends.first),
        last: pictureAt(ends.last),
        prompt: order.prompt,
        speech: order.speech,
        seconds: order.seconds,
        seed: session.seed,
        dir,
        name,
      },
      signal,
      (step, total) => emit({ type: 'progress', step, total }),
    )
    signal.throwIfAborted()
    const clip: Clip = {
      kind: order.kind,
      model: videoModel,
      file,
      prompt: order.prompt,
      speech: order.speech,
      seconds: order.seconds,
      seed: session.seed,
      ...(next && { next }),
      timings: { ...(queued !== undefined ? { queued } : {}), clip: secondsSince(began) },
    }
    let replaced: string | undefined
    const updated = await save((latest) =>
      changeFramePicture(latest, picture.image, (p) => {
        replaced = p.clips?.find((c) => c.kind === clip.kind)?.file
        return { ...p, clips: [...(p.clips ?? []).filter((c) => c.kind !== clip.kind), clip] }
      })
    )
    if (replaced) await Deno.remove(join(dir, replaced)).catch(() => {})
    emit({ type: 'clipped' })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file ?? `${name}.mp4`)).catch(() => {})
    throw err
  } finally {
    release()
  }
}
