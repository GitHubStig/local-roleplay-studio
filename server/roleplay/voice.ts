/**
 * Voices: the Character speaks their lines. The first time a line is spoken, the Text Model
 * describes the Character's voice from the Cast (`prompts/roleplay/voice.md`), and the voice
 * service designs a voice from that description as a reference clip; every line is then spoken by
 * cloning the clip, so the Character sounds the same throughout. The description is editable;
 * changing it needs a new clip, and lines spoken in the old one are out of date.
 */
import { join } from '@std/path'
import { stringify } from '@std/yaml'
import { secondsSince } from '../frames.ts'
import { crossedLimit } from '../limits.ts'
import type { ChatMessage } from '../ollamaChat.ts'
import { loadPrompt } from '../promptFiles.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SessionStore } from '../session.ts'
import type { Delivery, VoiceEngine } from '../voice.ts'
import type { RoleplayModel } from './model.ts'
import type { RoleplaySession, RoleplayVoice, Speech } from './types.ts'
import { GoneError, updateSession } from './update.ts'

/** What every reference clip says: a few varied sentences, so the clip carries the whole voice. */
export const REF_TEXT =
  "I've heard a lot of stories in my time, and most of them weren't true. So sit down, take your " +
  'time, and tell me yours.'

/** How long a voice description may be, in characters. */
export const MAX_VOICE_LENGTH = 600

export const voiceSchema = {
  type: 'object',
  properties: { description: { type: 'string', description: 'the voice, in at most 50 words' } },
  required: ['description'],
}

export const deliverySchema = {
  type: 'object',
  properties: {
    pace: { type: 'string', enum: ['normal', 'slow', 'fast'] },
    sound: { type: 'string', enum: ['none', 'sigh', 'laughter', 'cough'] },
  },
  required: ['pace', 'sound'],
}

/** Reads a line's direction; anything it doesn't recognise is played as written. */
export function parseDelivery(value: unknown): Delivery {
  const v = (value ?? {}) as Record<string, unknown>
  const pick = <T extends string>(x: unknown, options: readonly T[], fallback: T): T =>
    options.includes(x as T) ? x as T : fallback
  return {
    pace: pick(v.pace, ['normal', 'slow', 'fast'] as const, 'normal'),
    sound: pick(v.sound, ['none', 'sigh', 'laughter', 'cough'] as const, 'none'),
  }
}

export class VoiceError extends Error {}

export interface VoiceDeps {
  store: SessionStore
  /** Writes the voice description: the Art Agent's model, as for the Look. */
  model: RoleplayModel
  voice?: VoiceEngine
  renderQueue?: RenderQueue
}

export type VoiceEvent =
  | { type: 'phase'; phase: 'text' | 'queued' | 'audio' }
  | { type: 'voice'; voice: RoleplayVoice; session: RoleplaySession }
  | { type: 'spoken'; index: number; speech: Speech; session: RoleplaySession }

/** The call that describes the Character's voice from the Cast. */
export async function voiceMessages(session: RoleplaySession): Promise<ChatMessage[]> {
  if (!session.cast) throw new VoiceError('This Roleplay has no Cast yet')
  const character = stringify(session.cast.character, { lineWidth: 100 }).trim()
  return [
    { role: 'system', content: await loadPrompt('roleplay/voice', { character }) },
    { role: 'user', content: 'Describe the voice.' },
  ]
}

/** The call that directs how Frame `index`'s line is spoken, from the moment around it. */
export async function deliveryMessages(
  session: RoleplaySession,
  index: number,
): Promise<ChatMessage[]> {
  const cast = session.cast
  const frame = session.frames[index]
  if (!cast || !frame) throw new VoiceError(`There is no Frame ${index}`)
  return [
    { role: 'system', content: await loadPrompt('roleplay/voice-delivery', { ...cast }) },
    {
      role: 'user',
      content: await loadPrompt('roleplay/voice-delivery-request', {
        ...cast,
        message: frame.message ?? 'none: this opens the scene',
        actions: frame.reply.actions || 'nothing',
        internal: frame.reply.internal || 'nothing',
        line: speakable(frame.reply.dialogue),
      }),
    },
  ]
}

/**
 * What of a Reply's dialogue is spoken: the words, without emphasis marks; nothing if it's only
 * an ellipsis or a sound.
 */
export function speakable(dialogue: string): string {
  const text = dialogue.replace(/[*_~]+/g, '').replace(/\s+/g, ' ').trim()
  return /[A-Za-z]/.test(text) ? text : ''
}

const voiceFile = () => `voice-${crypto.randomUUID().slice(0, 8)}.wav`
const speechFile = (index: number) => `speech-${index}-${crypto.randomUUID().slice(0, 8)}.wav`

const engine = (deps: VoiceDeps) => {
  if (!deps.voice) throw new VoiceError("Voices aren't available on this server")
  return deps.voice
}

