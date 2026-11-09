import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FADES, LOOP_CROSSFADE, MusicEngine, soundingEnd, TURN_ON_FADE } from './musicEngine'

/** A stand-in for Web Audio, enough to read what was scheduled. */
function fakeContext() {
  const sources: {
    file?: string
    started: [number, number, number][]
    stopped: number[]
    gain: { ramps: [number, number][] }
  }[] = []
  const ctx = {
    currentTime: 0,
    destination: {},
    state: 'running',
    createGain() {
      const ramps: [number, number][] = []
      return {
        connect() {},
        ramps,
        gain: {
          value: 1,
          setTargetAtTime() {},
          setValueAtTime() {},
          cancelScheduledValues() {},
          linearRampToValueAtTime: (v: number, t: number) => ramps.push([v, t]),
        },
      }
    },
    createBufferSource() {
      const source = {
        started: [] as [number, number, number][],
        stopped: [] as number[],
        gain: { ramps: [] as [number, number][] },
        buffer: null as unknown,
        connect(gain: { ramps: [number, number][] }) {
          source.gain = gain
        },
        start(when: number, offset: number, length: number) {
          source.started.push([when, offset, length])
        },
        stop(when: number) {
          source.stopped.push(when)
        },
      }
      sources.push(source)
      return source
    },
  }
  return { ctx: ctx as unknown as AudioContext, sources, raw: ctx }
}

/** A minute at 100 samples a second: sound for 50 s, then silence. */
const buffer = () => {
  const samples = new Float32Array(6000)
  samples.fill(0.5, 0, 5000)
  return { sampleRate: 100, getChannelData: () => samples } as unknown as AudioBuffer
}

describe('soundingEnd', () => {
  it('cuts the silent tail', () => {
    const samples = new Float32Array(1000).fill(0.5, 0, 800)
    expect(soundingEnd(samples, 100)).toBeCloseTo(8, 0)
  })
  it('never cuts past half way', () => {
    expect(soundingEnd(new Float32Array(1000), 100)).toBe(5)
  })
})

describe('MusicEngine', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('plays on when asked for the track already playing', async () => {
    const { ctx, sources } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    await engine.play('a.flac')
    await engine.play('a.flac')
    expect(sources.length).toBe(1)
    expect(sources[0].stopped).toEqual([])
  })

  it('loops from where the sound ends, crossfading into its start', async () => {
    const { ctx, sources } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    await engine.play('a.flac')
    expect(sources[0].started[0][2]).toBeCloseTo(50, 0)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(sources.length).toBe(2)
    const next = sources[1].started[0][0]
    expect(next).toBeCloseTo(50 - LOOP_CROSSFADE, 0)
    expect(sources[0].stopped[0]).toBeCloseTo(50, 0)
    engine.stop()
  })

  it('says where the track is, starting again as it loops', async () => {
    const { ctx, raw } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    expect(engine.position).toBe(null)
    await engine.play('a.flac')
    raw.currentTime = 20
    expect(engine.position?.file).toBe('a.flac')
    expect(engine.position?.at).toBe(20)
    expect(engine.position?.length).toBeCloseTo(50 - LOOP_CROSSFADE, 0)
    // The next time round is queued a little early: until it comes in, this one's still counted.
    raw.currentTime = 46
    await vi.advanceTimersByTimeAsync(46_000)
    expect(engine.position?.at).toBeCloseTo(46, 0)
    // It fills as the next time round comes in, and begins again there.
    raw.currentTime = 49
    expect(engine.position?.at).toBeCloseTo(2, 0)
    engine.stop()
    expect(engine.position).toBe(null)
  })

  it('stops at once, and can play the same track again', async () => {
    const { ctx, sources } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    await engine.play('a.flac')
    engine.stop()
    const [level, at] = sources[0].gain.ramps.at(-1)!
    expect(level).toBe(0)
    expect(at).toBeLessThan(0.1)
    await engine.play('a.flac')
    expect(sources.length).toBe(2)
    engine.stop()
  })

  it('fades in over a second when turned on, and as the Director says after a silence', async () => {
    const { ctx, sources } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    await engine.play('a.flac')
    expect(sources[0].gain.ramps[0]).toEqual([1, TURN_ON_FADE])
    await engine.play(null, 'gentle')
    await engine.play('b.flac', 'gentle')
    expect(sources[1].gain.ramps[0]).toEqual([1, FADES.gentle])
    engine.stop()
    await engine.play('b.flac', 'gentle')
    expect(sources[2].gain.ramps[0]).toEqual([1, TURN_ON_FADE])
    engine.stop()
  })

  it('crossfades to another track, quickly if the change is sharp, and fades to silence', async () => {
    const { ctx, sources } = fakeContext()
    const engine = new MusicEngine(ctx, () => Promise.resolve(buffer()))
    await engine.play('a.flac')
    await engine.play('b.flac', 'gentle')
    expect(sources[1].gain.ramps[0]).toEqual([1, FADES.gentle])
    expect(sources[0].gain.ramps.at(-1)).toEqual([0, FADES.gentle])
    await engine.play('c.flac', 'sharp')
    expect(sources[2].gain.ramps[0]).toEqual([1, FADES.sharp])
    await engine.play(null, 'gentle')
    expect(sources[2].gain.ramps.at(-1)).toEqual([0, FADES.gentle])
    expect(engine.file).toBe(null)
  })

  it("doesn't start a track that finishes loading after another was asked for", async () => {
    const { ctx, sources } = fakeContext()
    let finish!: (b: AudioBuffer) => void
    const load = vi.fn((file: string) =>
      file === 'slow.flac'
        ? new Promise<AudioBuffer>((r) => (finish = r))
        : Promise.resolve(buffer())
    )
    const engine = new MusicEngine(ctx, load)
    const slow = engine.play('slow.flac')
    await engine.play('quick.flac')
    finish(buffer())
    await slow
    expect(sources.length).toBe(1)
    expect(engine.file).toBe('quick.flac')
    engine.stop()
  })
})
