import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Figure, Made3d, Picture, Scene } from '../api'
import Frame3dButtons from './Frame3dButtons.vue'

const scene = { file: 'scene-0-1a2b3c4d.ply', from: 'frame-0.png' } as Scene
const figure = { file: 'figure-0-1a2b3c4d.ply', from: 'frame-0.png' } as Figure
const picture = (extra: Partial<Picture> = {}): Picture => ({
  image: 'frame-0.png',
  imageModel: 'qwen-image-2.1',
  ...extra,
})
const names = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('button').map((b) => b.text())

describe('Frame3dButtons', () => {
  it('offers each model for a picture, and nothing without one', async () => {
    const wrapper = mount(Frame3dButtons, { props: {} })
    expect(names(wrapper)).toEqual([])
    await wrapper.setProps({ picture: picture() })
    expect(names(wrapper)).toEqual(['SHARP', 'TripoSplat', 'LiTo'])
    await wrapper.find('[data-lito-button]').trigger('click')
    expect(wrapper.emitted('make')).toEqual([['lito']])
  })

  it('views what was made in place of making it', async () => {
    const made = picture({ scene, figure, lito: figure })
    const wrapper = mount(Frame3dButtons, { props: { picture: made } })
    expect(names(wrapper)).toEqual(['View SHARP', 'View TripoSplat', 'View LiTo'])
    await wrapper.find('[data-view-figure]').trigger('click')
    expect(wrapper.emitted('view')).toEqual([['figure']])
  })

  it('offers SHARP again once the picture is upscaled after its scene was made', () => {
    const upscaled = picture({ scene, upscaled: 'frame-0-2048.png' })
    const wrapper = mount(Frame3dButtons, { props: { picture: upscaled } })
    expect(wrapper.find('[data-scene-button]').text()).toBe('SHARP again from upscale')
    // Not once the scene is from the upscale.
    const fromUpscale = picture({
      scene: { ...scene, from: 'frame-0-2048.png' },
      upscaled: 'frame-0-2048.png',
    })
    expect(
      mount(Frame3dButtons, { props: { picture: fromUpscale } }).find('[data-scene-button]')
        .exists(),
    ).toBe(false)
  })

  it("hides what can't be made here, still viewing what was, and switches off what's being made", () => {
    const wrapper = mount(Frame3dButtons, {
      props: {
        picture: picture({ lito: figure }),
        available: (kind: Made3d) => kind === 'scene',
        disabled: (kind: Made3d) => kind === 'scene',
      },
    })
    expect(names(wrapper)).toEqual(['SHARP', 'View LiTo'])
    expect(wrapper.find('[data-scene-button]').attributes('disabled')).toBeDefined()
  })
})
