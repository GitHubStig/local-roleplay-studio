import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import * as api from '../api'
import {
  type PictureMenu as PictureMenuOf,
  type PictureMenuSession,
  providePictureMenu,
} from '../composables/usePictureMenu'
import { useFeatures } from '../composables/useFeatures'
import { ALL_AVAILABLE, ALL_ON } from '../testing'
import FrameStrip from './FrameStrip.vue'
import PictureMenu from './PictureMenu.vue'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getSettings: vi.fn(),
  getSettingsOptions: vi.fn(),
  setThumbnail: vi.fn(() => Promise.resolve({})),
}))

enableAutoUnmount(afterEach)

const frames: api.PicturedFrame[] = [
  {
    index: 0,
    prompt: 'A letter on the bar',
    pictures: [{ image: 'f0-a.png', imageModel: 'a' }, { image: 'f0-b.png', imageModel: 'b' }],
  },
  {
    index: 1,
    prompt: 'The storm',
    pictures: [{ image: 'f1-a.png', imageModel: 'a', upscaled: 'f1-a-up.png' }],
  },
]

/** A Session's screen as far as the menu goes: its strip, and the menu it provides. */
function mountIt(session: Partial<PictureMenuSession> = {}) {
  const calls = {
    queue: vi.fn(),
    edit: vi.fn(),
    look: vi.fn(),
    changed: vi.fn(),
    pick: vi.fn(),
  }
  const opened: { menu?: PictureMenuOf } = {}
  const Screen = defineComponent(() => {
    const menu = opened.menu = providePictureMenu(() => ({
      sessionId: 's1',
      frames,
      imageModel: 'a',
      hasJob: () => false,
      canRender: () => true,
      ...calls,
      ...session,
    }))
    return () => [
      h(FrameStrip, {
        tiles: frames.map((f) => ({ index: f.index, thumb: `/p/${f.pictures[0].image}` })),
        picked: 0,
        onPick: calls.pick,
      }),
      h(PictureMenu, { menu }),
      h('div', { 'data-elsewhere': '' }),
    ]
  })
  return { wrapper: mount(Screen, { attachTo: document.body }), calls, opened }
}
const menu = () => document.querySelector<HTMLElement>('[data-picture-menu]')
const row = (name: string) =>
  document.querySelector<HTMLElement>(`[data-picture-menu] [data-${name}]`)
const rows = () => [...menu()!.querySelectorAll('.menu-row')].map((r) => r.textContent!.trim())

beforeEach(async () => {
  vi.mocked(api.getSettingsOptions).mockResolvedValue(
    { features: ALL_AVAILABLE } as api.SettingsOptions,
  )
  vi.mocked(api.getSettings).mockResolvedValue({ features: ALL_ON } as api.Settings)
  vi.mocked(api.setThumbnail).mockClear()
  await useFeatures().refreshFeatures()
})

describe('PictureMenu', () => {
  it('opens where a picture is right-clicked, with what can be done with it, and does it', async () => {
    const { wrapper, calls } = mountIt()
    await wrapper.find('[data-tile="1"]').trigger('contextmenu', { clientX: 40, clientY: 30 })
    expect(rows()).toEqual([
      'Re-render',
      'Upscaled',
      'Edit',
      'Look closer',
      'Open full size in a new tab',
      'Copy the Image Prompt',
      "Keep as Home's thumbnail",
    ])
    expect(menu()!.style.left).toBe('40px')
    // Full size is the upscale.
    expect(row('menu-full-size')!.getAttribute('href')).toBe('/api/sessions/s1/images/f1-a-up.png')

    row('render-button')!.click()
    expect(calls.queue).toHaveBeenCalledWith('render', 1)
    await flushPromises()
    expect(menu()).toBeNull()

    await wrapper.find('[data-tile="1"]').trigger('contextmenu')
    row('menu-look')!.click()
    expect(calls.look).toHaveBeenCalledWith(1)
    // Right-clicking isn't picking.
    expect(calls.pick).not.toHaveBeenCalled()
  })

  it("makes a picture Home's thumbnail, and keeps or stops using the one Home shows", async () => {
    const { wrapper, calls } = mountIt({ thumbnail: 'f0-a.png' })
    await wrapper.find('[data-tile="0"]').trigger('contextmenu')
    expect(row('menu-thumbnail')!.textContent!.trim()).toBe("Stop using as Home's thumbnail")
    row('menu-thumbnail')!.click()
    await flushPromises()
    expect(api.setThumbnail).toHaveBeenCalledWith('s1', null)
    expect(calls.changed).toHaveBeenCalled()
    expect(menu()).toBeNull()

    await wrapper.find('[data-tile="1"]').trigger('contextmenu')
    row('menu-thumbnail')!.click()
    await flushPromises()
    expect(api.setThumbnail).toHaveBeenLastCalledWith('s1', 'f1-a.png')
  })

  it("offers only what's for any picture on one the Frame doesn't show (another model's)", async () => {
    const { opened } = mountIt()
    // As Compare opens it, on Frame 1's picture by model b.
    opened.menu!.open({ x: 0, y: 0 }, 0, 'f0-b.png')
    await flushPromises()
    expect(rows()).toEqual([
      'Open full size in a new tab',
      'Copy the Image Prompt',
      "Use as Home's thumbnail",
    ])
    expect(row('menu-full-size')!.getAttribute('href')).toBe('/api/sessions/s1/images/f0-b.png')
  })

  it('opens on a long press, without picking the tile, and not for a finger that moves', async () => {
    vi.useFakeTimers()
    const { wrapper, calls } = mountIt()
    const tile = wrapper.find('[data-tile="0"]')
    await tile.trigger('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
    await tile.trigger('pointermove', { pointerType: 'touch', clientX: 40, clientY: 10 })
    vi.advanceTimersByTime(600)
    await flushPromises()
    expect(menu()).toBeNull()

    await tile.trigger('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
    vi.advanceTimersByTime(600)
    await flushPromises()
    expect(menu()).not.toBeNull()
    await tile.trigger('pointerup', { pointerType: 'touch' })
    await tile.trigger('click')
    expect(calls.pick).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('closes on Esc, and on a click outside', async () => {
    const { wrapper } = mountIt()
    await wrapper.find('[data-tile="0"]').trigger('contextmenu')
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(menu()).toBeNull()

    await wrapper.find('[data-tile="0"]').trigger('contextmenu')
    await new Promise((resolve) => setTimeout(resolve))
    const elsewhere = document.querySelector('[data-elsewhere]')!
    elsewhere.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    elsewhere.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(menu()).toBeNull()
  })
})
