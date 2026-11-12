import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import type { PicturedFrame } from '../api'
import AllFrames from './AllFrames.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getSettingsOptions: vi.fn(() => new Promise(() => {})),
  getStyleScores: vi.fn(() => Promise.reject(new Error('Not scored yet'))),
  listJobs: vi.fn(() => Promise.resolve([])),
}))

enableAutoUnmount(afterEach)

type Frame = PicturedFrame & { says: string }
const picture = (image: string, imageModel: string) => ({ image, imageModel })
const frames: Frame[] = [
  {
    index: 0,
    says: 'A letter on the bar',
    pictures: [picture('f0-a.png', 'a'), picture('f0-b.png', 'b')],
  },
  { index: 1, says: 'The storm gets worse', pictures: [] },
  { index: 2, says: 'He burns the letter', pictures: [picture('f2-a.png', 'a')] },
]
const tiles = (of: Frame[]) =>
  of.map((f) => ({
    index: f.index,
    words: f.says,
    thumb: f.pictures[0] ? `/p/${f.pictures[0].image}` : null,
  }))

const mountIt = (of = frames) =>
  mount(AllFrames<Frame>, {
    props: {
      open: true,
      sessionId: 's1',
      frames: of,
      tiles: tiles(of),
      text: (f: Frame) => f.says,
      picked: 1,
      imageModel: 'a',
      'onUpdate:open': () => {},
    },
    attachTo: document.body,
  })

describe('AllFrames', () => {
  it('shows every Frame as a tile, the picked one marked; picking one closes it', async () => {
    const wrapper = mountIt()
    await flushPromises()
    const sheet = wrapper.findAll('[data-sheet-tile]')
    expect(sheet.map((t) => t.text())).toEqual([
      '1 · A letter on the bar',
      'The storm gets worse2 · The storm gets worse',
      '3 · He burns the letter',
    ])
    expect(sheet[1].attributes('aria-current')).toBe('true')
    await sheet[2].trigger('click')
    expect(wrapper.emitted('pick')).toEqual([[2]])
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('searches what the Frames say, marking the matches and fading the rest', async () => {
    const wrapper = mountIt()
    await flushPromises()
    await wrapper.find('[data-search]').setValue('the LETTER')
    expect(wrapper.findAll('[data-sheet-tile]').map((t) => t.attributes('data-match'))).toEqual([
      'true',
      undefined,
      'true',
    ])
    expect(wrapper.find('[data-frame-count]').text()).toBe('2 of 3 Frames')
    await wrapper.find('[data-search]').setValue('dragon')
    expect(wrapper.find('[data-no-match]').text()).toBe('No Frame says "dragon".')
  })

  it('offers Compare once there is a picture, and Scores once two models made some', async () => {
    const modes = (w: ReturnType<typeof mountIt>) => w.findAll('[data-mode]').map((m) => m.text())
    const none = mountIt([frames[1]])
    await flushPromises()
    expect(modes(none)).toEqual(['All Frames'])
    none.unmount()
    const one = mountIt([frames[2]])
    await flushPromises()
    expect(modes(one)).toEqual(['All Frames', 'Compare'])
    one.unmount()
    const two = mountIt()
    await flushPromises()
    expect(modes(two)).toEqual(['All Frames', 'Compare', 'Scores'])
    await two.find('[data-mode=compare]').trigger('click')
    expect(two.findAll('[data-compare-row]')).toHaveLength(2)
  })

  it('closes when its screen is left, so it is not inline over the screen on coming back', async () => {
    const shown = ref(true)
    const open = ref(true)
    const Screen = defineComponent({
      name: 'RoleplayView',
      setup: () => () =>
        h(AllFrames<Frame>, {
          open: open.value,
          'onUpdate:open': (v: boolean) => (open.value = v),
          sessionId: 's1',
          frames,
          tiles: tiles(frames),
          text: (f: Frame) => f.says,
          picked: null,
          imageModel: 'a',
        }),
    })
    const wrapper = mount(
      defineComponent(() => () => h(KeepAlive, null, [shown.value ? h(Screen) : h('p', 'Home')])),
      { attachTo: document.body },
    )
    await flushPromises()
    const dialog = document.querySelector<HTMLDialogElement>('[data-all-frames]')!
    expect(dialog.open).toBe(true)
    shown.value = false
    await flushPromises()
    expect(dialog.open).toBe(false)
    shown.value = true
    await flushPromises()
    expect(open.value).toBe(false)
    expect(wrapper.find('[data-sheet]').exists()).toBe(false)
  })
})
