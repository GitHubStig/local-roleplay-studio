import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { ImageRequest } from './imageGenerator.ts'
import { findImageModel, type ImageModel } from './imageModels.ts'
import { mfluxArgs, mfluxImageGenerator, parseProgress, upscaleArgs } from './mflux.ts'
import type { QuantizedStore } from './quantized.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { withTempDir } from './testing.ts'

const request = (dir: string, extra: Partial<ImageRequest['settings']> = {}): ImageRequest => ({
  prompt: 'a studio',
  seed: 7,
  settings: { ...DEFAULT_SETTINGS, imageModel: 'fake', steps: 3, ...extra },
  dir,
  name: 'frame-0',
})

Deno.test('mfluxArgs builds the command line from settings', () => {
  const klein = findImageModel('flux2-klein-4b')!
  assertEquals(mfluxArgs(klein, request('/d', { size: 'square', quantize: 8 }), '/d/x.png'), [
    '--model',
    'flux2-klein-4b',
    '--prompt',
    'a studio',
    '--seed',
    '7',
    '--steps',
    '3',
    '--width',
    '1024',
    '--height',
    '1024',
    '--quantize',
    '8',
    '--output',
    '/d/x.png',
  ])
})

Deno.test('mfluxArgs renders from a saved quantized copy, named by its model, without --quantize', () => {
  const klein = findImageModel('flux2-klein-9b')!
  const args = mfluxArgs(
    klein,
    request('/d', { quantize: 8 }),
    '/d/x.png',
    '/q/flux2-klein-9b-8bit',
  )
  assertEquals(args.slice(0, 4), [
    '--model',
    '/q/flux2-klein-9b-8bit',
    '--base-model',
    'flux2-klein-9b',
  ])
  assertEquals(args.includes('--quantize'), false)
})

Deno.test('mfluxArgs uses the small size presets', () => {
  const args = mfluxArgs(
    findImageModel('flux2-klein-4b')!,
    request('/d', { size: 'square-small' }),
    'o.png',
  )
  assertEquals(args.slice(args.indexOf('--width'), args.indexOf('--width') + 4), [
    '--width',
    '512',
    '--height',
    '512',
  ])
})

Deno.test('mfluxArgs passes the base model and skips quantize for pre-quantized weights', () => {
  const args = mfluxArgs(findImageModel('z-image-turbo')!, request('/d', { quantize: 4 }), 'o.png')
  assertEquals(args.slice(0, 4), [
    '--model',
    'filipstrand/Z-Image-Turbo-mflux-4bit',
    '--base-model',
    'z-image-turbo',
  ])
  assertEquals(args.includes('--quantize'), false)
})

Deno.test('parseProgress reads the latest step from a tqdm bar', () => {
  assertEquals(
    parseProgress('\r 33%|███| 1/3 [00:04<00:08, 4.0s/it]\r 67%|███| 2/3 [00:08<00:04, 4.0s/it]'),
    { step: 2, total: 3 },
  )
  assertEquals(parseProgress('Loading model...'), undefined)
})

/** Writes an executable stand-in for an mflux command and returns a model using it. */
async function fakeMflux(dir: string, script: string): Promise<ImageModel> {
  const command = join(dir, 'fake-mflux')
  await Deno.writeTextFile(command, `#!/bin/sh\n${script}\n`)
  await Deno.chmod(command, 0o755)
  return { id: 'fake', label: 'Fake', command, model: 'fake', defaultSteps: 3 }
}

/** Shell snippet that finds the value after --output. */
const OUTPUT = 'out=""; while [ $# -gt 0 ]; do [ "$1" = "--output" ] && out="$2"; shift; done'

Deno.test('mfluxImageGenerator runs the command and reports progress, after any download', () =>
  withTempDir(async (dir) => {
    // A model's first use downloads it: mflux shows a "Fetching N files" bar first.
    const model = await fakeMflux(
      dir,
      `${OUTPUT}
printf '\\rFetching 16 files:   6%%| 1/16 [00:00<00:04]' >&2
printf '\\rFetching 16 files: 100%%| 16/16 [00:09<00:00]' >&2
printf '\\r 33%%| 1/3 [00:01]' >&2
printf '\\r 67%%| 2/3 [00:02]' >&2
printf '\\r100%%| 3/3 [00:03]' >&2
echo png > "$out"`,
    )
    const progress: string[] = []
    const file = await mfluxImageGenerator({ models: [model] }).generate(
      request(dir),
      new AbortController().signal,
      (step, total) => progress.push(`${step}/${total}`),
      () => progress.push('download'),
    )
    assertEquals(file, 'frame-0.png')
    assertEquals(await Deno.readTextFile(join(dir, file)), 'png\n')
    assertEquals(progress, ['download', 'download', '1/3', '2/3', '3/3'])
  }))

