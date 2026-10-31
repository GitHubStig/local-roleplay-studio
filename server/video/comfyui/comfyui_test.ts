import { assert, assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { pngHeader, withTempDir } from '../../testing.ts'
import { loadWorkflow } from '../../comfyui/client.ts'
import { fakeComfyUI } from '../../comfyui/testing.ts'
import { loadPrompt } from '../../promptFiles.ts'
import type { ClipRequest } from '../videoGenerator.ts'
import { comfyuiVideoGenerator, withoutEnds } from './comfyui.ts'

const CLIP = { filename: 'rpg-clip_00001_.mp4', bytes: new Uint8Array([0, 0, 0, 24, 102, 116]) }
const FILES = {
  diffusion_models: [
    'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
    'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
    'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
    'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  ],
  text_encoders: [
    'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
    'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  ],
  vae: [
    'ltx-2.5-video-vae-bf16.safetensors',
    'ltx-2.5-audio-vae-bf16.safetensors',
    'wan_2.1_vae.safetensors',
    'minimax_h3_video_vae_int8_convrot.safetensors',
    'minimax_h3_video_vae_fp16.safetensors',
    'minimax_h3_audio_vae_fp32.safetensors',
  ],
  loras: [
    'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
    'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
    'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  ],
}
type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>
const workflow = () => loadWorkflow(new URL('./workflows/ltx-2.5.json', import.meta.url))

/** Makes a clip from pictures written into a temp dir, against a stand-in ComfyUI. */
async function makeClip(
  dir: string,
  req: Partial<ClipRequest>,
  opts: Parameters<typeof fakeComfyUI>[0] = {},
) {
  await Deno.writeFile(join(dir, 'frame-3.png'), pngHeader(1280, 704))
  await Deno.writeFile(join(dir, 'frame-4.png'), pngHeader(1280, 704))
  const comfy = fakeComfyUI({ files: FILES, video: CLIP, ...opts })
  try {
    const name = await comfyuiVideoGenerator({ address: comfy.url }).makeClip(
      {
        model: 'ltx-2.5',
        prompt: 'She walks in.',
        speech: false,
        seconds: 5,
        seed: 7,
        dir,
        name: 'clip-3',
        ...req,
      },
      new AbortController().signal,
    )
    return { name, comfy, workflow: comfy.queued[0] as Nodes }
  } finally {
    await comfy.close()
  }
}

Deno.test('A Lead In guides the picture in at the last frame only, at the picture’s shape', () =>
  withTempDir(async (dir) => {
    const { name, comfy, workflow } = await makeClip(dir, { last: 'frame-3.png' })
    assertEquals(name, 'clip-3.mp4')
    assertEquals(await Deno.readFile(join(dir, name)), CLIP.bytes)
    assertEquals(['firstGuide', 'firstImage'].filter((id) => id in workflow), [])
    const [sent] = comfy.uploads
    assertEquals(workflow.lastImage.inputs.image, `${sent.name} [temp]`)
    // What took the first guide's conditioning and latent takes what it was given.
    assertEquals(workflow.lastGuide.inputs.positive, ['conditioning', 0])
    assertEquals(workflow.lastGuide.inputs.latent, ['video', 0])
    assertEquals(workflow.lastGuide.inputs.frame_idx, -1)
    assertEquals([workflow.video.inputs.width, workflow.video.inputs.height], [1280, 704])
    assertEquals(workflow.video.inputs.length, 121)
    assertEquals(workflow.audio.inputs.frames_number, 121)
    assertEquals(workflow.noise.inputs.noise_seed, 7)
    assertEquals(workflow.prompt.inputs.text, 'She walks in.')
    assertEquals(
      workflow.unet.inputs.unet_name,
      'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
    )
    assertEquals(workflow.audioVae.inputs.vae_name, 'ltx-2.5-audio-vae-bf16.safetensors')
  }))

Deno.test('No copy stays with ComfyUI: the picture and the clip are blanked after', () =>
  withTempDir(async (dir) => {
    const { comfy } = await makeClip(dir, { first: 'frame-3.png' })
    const [sent, ...blanked] = comfy.uploads
    assertEquals([sent.type, sent.bytes], ['temp', 24])
    assertEquals(
      blanked.map((u) => [u.name, u.type, u.bytes === 24]).sort(),
      [[CLIP.filename, 'output', false], [sent.name, 'temp', false]].sort(),
    )
    assertEquals(blanked.find((u) => u.name === CLIP.filename)?.bytes, 0)
  }))

Deno.test('An Idle Loop sends its picture once, guided in at both ends', () =>
  withTempDir(async (dir) => {
    const { comfy, workflow } = await makeClip(dir, { first: 'frame-3.png', last: 'frame-3.png' })
    const sent = comfy.uploads.filter((u) => u.bytes === 24)
    assertEquals(sent.length, 1)
    assertEquals(workflow.firstImage.inputs.image, `${sent[0].name} [temp]`)
    assertEquals(workflow.lastImage.inputs.image, `${sent[0].name} [temp]`)
  }))

Deno.test('Into Next guides in this Frame’s picture first and the next one’s last', () =>
  withTempDir(async (dir) => {
    const { comfy, workflow } = await makeClip(dir, { first: 'frame-3.png', last: 'frame-4.png' })
    const sent = comfy.uploads.filter((u) => u.bytes === 24).map((u) => `${u.name} [temp]`)
    assertEquals([workflow.firstImage.inputs.image, workflow.lastImage.inputs.image], sent)
  }))

Deno.test('A clip without dialogue says so in the negative prompt; one with speech doesn’t', () =>
  withTempDir(async (dir) => {
    const negative = await loadPrompt('video/negative')
    const silent = await makeClip(dir, { first: 'frame-3.png', speech: false })
    assertEquals(
      silent.workflow.negative.inputs.text,
      `${negative}, ${await loadPrompt('video/no-speech')}`,
    )
    const spoken = await makeClip(dir, { first: 'frame-3.png', speech: true })
    assertEquals(spoken.workflow.negative.inputs.text, negative)
  }))

Deno.test('A clip needs a picture at an end, and LTX 2.5’s files on ComfyUI', () =>
  withTempDir(async (dir) => {
    await assertRejects(() => makeClip(dir, {}), Error, 'one end at least')
    await assertRejects(
      () => makeClip(dir, { first: 'frame-3.png' }, { files: {} }),
      Error,
      'LTX 2.5',
    )
  }))

Deno.test('A clip asks for its video model by name, and one ComfyUI has no workflow for is refused', () =>
  withTempDir(async (dir) => {
    await assertRejects(
      () => makeClip(dir, { first: 'frame-3.png', model: 'wan-9' }),
      Error,
      'no video model "wan-9"',
    )
  }))

Deno.test('Without its last end, what took the last guide takes the first’s', async () => {
  const nodes = withoutEnds(await workflow(), { first: true, last: false })
  assert(!('lastGuide' in nodes) && !('lastPrep' in nodes))
  assertEquals(nodes.av.inputs.video_latent, ['firstGuide', 2])
  assertEquals(nodes.guider.inputs.positive, ['firstGuide', 0])
  assertEquals(nodes.crop.inputs.negative, ['firstGuide', 1])
  // Nothing points at a node that's gone.
  for (const node of Object.values(nodes)) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value)) assert(value[0] in nodes, `${value[0]} is gone`)
    }
  }
})

