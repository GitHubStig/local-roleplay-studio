/**
 * Plays a Roleplay's music with Web Audio (docs/music-plans.md, ADR 0035): one track at a time, looped
 * with its fade-out cut and a crossfade into its start, and changed with a crossfade, or a quick cut
 * when the Director says the change is sharp. It holds no idea of the story: `useMusicPlayer` says what
 * should be playing.
 */

/** Seconds a track's end crossfades into its start: 2 s sounded too fast, 4 s maybe too long (the owner). */
export const LOOP_CROSSFADE = 3
/** Seconds a gentle change crossfades over, and a sharp one: 0.3 s was close to instant (the owner). */
export const FADES = { gentle: 3, sharp: 1 } as const
/** Seconds it takes to fall silent for a video, or when turned off. */
export const HUSH_FADE = 0.05
/** Seconds it fades in when turned on: after a click, the 3 s of a gentle change is a long wait. */
export const TURN_ON_FADE = 1
/** How far the music falls while a line is spoken. */
export const DUCKED = 0.25
/** The level a track's fade-out begins below, in dB: what the bench cut its loops at. */
const SOUNDING_DB = -55

export type MusicEntry = keyof typeof FADES

/**
 * Where the track playing is in its loop: seconds since it last began, and seconds from one beginning
 * to the next, which leaves out the crossfade, so it fills just as the track comes round again.
 */
export interface MusicPosition {
  file: string
  at: number
  length: number
}

/**
 * Where a track stops sounding, in seconds: each ends in a fade to near silence, which a loop has to
 * cut, or it sounds as if the music had stopped (the owner, by ear). Looks back from the end by 50 ms
 * windows; never before half way, so a very quiet track still loops whole enough.
 */
export function soundingEnd(samples: Float32Array, rate: number, floorDb = SOUNDING_DB): number {
  const size = Math.max(1, Math.round(rate * 0.05))
  const floor = 10 ** (floorDb / 20)
  const half = Math.floor(samples.length / 2)
  for (let end = samples.length; end > half; end -= size) {
    const start = Math.max(0, end - size)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    if (Math.sqrt(sum / (end - start)) >= floor) return end / rate
  }
  return half / rate
}

/** What's sounding: a source and the gain that fades it. */
interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
}

export class MusicEngine {
  #ctx: AudioContext
  #load: (file: string) => Promise<AudioBuffer>
  #master: GainNode
  #volume = 1
  #ducked = false
  #hushed = false
  #hush: ReturnType<typeof setTimeout> | undefined
  #file: string | null = null
  #voice: Voice | null = null
  #loop: ReturnType<typeof setTimeout> | undefined
  /** Which call to `play` is the latest: a track that finishes loading late isn't started. */
  #asked = 0
  /** Just turned on: the next track comes in as that, rather than as a change. */
  #turnedOn = true
  /** The time round playing, and the one before, while a next one waits to come in. */
  #rounds: { when: number; length: number }[] = []

  constructor(ctx: AudioContext, load: (file: string) => Promise<AudioBuffer>) {
    this.#ctx = ctx
    this.#load = load
    this.#master = ctx.createGain()
    this.#master.connect(ctx.destination)
  }

  /** The track playing, or none. */
  get file() {
    return this.#file
  }

  /** Where the track playing is, if one is. */
  get position(): MusicPosition | null {
    const file = this.#file
    const now = this.#ctx.currentTime
    const round = [...this.#rounds].reverse().find((r) => r.when <= now) ?? this.#rounds[0]
    if (!file || !round || !this.#voice) return null
    return { file, at: Math.min(Math.max(0, now - round.when), round.length), length: round.length }
  }

  /** Changes to `file` (none for silence), as `entry` says; the track playing already plays on. */
  async play(file: string | null, entry: MusicEntry = 'gentle') {
    if (file === this.#file) return
    const asked = ++this.#asked
    this.#file = file
    if (!file) return this.#fadeOut(FADES[entry])
    const buffer = await this.#load(file)
    if (asked !== this.#asked) return
    const fade = this.#turnedOn ? TURN_ON_FADE : FADES[entry]
    this.#turnedOn = false
    this.#fadeOut(fade)
    this.#rounds = []
    this.#start(
      buffer,
      soundingEnd(buffer.getChannelData(0), buffer.sampleRate),
      fade,
      this.#ctx.currentTime,
    )
  }

  /** Fades out as the player leaves the page; playing again starts afresh, as when turned on. */
  leave() {
    this.#asked++
    this.#file = null
    this.#turnedOn = true
    this.#fadeOut(FADES.sharp)
  }

  /** Stops at once, the player's asked it to or the page is going; playing again starts afresh. */
  stop() {
    this.#asked++
    this.#file = null
    this.#turnedOn = true
    this.#fadeOut(HUSH_FADE)
  }

  /** The player's volume, 0 to 1. */
  setVolume(volume: number) {
    this.#volume = volume
    this.#level()
  }

  /**
   * Silences the music in 0.05 s and freezes it where it is, while a video is open; `false` carries on
   * from there. Everything scheduled is on the context's own clock, so it freezes too.
   */
  setHushed(hushed: boolean) {
    this.#hushed = hushed
    clearTimeout(this.#hush)
    const { gain } = this.#master
    const now = this.#ctx.currentTime
    gain.cancelScheduledValues(now)
    if (hushed) {
      gain.setValueAtTime(gain.value, now)
      gain.linearRampToValueAtTime(0, now + HUSH_FADE)
      this.#hush = setTimeout(() => this.#ctx.suspend(), HUSH_FADE * 1000 + 10)
    } else {
      this.#ctx.resume()
      this.#level()
    }
  }

  /** Lowers the music while a line is spoken. */
  setDucked(ducked: boolean) {
    this.#ducked = ducked
    this.#level()
  }

  #level() {
    if (this.#hushed) return
    const level = this.#volume * (this.#ducked ? DUCKED : 1)
    this.#master.gain.setTargetAtTime(level, this.#ctx.currentTime, 0.1)
  }

  /** Starts a track at `when`, fading in, with the next time round queued to crossfade from its end. */
  #start(buffer: AudioBuffer, end: number, fade: number, when: number) {
    const source = this.#ctx.createBufferSource()
    const gain = this.#ctx.createGain()
    source.buffer = buffer
    source.connect(gain)
    gain.connect(this.#master)
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(1, when + fade)
    source.start(when, 0, end)
    const voice = { source, gain }
    this.#voice = voice
    this.#rounds = [...this.#rounds.slice(-1), { when, length: end - LOOP_CROSSFADE }]
    const next = when + end - LOOP_CROSSFADE
    // Set a little early, as timers run late in a page in the background.
    const wait = (next - this.#ctx.currentTime - 1.5) * 1000
    this.#loop = setTimeout(() => {
      this.#fadeOut(LOOP_CROSSFADE, next)
      this.#start(buffer, end, LOOP_CROSSFADE, next)
    }, Math.max(0, wait))
  }

  /** Fades out what's sounding, from `when`, and forgets it. */
  #fadeOut(seconds: number, when = this.#ctx.currentTime) {
    clearTimeout(this.#loop)
    const voice = this.#voice
    if (!voice) return
    this.#voice = null
    const { gain, source } = voice
    gain.gain.cancelScheduledValues(when)
    gain.gain.setValueAtTime(gain.gain.value, when)
    gain.gain.linearRampToValueAtTime(0, when + seconds)
    source.stop(when + seconds + 0.05)
  }
}
