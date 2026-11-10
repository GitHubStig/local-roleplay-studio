import { useEventListener } from '@vueuse/core'
import { type Ref, ref, watch } from 'vue'
import { imageUrl, type Job, type JobKind } from '../api'
import type { Reply, RoleplayFrame, RoleplaySession, Speech } from './api'

/** What of a Reply is spoken: its dialogue, or the Character's thought (whispered). */
export type Part = 'dialogue' | 'thought'
const SPEAK_JOB = { dialogue: 'speak', thought: 'speak-thought' } as const
const speechOf = (frame: RoleplayFrame, part: Part) =>
  part === 'thought' ? frame.thoughtSpeech : frame.speech
/** Whether a part has words to say aloud (a Reply of only "…" doesn't). */
export const canSpeak = (frame: { reply: Reply }, part: Part = 'dialogue') =>
  /[A-Za-z]/.test(part === 'thought' ? frame.reply.internal : frame.reply.dialogue)
/** How a spoken line was directed, in a few words: "slowly, with a sigh"; '' if plainly. */
export function deliveryWords(speech?: Speech): string {
  const d = speech?.delivery
  if (!d) return ''
  const pace = { normal: '', slow: 'slowly', fast: 'quickly' }[d.pace]
  const sound = { none: '', sigh: 'a sigh', laughter: 'a laugh', cough: 'a cough' }[d.sound]
  return [pace, sound && `with ${sound}`].filter(Boolean).join(', ')
}
/** What's playing is named by its Frame's part: `3`, `3:thought`. */
export const partKey = (index: number, part: Part) =>
  part === 'thought' ? `${index}:thought` : `${index}`

/**
 * Listening to a Roleplay: the Character's lines and thoughts played, each spoken first (a `speak`
 * job) if it hasn't been in the voice as it is now, and the voice's own clip. One thing plays at a
 * time.
 */
export function useListening(opts: {
  sessionId: string
  session: Ref<RoleplaySession | null | undefined>
  jobs: Ref<Job[]>
  hasJob: (index: number, kind: JobKind) => boolean
  queue: (kind: JobKind, index: number) => unknown
  /** Voices are on: a line not yet spoken can be. */
  voicesOn: () => boolean
}) {
  const { session, jobs, hasJob } = opts
  /** A part's audio is in the Character's voice as it is now. */
  const spokenNow = (speech?: Speech) => !!speech && speech.ref === session.value?.voice?.ref
  /** A line can be listened to: voices are on, or it was already spoken. */
  const canListen = (speech: Speech | undefined) => opts.voicesOn() || spokenNow(speech)

  const player = new Audio()
  /** What's playing: a Frame's part (`partKey`), or 'voice' for the voice's reference clip. */
  const playing = ref<string | null>(null)
  function stopAudio() {
    player.pause()
    playing.value = null
  }
  useEventListener(player, 'ended', () => (playing.value = null))
  function play(file: string, what: string) {
    stopAudio()
    player.src = imageUrl(opts.sessionId, file)
    // Browsers return a promise; some test environments return nothing.
    Promise.resolve(player.play()).then(() => (playing.value = what), () => (playing.value = null))
  }

  /** Parts to play once they've been spoken: asked to Listen to, or new while autoplay is on. */
  const toPlay = new Map<string, { index: number; part: Part }>()
  /** Plays a Frame's part once it's been spoken, as a job already queued will. */
  const playWhenSpoken = (index: number, part: Part) =>
    toPlay.set(partKey(index, part), { index, part })
  /**
   * Plays a Frame's line or thought, speaking it first (in the voice as it is now) if it hasn't
   * been, or was spoken in an earlier voice.
   */
  function listen(index: number, part: Part = 'dialogue') {
    const frame = session.value?.frames[index]
    if (!frame) return
    const key = partKey(index, part)
    if (playing.value === key) return stopAudio()
    const speech = speechOf(frame, part)
    if (speech && spokenNow(speech)) return play(speech.file, key)
    playWhenSpoken(index, part)
    if (!hasJob(index, SPEAK_JOB[part])) opts.queue(SPEAK_JOB[part], index)
  }
  // Play what was waiting to be spoken, once it is; forget it if speaking failed or it was undone.
  watch([() => session.value?.frames, jobs], () => {
    for (const [key, { index, part }] of [...toPlay]) {
      const frame = session.value?.frames[index]
      const failed = jobs.value.some((j) =>
        j.frameIndex === index && j.kind === SPEAK_JOB[part] && j.status === 'failed'
      )
      const speech = frame && speechOf(frame, part)
      if (!frame || failed) toPlay.delete(key)
      else if (speech && spokenNow(speech) && !hasJob(index, SPEAK_JOB[part])) {
        toPlay.delete(key)
        play(speech.file, key)
      }
    }
  })

  return { canListen, spokenNow, playing, stopAudio, play, listen, playWhenSpoken }
}