/** Waits its turn behind any render, so a voice and an image never compete for memory. */
async function inTurn<T>(
  deps: VoiceDeps,
  emit: (event: VoiceEvent) => void,
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<{ result: T; queued?: number }> {
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  })
  try {
    emit({ type: 'phase', phase: 'audio' })
    return { result: await work(), ...(waited ? { queued: secondsSince(start) } : {}) }
  } finally {
    release()
  }
}

/**
 * Designs a new take of the Character's voice: describes it from the Cast first if it has no
 * description, then makes a new reference clip, replacing the old one. Lines spoken in the old one
 * are out of date from then on.
 */
export async function designVoice(
  deps: VoiceDeps,
  session: RoleplaySession,
  emit: (event: VoiceEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  const voice = engine(deps)
  let described = session.voice
  if (!described?.description) {
    emit({ type: 'phase', phase: 'text' })
    const { description } = await deps.model.writeVoice(await voiceMessages(session), signal)
    const limit = crossedLimit(description)
    if (limit) throw new VoiceError(`The voice description crossed a limit: ${limit.message}`)
    described = { description, model: deps.model.name }
  }
  const dir = deps.store.dir(session.id)
  await Deno.mkdir(dir, { recursive: true })
  const ref = voiceFile()
  try {
    await inTurn(deps, emit, signal, () =>
      voice.design({
        description: described.description,
        text: REF_TEXT,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        out: join(dir, ref),
      }, signal))
    signal.throwIfAborted()
    let old: string | undefined
    const updated = await updateSession(deps.store, session.id, (latest) => {
      old = latest.voice?.ref
      // A description edited meanwhile wins; this take is of the one it was asked for.
      return { ...latest, voice: { ...described, ref } }
    })
    if (old && old !== ref) await Deno.remove(join(dir, old)).catch(() => {})
    emit({ type: 'voice', voice: updated.voice!, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, ref)).catch(() => {})
    throw err
  }
}

/**
 * Speaks Frame `index`'s dialogue in the Character's voice, designing the voice first if it has
 * none. Speaking a Frame again replaces its audio.
 */
export async function speakFrame(
  deps: VoiceDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: VoiceEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  const voice = engine(deps)
  const frame = session.frames[index]
  if (!frame) throw new VoiceError(`There is no Frame ${index}`)
  const text = speakable(frame.reply.dialogue)
  if (!text) throw new VoiceError(`Frame ${index} has nothing to say aloud`)
  let current = session
  if (!current.voice?.ref) current = await designVoice(deps, current, emit, signal)
  const ref = current.voice!.ref!
  // How it's said: a pace and a sound. A failed direction isn't a failed line: it's said as written.
  emit({ type: 'phase', phase: 'text' })
  const delivery = await deps.model.directLine(await deliveryMessages(current, index), signal)
    .catch((err) => {
      signal.throwIfAborted()
      console.warn(`Directing Frame ${index}'s line failed; speaking it as written:`, err.message)
      return undefined
    })
  const dir = deps.store.dir(session.id)
  const file = speechFile(index)
  try {
    const { result: audio, queued } = await inTurn(deps, emit, signal, async () => {
      const start = performance.now()
      await voice.speak(
        {
          text,
          ...delivery,
          ref: join(dir, ref),
          refText: REF_TEXT,
          seed: session.seed + index,
          out: join(dir, file),
        },
        signal,
      )
      return secondsSince(start)
    })
    signal.throwIfAborted()
    const speech: Speech = {
      file,
      ref,
      timings: { ...(queued ? { queued } : {}), audio },
      ...(delivery ? { delivery } : {}),
    }
    let old: string | undefined
    const updated = await updateSession(deps.store, session.id, (latest) => {
      const now = latest.frames[index]
      if (!now) throw new GoneError(`Frame ${index} no longer exists`)
      old = now.speech?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.index === index ? { ...f, speech } : f)),
      }
    })
    if (old && old !== file) await Deno.remove(join(dir, old)).catch(() => {})
    emit({ type: 'spoken', index, speech, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  }
}

/**
 * Replaces the voice description, edited by hand. The old clip no longer matches it, so it's
 * removed: the next line spoken (or Design voice) designs a new one.
 */
export async function setVoiceDescription(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  const description = typeof (value as { description?: unknown } | null)?.description === 'string'
    ? (value as { description: string }).description.replace(/\s+/g, ' ').trim()
    : ''
  if (!description) throw new VoiceError('The voice needs a description')
  if (description.length > MAX_VOICE_LENGTH) {
    throw new VoiceError(`A voice description can be at most ${MAX_VOICE_LENGTH} characters`)
  }
  const limit = crossedLimit(description)
  if (limit) throw new VoiceError(`That crosses a limit: ${limit.message}`)
  let old: string | undefined
  const updated = await updateSession(store, session.id, (latest) => {
    if (latest.voice?.description === description) return latest
    old = latest.voice?.ref
    return { ...latest, voice: { description } }
  })
  if (old) await Deno.remove(join(store.dir(session.id), old)).catch(() => {})
  return updated
}
