import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import type { Clip } from '../api'
import ClipOverlay from './ClipOverlay.vue'

afterEach(() => sessionStorage.clear())

const clip = (kind: Clip['kind']): Clip => ({
  kind,
  file: `clip-0-${kind}-00000000.mp4`,
  prompt: 'She looks up.',
  seconds: 4,
  speech: false,
  seed: 1,
  timings: { clip: 9 },
})
const mountIt = (kind: Clip['kind']) =>
  mount(ClipOverlay, { props: { src: '/clip.mp4', clip: clip(kind) } })

describe('ClipOverlay', () => {
  it('closes at its end only for a Lead In, which ends on the picture under it', async () => {
    for (
      const [kind, closes] of [
        ['lead-in', true],
        ['play-out', false],
        ['into-next', false],
      ] as const
    ) {
      const wrapper = mountIt(kind)
      await wrapper.find('video').trigger('ended')
      expect(!!wrapper.emitted('close'), kind).toBe(closes)
    }
    expect(mountIt('idle-loop').find('video').attributes('loop')).toBeDefined()
  })

  it('starts each clip at the volume the last was left at', async () => {
    const first = mountIt('lead-in').find('video')
    const el = first.element as HTMLVideoElement
    el.volume = 0.3
    el.muted = true
    await first.trigger('volumechange')
    const next = mountIt('play-out').find('video')
    await next.trigger('loadedmetadata')
    expect([(next.element as HTMLVideoElement).volume, (next.element as HTMLVideoElement).muted])
      .toEqual([0.3, true])
  })

  it('closes when its screen is put away', async () => {
    const shown = ref(true)
    const closed: string[] = []
    const Screen = defineComponent(() => () =>
      h(ClipOverlay, {
        src: '/clip.mp4',
        clip: clip('idle-loop'),
        onClose: () => closed.push('closed'),
      })
    )
    const Other = defineComponent(() => () => h('p', 'Home'))
    const wrapper = mount(
      defineComponent(() => () => h(KeepAlive, null, [h(shown.value ? Screen : Other)])),
    )
    shown.value = false
    await wrapper.vm.$nextTick()
    expect(closed).toEqual(['closed'])
  })
})