Deno.test('Wan 2.2 takes a Lead In’s picture as its end image only, at 16 fps and its own size', () =>
  withTempDir(async (dir) => {
    const { workflow } = await makeClip(dir, { model: 'wan-2.2', last: 'frame-3.png' })
    assertEquals(['firstImage', 'firstScale'].filter((id) => id in workflow), [])
    assert(!('start_image' in workflow.video.inputs))
    assertEquals(workflow.video.inputs.end_image, ['lastScale', 0])
    assertEquals([workflow.video.inputs.width, workflow.video.inputs.height], [864, 480])
    assertEquals(workflow.video.inputs.length, 81)
    assertEquals(workflow.mux.inputs.fps, 16)
    assertEquals(workflow.high.inputs.noise_seed, 7)
    assertEquals(
      workflow.unetHigh.inputs.unet_name,
      'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
    )
    assertEquals(
      workflow.loraLow.inputs.lora_name,
      'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
    )
  }))

Deno.test('MiniMax H3 takes a Play out’s picture as its first frame only, with the turbo LoRA', () =>
  withTempDir(async (dir) => {
    const { workflow } = await makeClip(dir, { model: 'minimax-h3', first: 'frame-3.png' })
    assertEquals(['lastImage', 'lastScale'].filter((id) => id in workflow), [])
    assert(!('last_frame' in workflow.video.inputs))
    assertEquals(workflow.video.inputs.first_frame, ['firstScale', 0])
    assertEquals(workflow.video.inputs.length, 124)
    assertEquals(workflow.video.inputs.prompt, 'She walks in.')
    assertEquals(
      workflow.lora.inputs.lora_name,
      'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    )
    // The fp16 video VAE where there is one.
    assertEquals(workflow.vae.inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors')
  }))
