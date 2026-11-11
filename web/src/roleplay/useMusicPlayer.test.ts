import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { musicAt, useMusicPlayer } from './useMusicPlayer'

/** The engine's sound, stood in for: what it's asked to play, and whether it's stopped. */
const engine = vi.hoisted(() => ({ played: [] as (string | null)[], stopped: 0 }))
vi.mock('./musicEngine', () => ({
  MusicEngine: class {
    play(file: string | null) {
      engine.played.push(file)
    }
    stop() {
      engine.stopped++
    }
    leave() {}
    setVolume() {}
    setDucked() {}
    setHushed() {}
  },
}))

const track = { file: 'a.flac', seconds: 60, bpm: 68, seed: 1, timings: { music: 19 } }
const cue = (id: string, extra = {}) => ({
  id,
  start: 0,
  entry: 'gentle' as const,
  reading: '',
  line: '',
  ...extra,
})
const values = { mood: 'wary' } as never
const at = (cueId: string) => ({ music: { cue: cueId } }) as never

describe('musicAt', () => {
  const session = {
    cues: [
      cue('playing', { values, track }),
      cue('sharp', { values, track: { ...track, file: 'b.flac' }, entry: 'sharp' }),
      cue('waiting', { values }),
      cue('silent'),
    ],
  }
  it("gives a Frame its Cue's track, with how it comes in", () => {
    expect(musicAt(session, at('playing'))).toEqual({ file: 'a.flac', entry: 'gentle' })
    expect(musicAt(session, at('sharp'))).toEqual({ file: 'b.flac', entry: 'sharp' })
  })
  it('gives two Frames of one Cue the same track', () => {
    expect(musicAt(session, at('playing'))?.file).toBe(musicAt(session, at('playing'))?.file)
  })
  it('says silence for a silence', () => {
    expect(musicAt(session, at('silent'))).toEqual({ file: null, entry: 'gentle' })
  })
  it("says nothing when it can't tell, so what's playing plays on", () => {
    expect(musicAt(session, at('waiting'))).toBeUndefined()
    expect(musicAt(session, { music: undefined } as never)).toBeUndefined()
    expect(musicAt(session, null)).toBeUndefined()
  })
})

describe('useMusicPlayer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('stops at once when Music is turned off in Settings, and plays nothing until it is back on', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        close() {}
      },
    )
    localStorage.setItem('roleplay-music-playing', '1')
    engine.played = []
    engine.stopped = 0
    const allowed = ref(true)
    const session = ref({ cues: [cue('playing', { values, track })] } as never)
    const scope = effectScope()
    scope.run(() =>
      useMusicPlayer({
        sessionId: 'r1',
        session,
        frame: ref(at('playing')),
        speaking: ref(false),
        allowed,
      })
    )
    expect(engine.played).toEqual(['a.flac'])
    allowed.value = false
    await nextTick()
    expect(engine.stopped).toBe(1)
    expect(engine.played).toEqual(['a.flac'])
    allowed.value = true
    await nextTick()
    expect(engine.played).toEqual(['a.flac', 'a.flac'])
    scope.stop()
  })
})
