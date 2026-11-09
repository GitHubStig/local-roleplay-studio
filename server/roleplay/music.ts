/**
 * A Cue's music (docs/design.md, ADR 0035): the track a music model makes from its caption, in
 * its turn behind lines and pictures, kept with the Session and replaced when the Cue is.
 */
import { join } from '@std/path'
import { frameName, secondsSince } from '../frames.ts'
import type { JobEmit } from '../jobs.ts'
import type { ComfyTraces } from '../comfyui/traces.ts'
import type { MusicGenerator } from '../music/musicGenerator.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SessionStore } from '../session.ts'
import { bpmOf, CUE_SECONDS } from './director.ts'
import type { Cue, RoleplaySession } from './types.ts'
import { updateSession } from './update.ts'

export interface MusicDeps {
  store: SessionStore
  /** The music model on a ComfyUI. */
  music?: MusicGenerator
  renderQueue?: RenderQueue
}

/** A Cue that can have a track: one with words for it, as those saved before them don't. */
const hasWords = (cue: Cue) => !!cue.values?.caption

/** The Frames of the Cues still waiting for a track, to queue their `music` jobs. */
export const cuesWaiting = (session: RoleplaySession): number[] =>
  (session.cues ?? []).filter((c) => hasWords(c) && !c.track).map((c) => c.start)

/** Why Frame `index` of `session` can't have a track made, or null if it can. */
export function musicRefusal(session: RoleplaySession, index: number): string | null {
  const cue = session.cues?.find((c) => c.start === index)
  if (!cue?.values) return `No music begins on ${frameName(index)}`
  if (!hasWords(cue)) {
    return `This Cue is from before the music model had words: direct ${frameName(index)} again`
  }
  return null
}

/**
 * Removes track files no Cue uses now: a Cue directed again, or undone, leaves its file behind. Each
 * Session makes its tracks one at a time, so none is being written.
 */
async function removeUnused(dir: string, session: RoleplaySession) {
  const used = new Set((session.cues ?? []).flatMap((c) => c.track ? [c.track.file] : []))
  for await (const { name } of Deno.readDir(dir)) {
    if (name.startsWith('music-') && !used.has(name)) {
      await Deno.remove(join(dir, name)).catch(() => {})
    }
  }
}

/**
 * Makes the track of the Cue beginning on Frame `index`, or picks up the one a restart cut off
 * (`left`). A Cue that has one gets a new take from its words, the next seed, replacing it once made,
 * so it plays on until then. Nothing to do if that Cue is gone. Saved onto the Cue if it's still there,
 * by its id: one directed again meanwhile gets its own job.
 */
export async function makeCueTrack(
  deps: MusicDeps,
  session: RoleplaySession,
  index: number,
  emit: JobEmit,
  signal: AbortSignal,
  left?: ComfyTraces,
): Promise<void> {
  if (!deps.music) throw new Error('Music is not set up on this server')
  const cue = session.cues?.find((c) => c.start === index)
  if (!cue?.values) return
  const refused = musicRefusal(session, index)
  if (refused) throw new Error(refused)
  const values = cue.values
  const dir = deps.store.dir(session.id)
  const name = `music-${cue.id}-${crypto.randomUUID().slice(0, 8)}`
  // Each Cue its own take, repeatable from the Session's seed; a new take, the next.
  const seed = cue.track ? cue.track.seed + 1 : session.seed + index
  const bpm = bpmOf(values.tempo, session.score!.tempo)
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  }, { job: { kind: 'music' } })
  let file: string | undefined
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'audio' })
    const began = performance.now()
    file = (left && await deps.music.pickUp?.(left, dir, name, signal)) ||
      await deps.music.makeMusic(
        {
          caption: values.caption,
          lyrics: values.lyrics,
          seconds: CUE_SECONDS,
          bpm,
          key: values.key,
          seed,
          dir,
          name,
        },
        signal,
        (step, total) => emit({ type: 'progress', step, total }),
      )
    signal.throwIfAborted()
    const track = {
      file,
      seconds: CUE_SECONDS,
      bpm,
      seed,
      timings: { ...(queued !== undefined ? { queued } : {}), music: secondsSince(began) },
    }
    const updated = await updateSession(deps.store, session.id, (latest) => ({
      ...latest,
      cues: latest.cues?.map((c) => c.id === cue.id ? { ...c, track } : c),
    }))
    await removeUnused(dir, updated)
    emit({ type: 'music' })
  } catch (err) {
    if (file) await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  } finally {
    release()
  }
}
