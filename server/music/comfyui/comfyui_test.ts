import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { fakeComfyUI } from '../../comfyui/testing.ts'
import { withTempDir } from '../../testing.ts'
import { comfyuiMusicGenerator } from './comfyui.ts'
import { musicBackends } from '../musicGenerator.ts'

const FILES = {
  diffusion_models: ['acestep_v1.5_xl_turbo_bf16.safetensors'],
  text_encoders: ['qwen_0.6b_ace15.safetensors', 'qwen_4b_ace15.safetensors'],
  vae: ['ace_1.5_vae.safetensors'],
}
const TRACK = { filename: 'ComfyUI_temp_00001_.flac', bytes: new Uint8Array([102, 76, 97, 67]) }
const REQUEST = {
  caption: 'A lone fiddle, then a low cello slips in beneath it.',
  lyrics: '[Intro - lone fiddle]\n\n[Outro - fiddle and cello]',
  seconds: 60,
  bpm: 70,
  key: 'A minor',
  seed: 7,
  name: 'cue-1',
}
type Nodes = Record<string, { inputs: Record<string, unknown> }>

Deno.test('A track is made from its caption and values, and no copy stays with ComfyUI', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ files: FILES, audio: TRACK })
    try {
      const steps: number[] = []
      const name = await comfyuiMusicGenerator({ address: comfy.url }).makeMusic(
        { ...REQUEST, dir },
        new AbortController().signal,
        (step) => steps.push(step),
      )
      assertEquals(name, 'cue-1.flac')
      assertEquals(await Deno.readFile(join(dir, name)), TRACK.bytes)
      const { text, latent, sample, unet, clip } = comfy.queued[0] as Nodes
      assertEquals(text.inputs.tags, REQUEST.caption)
      assertEquals(text.inputs.lyrics, REQUEST.lyrics)
      assertEquals(
        [text.inputs.bpm, text.inputs.keyscale, text.inputs.duration, text.inputs.seed],
        [70, 'A minor', 60, 7],
      )
      assertEquals([latent.inputs.seconds, sample.inputs.seed], [60, 7])
      assertEquals(unet.inputs.unet_name, 'acestep_v1.5_xl_turbo_bf16.safetensors')
      assertEquals(
        [clip.inputs.clip_name1, clip.inputs.clip_name2],
        ['qwen_0.6b_ace15.safetensors', 'qwen_4b_ace15.safetensors'],
      )
      assertEquals(
        comfy.uploads.map((u) => [u.name, u.type, u.bytes]),
        [[TRACK.filename, 'temp', 0]],
      )
      assertEquals(comfy.posted.some((p) => p.path === '/free'), true)
    } finally {
      await comfy.close()
    }
  }))

Deno.test('Missing ACE-Step files are named before anything is queued', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({
      files: { ...FILES, text_encoders: ['qwen_0.6b_ace15.safetensors'] },
    })
    try {
      const err = await assertRejects(() =>
        comfyuiMusicGenerator({ address: comfy.url }).makeMusic(
          { ...REQUEST, dir },
          new AbortController().signal,
        )
      )
      assertStringIncludes((err as Error).message, 'qwen_4b_ace15')
      assertEquals(comfy.queued.length, 0)
    } finally {
      await comfy.close()
    }
  }))

Deno.test('Music needs a ComfyUI: with none, it says where to add one', async () => {
  const music = musicBackends({
    comfyui: () => {
      throw new Error('not reached')
    },
    backend: () => Promise.resolve(undefined),
  })
  const err = await assertRejects(() =>
    music.makeMusic({ ...REQUEST, dir: '' }, new AbortController().signal)
  )
  assertStringIncludes((err as Error).message, 'on the Machines tab')
})
