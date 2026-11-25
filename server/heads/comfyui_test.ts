import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { fakeComfyUI } from '../comfyui/testing.ts'
import { testPng, withTempDir } from '../testing.ts'
import { comfyuiAskPicture } from './comfyui.ts'
import { headFinder } from './heads.ts'

type Nodes = Record<string, { class_type: string; inputs: Record<string, unknown> }>

Deno.test("A question goes to ComfyUI's TextGenerate with the picture, and its answer is read", () =>
  withTempDir(async (dir) => {
    const comfy = fakeComfyUI({
      files: { text_encoders: ['qwen3vl_8b_int8.safetensors'] },
      text: { node: 'answer', text: '[{"label": "Kael", "bbox_2d": [10, 20, 30, 40]}]' },
    })
    try {
      await Deno.writeFile(join(dir, 'frame-0.png'), await testPng(4, 4))
      const finder = headFinder(comfyuiAskPicture({ address: comfy.url, checkEveryMs: 50 }))
      const heads = await finder.count({ dir, image: 'frame-0.png' }, new AbortController().signal)
      assertEquals(heads, [{ label: 'Kael', box: [10, 20, 30, 40] }])
      const [workflow] = comfy.queued as Nodes[]
      assertEquals(workflow.clip.inputs.clip_name, 'qwen3vl_8b_int8.safetensors')
      assertEquals(workflow.ask.class_type, 'TextGenerate')
      assertEquals(String(workflow.image.inputs.image).endsWith('.png [temp]'), true)
      assertEquals(String(workflow.ask.inputs.prompt).startsWith('Locate the head of every'), true)
      // The picture went up, and is blanked once used: written over by a 1×1 one, same name.
      const [up, blank] = comfy.uploads
      assertEquals([blank.name === up.name, blank.bytes < up.bytes], [true, true])
    } finally {
      await comfy.close()
    }
  }))
