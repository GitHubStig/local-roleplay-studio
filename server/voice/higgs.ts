import type { SpeakRequest } from './voice.ts'

/**
 * Higgs TTS 3's tags for how a line is spoken, written here once for both backends: the voice
 * service on the Mac (`python/voice/serve.py`, which speaks the text as it comes) and ComfyUI.
 * Lines carry no emotion tags, which pulled the cloned voice off the Character; a pace, a sound and
 * a whisper held it (docs/research/voices.md).
 */

// A sound is its tag followed at once by the sound itself, as Higgs's model card says.
const SOUNDS = { sigh: 'Uh', laughter: 'Heh', cough: 'Ahem' } as const
const PACES = { slow: '<|prosody:speed_slow|>', fast: '<|prosody:speed_fast|>' } as const
const PAUSE = '<|prosody:pause|>'

/**
 * A Character's thought: hushed and breathy, still in their voice. Tested on twelve thoughts
 * through mlx-audio, it stayed in each Character's pitch range, unlike the emotion tags.
 */
export const WHISPER = '<|style:whispering|>'

/**
 * The line with its tags: a sound before it, then a whisper, then its pace. A slow line also
 * pauses between sentences, but not after a one-word one: "Ah." or "Hm." and then a pause sent
 * Higgs into a loop of buzz or silence until mlx-audio's 82 s cap in 6 of 24 seeds, and in none
 * without that pause (2026-11-24, docs/research/voices.md).
 */
export function higgsText(
  req: Pick<SpeakRequest, 'text' | 'pace' | 'sound' | 'whisper'>,
  whisper = WHISPER,
): string {
  let text = req.text
  if (req.pace === 'slow') {
    const sentences = text.split(/(?<=[.!?…]) (?=\S)/)
    text = sentences.map((s, i) =>
      i === sentences.length - 1 ? s : `${s} ${s.split(/\s+/).length === 1 ? '' : PAUSE}`
    ).join('')
  }
  const sound = req.sound && req.sound !== 'none' ? req.sound : undefined
  const before = sound ? `<|sfx:${sound}|>${SOUNDS[sound]} ` : ''
  const pace = req.pace === 'slow' || req.pace === 'fast' ? PACES[req.pace] : ''
  return before + (req.whisper ? whisper : '') + pace + text
}

/** Higgs's audio frames a second, and the frames its codebooks' delay adds to every line. */
const FRAMES_A_SECOND = 25
const DELAY_FRAMES = 7

/**
 * Seconds of speech a line may take: a floor, and so much a character. Of 201 lines spoken from the
 * voice bench's texts on the Mac (2026-11-24: two voices, 45 of 67 slow, up to 411 characters), the
 * slowest took 0.12 s a character and none more than 44% of this; the two that ran on, into
 * silence, took 40 s at 114 characters (still going) and 26 s at 55 (ended by itself), past their
 * 27 and 15 (docs/research/voices.md).
 */
export const FLOOR_SECONDS = 4
export const SECONDS_A_CHARACTER = 0.2

/** The most ComfyUI's Higgs node takes. */
const MOST_FRAMES = 8192

/**
 * The most frames a line may take: about twice the longest a line of its length came out, so one
 * that takes them all ran on rather than ran long. Higgs's own cap is 2048 frames, 82 s, a
 * minute's work.
 */
export const maxFrames = (text: string) =>
  Math.min(
    Math.ceil((FLOOR_SECONDS + SECONDS_A_CHARACTER * text.length) * FRAMES_A_SECOND) + DELAY_FRAMES,
    MOST_FRAMES,
  )

/** How long a line of `frames` frames lasts. */
export const exactSecondsOf = (frames: number) => (frames - DELAY_FRAMES) / FRAMES_A_SECOND

/** The same, in whole seconds, to tell the player. */
export const secondsOf = (frames: number) => Math.round(exactSecondsOf(frames))