Deno.test('With Quantize on, mfluxImageGenerator renders from a saved copy, or converts if saving fails', () =>
  withTempDir(async (dir) => {
    // The fake mflux writes the arguments it was given as the image.
    const model = await fakeMflux(dir, `args="$*"\n${OUTPUT}\necho "$args" > "$out"`)
    const saved = (ok: boolean): QuantizedStore => ({
      ensure: (m, bits) =>
        ok
          ? Promise.resolve(`/q/${m.id}-${bits}bit`)
          : Promise.reject(new Error('mflux-save failed')),
      list: () => Promise.resolve([]),
      remove: () => Promise.resolve(false),
    })
    const signal = new AbortController().signal
    const render = async (ok: boolean) => {
      const file = await mfluxImageGenerator({ models: [model], quantized: saved(ok) })
        .generate(request(dir, { quantize: 8 }), signal)
      return await Deno.readTextFile(join(dir, file))
    }
    const fromCopy = await render(true)
    assertEquals([
      fromCopy.includes('--model /q/fake-8bit --base-model fake'),
      fromCopy.includes('--quantize'),
    ], [true, false])
    const converting = await render(false)
    assertEquals([converting.includes('--model fake'), converting.includes('--quantize 8')], [
      true,
      true,
    ])
  }))

Deno.test('mfluxImageGenerator surfaces the error line when mflux fails', () =>
  withTempDir(async (dir) => {
    const model = await fakeMflux(
      dir,
      `echo 'Loading...' >&2; echo 'OSError: We have no connection and you are offline' >&2; exit 1`,
    )
    await assertRejects(
      () =>
        mfluxImageGenerator({ models: [model] }).generate(
          request(dir),
          new AbortController().signal,
        ),
      Error,
      'Fake failed: OSError: We have no connection and you are offline',
    )
  }))

Deno.test('mfluxImageGenerator fails when no image was written', () =>
  withTempDir(async (dir) => {
    const model = await fakeMflux(dir, 'exit 0')
    await assertRejects(
      () =>
        mfluxImageGenerator({ models: [model] }).generate(
          request(dir),
          new AbortController().signal,
        ),
      Error,
      'without writing an image',
    )
  }))

Deno.test('mfluxImageGenerator kills mflux on abort', () =>
  withTempDir(async (dir) => {
    const model = await fakeMflux(dir, `printf '\\r 1/9 [00:01]' >&2; exec sleep 30`)
    const controller = new AbortController()
    const started = performance.now()
    const run = mfluxImageGenerator({ models: [model] }).generate(
      request(dir),
      controller.signal,
      () => controller.abort(new Error('Cancelled by player')),
    )
    await assertRejects(() => run, Error, 'Cancelled by player')
    assertEquals(performance.now() - started < 5000, true)
  }))

Deno.test('mfluxImageGenerator rejects an unknown Image Model', async () => {
  await assertRejects(
    () =>
      mfluxImageGenerator({ models: [] }).generate(
        request('/tmp', { imageModel: 'nope' }),
        new AbortController().signal,
      ),
    Error,
    'Unknown Image Model',
  )
})

Deno.test('upscaleArgs upscales the shortest edge to 2048 with the chosen SeedVR2 model', () => {
  assertEquals(
    upscaleArgs(
      { model: 'seedvr2-7b', image: 'frame-0-1a2b3c4d.png', seed: 7, dir: '/d', name: 'x' },
      '/d/x.png',
    ),
    [
      '--model',
      'seedvr2-7b',
      '--image-path',
      '/d/frame-0-1a2b3c4d.png',
      '--resolution',
      '2048',
      '--seed',
      '7',
      '--output',
      '/d/x.png',
    ],
  )
})
