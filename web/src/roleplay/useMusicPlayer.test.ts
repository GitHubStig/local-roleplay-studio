import { describe, expect, it } from 'vitest'
import { musicAt } from './useMusicPlayer'

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
