import { assertEquals, assertStringIncludes } from '@std/assert'
import { fakeComfyUI } from './testing.ts'
import { comfyuiStatus } from './status.ts'
import { VOICE_NODES } from '../voice/comfyui/comfyui.ts'

const MAC_FILES: Record<string, string[]> = {
  diffusion_models: ['qwen_image_2.1_int8_convrot.safetensors'],
  text_encoders: ['qwen3vl_8b_int8_convrot.safetensors'],
  vae: ['qwen_image_2.1_vae_bf16.safetensors'],
}

Deno.test("Settings' check: ComfyUI's version and device, and whether the model's files are there", async () => {
  const ready = fakeComfyUI({ files: MAC_FILES })
  const missing = fakeComfyUI({ files: { ...MAC_FILES, vae: [] } })
  const qwen = { imageModel: 'qwen-image-2.1' }
  try {
    assertEquals(await comfyuiStatus(ready.url, qwen), {
      up: true,
      version: '0.39.1',
      device: 'mps',
      missing: {},
    })
    const status = await comfyuiStatus(missing.url, qwen)
    assertEquals(status.up && status.missing.imageModel?.includes('vae/'), true)
    // Upscaling there too: the Mac's files have Qwen-Image's but not SeedVR2's, and only the
    // upscaler is said to be missing them.
    const both = await comfyuiStatus(ready.url, { ...qwen, upscaler: 'seedvr2-7b' })
    assertEquals(both.up && both.missing, {
      upscaler: "ComfyUI doesn't have SeedVR2 7B's files: diffusion_models/ " +
        '(^seedvr2_7b_int8 or ^seedvr2_7b_fp8 or ^seedvr2_7b_(?!sharp).*\\.safetensors$); ' +
        'vae/ (^seedvr2_ema_vae.*\\.safetensors$ or ^ema_vae)',
    })
  } finally {
    await ready.close()
    await missing.close()
  }
  const down = await comfyuiStatus('http://localhost:9', qwen)
  assertEquals(down.up, false)
})

Deno.test("Settings' check for voices: TTS Audio Suite's nodes, naming those missing", async () => {
  const ready = fakeComfyUI({ nodes: [...VOICE_NODES] })
  const bare = fakeComfyUI({ nodes: ['HiggsAudioV3EngineNode'] })
  try {
    assertEquals(await comfyuiStatus(ready.url, { voices: true }), {
      up: true,
      version: '0.39.1',
      device: 'mps',
      missing: {},
    })
    const status = await comfyuiStatus(bare.url, { voices: true })
    const voices = status.up ? status.missing.voices ?? '' : ''
    assertStringIncludes(voices, 'Qwen3TTSEngineNode')
    assertEquals(voices.includes('HiggsAudioV3EngineNode'), false)
    assertStringIncludes(voices, 'install TTS Audio Suite')
  } finally {
    await ready.close()
    await bare.close()
  }
})

Deno.test("Settings' check for clips: the video model's files, naming those missing", async () => {
  const ltx = {
    diffusion_models: ['ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors'],
    text_encoders: ['gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors'],
    vae: ['ltx-2.5-video-vae-bf16.safetensors', 'ltx-2.5-audio-vae-bf16.safetensors'],
  }
  const ready = fakeComfyUI({ files: ltx })
  const noAudio = fakeComfyUI({ files: { ...ltx, vae: ['ltx-2.5-video-vae-bf16.safetensors'] } })
  try {
    const video = { videoModel: 'ltx-2.5' }
    const fine = await comfyuiStatus(ready.url, video)
    assertEquals(fine.up && fine.missing, {})
    const status = await comfyuiStatus(noAudio.url, video)
    const clips = status.up ? status.missing.videoModel ?? '' : ''
    assertStringIncludes(clips, "LTX 2.5's files: vae/ (^ltx-2")
    assertStringIncludes(clips, 'audio-vae')
    // The Image Model's files, missing here too, are left to its own tab.
    const both = await comfyuiStatus(noAudio.url, { ...video, imageModel: 'qwen-image-2.1' })
    assertEquals(both.up && Object.keys(both.missing), ['imageModel', 'videoModel'])
    const unknown = await comfyuiStatus(ready.url, { videoModel: 'wan-9' })
    assertEquals(unknown.up && unknown.missing, {
      videoModel: 'ComfyUI has no video model "wan-9" here',
    })
  } finally {
    await ready.close()
    await noAudio.close()
  }
})
