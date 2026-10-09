import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { ImageRequest } from '../imageGenerator.ts'
import { findMfluxModel, type MfluxModel } from './models.ts'
import { mfluxArgs, mfluxImageGenerator, parseProgress, upscaleArgs } from './mflux.ts'
import { DEFAULT_SETTINGS } from '../../settings.ts'
import { withTempDir } from '../../testing.ts'

const request = (dir: string, extra: Partial<ImageRequest['settings']> = {}): ImageRequest => ({
  prompt: 'a studio',
  seed: 7,
  settings: { ...DEFAULT_SETTINGS, imageModel: 'fake', steps: 3, ...extra },
  dir,
  name: 'frame-0',
})

Deno.test('mfluxArgs builds the command line from settings', () => {
  const klein = findMfluxModel('flux2-klein-4b')!
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
    '--compute-precision',
    'float16',
    '--low-ram',
    '--output',
    '/d/x.png',
  ])
})

Deno.test('mfluxArgs computes in float16 only when Settings ask and the model takes it', () => {
  const float16 = (id: string, on: boolean) =>
    mfluxArgs(findMfluxModel(id)!, request('/d', { float16: on }), 'o.png')
      .includes('--compute-precision')
  assertEquals(float16('qwen-image-2.1', true), true)
  assertEquals(float16('qwen-image-2.1', false), false)
  assertEquals(float16('krea-2', true), false)
})

Deno.test('mfluxArgs adds the step cache only for models that take it', () => {
  const qwen = mfluxArgs(
    findMfluxModel('qwen-image-2.1')!,
    request('/d', { stepCache: 0.4 }),
    'o.png',
  )
  assertEquals(
    qwen.slice(qwen.indexOf('--step-cache-ratio'), qwen.indexOf('--step-cache-ratio') + 2),
    [
      '--step-cache-ratio',
      '0.4',
    ],
  )
  const off = mfluxArgs(
    findMfluxModel('qwen-image-2.1')!,
    request('/d', { stepCache: null }),
    'o.png',
  )
  assertEquals(off.includes('--step-cache-ratio'), false)
  const klein = mfluxArgs(
    findMfluxModel('flux2-klein-4b')!,
    request('/d', { stepCache: 0.4 }),
    'o.png',
  )
  assertEquals(klein.includes('--step-cache-ratio'), false)
})

Deno.test('mfluxArgs renders fast mode at its own steps, scheduler and LoRA, without the cache', () => {
  const qwen = findMfluxModel('qwen-image-2.1')!
  const args = mfluxArgs(qwen, request('/d', { fast: true, steps: 25, stepCache: 0.4 }), 'o.png')
  assertEquals(args[args.indexOf('--steps') + 1], '6')
  assertEquals(args[args.indexOf('--scheduler') + 1], 'viggle_turbo')
  assertEquals(args.slice(args.indexOf('--lora') + 1, args.indexOf('--lora') + 3), [
    qwen.fast!.lora,
    '1.0',
  ])
  assertEquals(args.includes('--step-cache-ratio'), false)
  // Models without a fast mode ignore it.
  const klein = mfluxArgs(findMfluxModel('flux2-klein-4b')!, request('/d', { fast: true }), 'o.png')
  assertEquals([klein.includes('--lora'), klein[klein.indexOf('--steps') + 1]], [false, '3'])
})

Deno.test('mfluxArgs uses the small size presets', () => {
  const args = mfluxArgs(
    findMfluxModel('flux2-klein-4b')!,
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
  const args = mfluxArgs(findMfluxModel('z-image-turbo')!, request('/d', { quantize: 4 }), 'o.png')
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
async function fakeMflux(dir: string, script: string): Promise<MfluxModel> {
  const command = join(dir, 'fake-mflux')
  await Deno.writeTextFile(command, `#!/bin/sh\n${script}\n`)
  await Deno.chmod(command, 0o755)
  return { id: 'fake', label: 'Fake', command, model: 'fake', defaultSteps: 3 }
}

/** The stand-in is a shell script, so these run where mflux does (macOS) and on Linux. */
const unix = { ignore: Deno.build.os === 'windows' }

/** Shell snippet that finds the value after --output. */
const OUTPUT = 'out=""; while [ $# -gt 0 ]; do [ "$1" = "--output" ] && out="$2"; shift; done'

Deno.test(
  'mfluxImageGenerator runs the command and reports progress, after any download',
  unix,
  () =>
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
    }),
)

Deno.test(
  'mfluxImageGenerator surfaces the error line when mflux fails',
  unix,
  () =>
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
    }),
)

Deno.test(
  'mfluxImageGenerator fails when no image was written',
  unix,
  () =>
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
    }),
)

Deno.test('mfluxImageGenerator kills mflux on abort', unix, () =>
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
      join('/d', 'frame-0-1a2b3c4d.png'),
      '--resolution',
      '2048',
      '--seed',
      '7',
      '--output',
      '/d/x.png',
    ],
  )
})
