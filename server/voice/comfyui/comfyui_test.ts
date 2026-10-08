import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from '../../testing.ts'
import { fillWorkflow, loadWorkflow } from '../../comfyui/client.ts'
import { fakeComfyUI } from '../../comfyui/testing.ts'
import { comfyuiVoiceEngine, higgsText } from './comfyui.ts'

const CLIP = {
  filename: 'ComfyUI_temp_abcde_00001_.flac',
  bytes: new Uint8Array([102, 76, 97, 67]),
}
type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>

Deno.test('A voice designed through ComfyUI is saved, and its copy in temp is blanked after', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ audio: CLIP })
    try {
      const engine = comfyuiVoiceEngine({ baseUrl: () => Promise.resolve(comfy.url) })
      const out = join(dir, 'voice-1a2b3c4d.flac')
      await engine.design(
        { description: 'A low, rough voice.', text: 'Sit down.', seed: 0, out },
        new AbortController().signal,
      )
      assertEquals(await Deno.readFile(out), CLIP.bytes)
      const [workflow] = comfy.queued as Nodes[]
      assertEquals(workflow.design.inputs.voice_instruction, 'A low, rough voice.')
      assertEquals(workflow.design.inputs.reference_text, 'Sit down.')
      // 0 is "random" to the node, so seeds start at 1.
      assertEquals(workflow.design.inputs.seed, 1)
      assertEquals(workflow.out.class_type, 'PreviewAudio')
      // ComfyUI's copy is overwritten with nothing, where it was.
      assertEquals(comfy.uploads, [
        { name: CLIP.filename, type: 'temp', subfolder: '', overwrite: 'true', bytes: 0 },
      ])
      await new Promise((r) => setTimeout(r, 80))
      assertEquals(comfy.posted.map((p) => p.path), ['(in history)', '/history', '/free'])
    } finally {
      await comfy.close()
    }
  }))

Deno.test('A line spoken through ComfyUI clones the reference clip from temp, blanking both after', () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ audio: CLIP })
    try {
      const ref = join(dir, 'voice-1a2b3c4d.flac')
      await Deno.writeFile(ref, new Uint8Array(300))
      const out = join(dir, 'speech-3-aaaaaaaa.flac')
      await comfyuiVoiceEngine({ baseUrl: () => Promise.resolve(comfy.url) }).speak(
        {
          text: 'Third door on the left. Mind the step.',
          pace: 'slow',
          sound: 'sigh',
          ref,
          refText: 'Sit down.',
          seed: 2 ** 32 + 6,
          out,
        },
        new AbortController().signal,
      )
      assertEquals(await Deno.readFile(out), CLIP.bytes)
      const [workflow] = comfy.queued as Nodes[]
      const [sent, blankedClip, blankedRef] = comfy.uploads
      assertEquals([sent.type, sent.bytes, sent.name.endsWith('.flac')], ['temp', 300, true])
      assertEquals(workflow.ref.inputs.audio, `${sent.name} [temp]`)
      assertEquals(workflow.voice.inputs.reference_text, 'Sit down.')
      assertEquals(
        workflow.speak.inputs.text,
        '<|sfx:sigh|>Uh <|prosody:speed_slow|>Third door on the left. <|prosody:pause|>Mind the step.',
      )
      assertEquals(workflow.speak.inputs.seed, 8)
      assertEquals(
        [workflow.engine.inputs.temperature, workflow.engine.inputs.top_k],
        [0.5, 30],
      )
      assertEquals([blankedClip.name, blankedClip.bytes], [CLIP.filename, 0])
      assertEquals([blankedRef.name, blankedRef.type, blankedRef.bytes], [sent.name, 'temp', 0])
    } finally {
      await comfy.close()
    }
  }))

Deno.test("ComfyUI's error fails the voice, and leaves no file", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({ finish: 'Worker closed the response stream unexpectedly' })
    try {
      const out = join(dir, 'voice-1a2b3c4d.flac')
      await assertRejects(
        () =>
          comfyuiVoiceEngine({ baseUrl: () => Promise.resolve(comfy.url) }).design(
            { description: 'x', text: 'y', seed: 1, out },
            new AbortController().signal,
          ),
        Error,
        'Worker closed the response stream unexpectedly',
      )
      await assertRejects(() => Deno.stat(out), Deno.errors.NotFound)
    } finally {
      await comfy.close()
    }
  }))

Deno.test("Higgs's tags, as the voice service writes them: pace, sound, whisper", () => {
  assertEquals(higgsText({ text: 'Fine.' }), 'Fine.')
  assertEquals(higgsText({ text: 'Fine.', pace: 'fast' }), '<|prosody:speed_fast|>Fine.')
  assertEquals(
    higgsText({ text: 'Stay away from her.', whisper: true, pace: 'normal', sound: 'none' }),
    '<|style:whispering|>Stay away from her.',
  )
  assertEquals(higgsText({ text: 'Heavy.', sound: 'laughter' }), '<|sfx:laughter|>Heh Heavy.')
  // TTS Audio Suite reads [Name] as a change of speaker.
  assertEquals(higgsText({ text: 'Ask [the keeper].' }), 'Ask the keeper.')
})

Deno.test('Both voice workflows load, and fill with nothing left over', async () => {
  const fills = {
    design: { description: 'd', text: 't', seed: 1 },
    speak: { ref: 'r.flac [temp]', refText: 't', text: 'x', seed: 1 },
  }
  for (const [id, values] of Object.entries(fills)) {
    const workflow = await loadWorkflow(new URL(`./workflows/${id}.json`, import.meta.url))
    assertEquals(JSON.stringify(fillWorkflow(workflow, values)).includes('"$'), false)
  }
})
