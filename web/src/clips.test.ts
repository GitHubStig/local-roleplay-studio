import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import type { Clip, Picture } from './api'
import { clipCount, usePlayingClip } from './clips'

describe('usePlayingClip', () => {
  it('stops the clip once another Frame is selected, not on its own', async () => {
    const selected = ref(2)
    const playing = usePlayingClip(() => selected.value)
    const clip = { kind: 'idle-loop', file: 'clip-2-idle-loop-00000000.mp4' } as Clip
    playing.value = { index: 2, clip }
    selected.value = 2
    await nextTick()
    expect(playing.value).toEqual({ index: 2, clip })
    selected.value = 3
    await nextTick()
    expect(playing.value).toBeNull()
    // Back on its Frame, it stays stopped.
    selected.value = 2
    await nextTick()
    expect(playing.value).toBeNull()
  })
})

describe('clipCount', () => {
  it("counts a picture's clips only when it's by the Session's Image Model", () => {
    const picture = { image: 'a.png', imageModel: 'krea-2', clips: [{}, {}] } as Picture
    expect(clipCount(picture, 'krea-2')).toBe(2)
    // Shown only until the Session's model renders the Frame: its clips aren't counted.
    expect(clipCount(picture, 'qwen-image-2.1-turbo')).toBe(0)
    expect(clipCount(undefined, 'krea-2')).toBe(0)
  })
})
