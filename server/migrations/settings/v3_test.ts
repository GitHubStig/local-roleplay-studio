import { assertEquals } from '@std/assert'
import type { V2 } from './v2.ts'
import { v3 } from './v3.ts'

const settings = { textModel: 'gemma', features: { images: true, video: false } } as unknown as V2

Deno.test('v3 switches sheets on, repainted by Qwen-Image 2.1, made by each Session’s model', () => {
  const { features, faceEditModel, sheetImageModel } = v3(settings)
  assertEquals(features, { images: true, video: false, sheets: true } as unknown as typeof features)
  assertEquals([faceEditModel, sheetImageModel], ['qwen-image-2.1-edit', ''])
})

Deno.test('v3 leaves the rest of Settings as they were', () => {
  const { features: _, faceEditModel: __, sheetImageModel: ___, ...rest } = v3(settings)
  const { features: ____, ...before } = settings
  assertEquals(rest, before)
})
