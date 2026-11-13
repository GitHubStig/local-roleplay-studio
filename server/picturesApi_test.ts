import { assertEquals, assertMatch } from '@std/assert'
import { join } from '@std/path'
import type { Job } from '../shared/jobs.ts'
import type { StyleEmbedder } from './style/embedder.ts'
import type { Picture } from '../shared/pictures.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { fakeImageGenerator, withTempDir } from './testing.ts'
import {
  chainFrames,
  chainOfTwo,
  type JsonFrame,
  readEvents,
  settled,
  type setup,
} from './appTesting.ts'

Deno.test('The Compare dialog exports to a folder per Session', () =>
  withTempDir(async (root) => {
    const page = '<script id="comparison" type="application/json">{}</script>'
    const exports = {
      dir: join(root, 'exports'),
      page: () => Promise.resolve({ html: page, plot: '' }),
    }
    const { call } = await chainOfTwo(root, { exports })
    const comparison = {
      models: [],
      rows: [{ name: 'Frame 0', pictures: [] }],
    }
    const exported = await call('POST', '/api/sessions/s1/export', comparison)
    assertEquals(await exported.json(), { folder: join(root, 'exports', 's1'), pictures: 0 })
    assertMatch(
      await Deno.readTextFile(join(root, 'exports', 's1', 'index.html')),
      /"title":"\d{1,2} [A-Z][a-z]{2,3} \d{4} · Seed \d+"/,
    )

    const picture = { name: 'Frame 0', pictures: [{ image: '../s2/frame-0.png' }] }
    const outside = await call('POST', '/api/sessions/s1/export', {
      ...comparison,
      models: [{ label: 'A' }],
      rows: [picture],
    })
    assertEquals([outside.status, (await outside.json()).error], [
      400,
      'Pictures must be files in the Session',
    ])
    assertEquals((await call('POST', '/api/sessions/nope/export', comparison)).status, 404)
    const off = (await chainOfTwo(join(root, 'off'))).call
    assertEquals((await off('POST', '/api/sessions/s1/export', comparison)).status, 404)
  }))

Deno.test("A Session's export is refused while another of it is being written", () =>
  withTempDir(async (root) => {
    const page = '<script id="comparison" type="application/json">{}</script>'
    let open!: () => void
    const held = new Promise<void>((r) => (open = r))
    const exports = {
      dir: join(root, 'exports'),
      // The first export waits here, mid-way, until the second has been asked for.
      page: async () => (await held, { html: page, plot: '' }),
    }
    const { call } = await chainOfTwo(root, { exports })
    const comparison = { models: [], rows: [{ name: 'Frame 0', pictures: [] }] }
    const first = call('POST', '/api/sessions/s1/export', comparison)
    const second = await call('POST', '/api/sessions/s1/export', comparison)
    assertEquals(second.status, 409)
    open()
    assertEquals((await first).status, 200)
    // Done, another may start.
    assertEquals((await call('POST', '/api/sessions/s1/export', comparison)).status, 200)
  }))

Deno.test('Home shows the thumbnail chosen until its file goes, and else the newest picture', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root)
    const session = async () => await (await call('GET', '/api/sessions/s1')).json()
    const card = async () => (await (await call('GET', '/api/sessions')).json())[0].thumbnail
    const choose = (image: unknown) => call('PUT', '/api/sessions/s1/thumbnail', { image })
    const frames = (await session()).frames
    const [first, newest] = frames.map((f: { pictures: { image: string }[] }) =>
      f.pictures[0].image
    )
    assertEquals(await card(), newest)

    assertEquals((await choose(42)).status, 400)
    assertEquals((await call('PUT', '/api/sessions/nope/thumbnail', { image: first })).status, 404)
    assertEquals((await call('DELETE', '/api/sessions/nope/thumbnail')).status, 404)
    const unknown = await choose('elsewhere.png')
    assertEquals([unknown.status, (await unknown.json()).error], [
      409,
      'That picture no longer exists',
    ])
    assertEquals(await card(), newest)

    assertEquals((await choose(first)).status, 200)
    assertEquals(await card(), first)
    assertEquals((await session()).thumbnail, first)

    // Back to the newest, and the choice leaves the Session.
    assertEquals((await call('DELETE', '/api/sessions/s1/thumbnail')).status, 200)
    assertEquals(await card(), newest)
    assertEquals('thumbnail' in await session(), false)
  }))

Deno.test('A Session switches Image Model, and a Chain Frame by the old one renders again', () =>
  withTempDir(async (root) => {
    const images = fakeImageGenerator()
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    const switchTo = (imageModel: unknown) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    const render = () => call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })

    assertEquals((await switchTo(42)).status, 400)
    const unknown = await switchTo('dall-e')
    assertEquals([unknown.status, (await unknown.json()).error], [
      400,
      'There\'s no Image Model "dall-e"',
    ])
    assertEquals(
      (await call('PUT', '/api/sessions/nope/image-model', { imageModel: 'x' })).status,
      404,
    )

    const switched = await (await switchTo('flux2-klein-4b')).json()
    assertEquals([switched.settings.imageModel, switched.settings.steps], ['flux2-klein-4b', 4])
    const [, before] = await chainFrames(call)
    assertEquals((await render()).status, 201)
    assertEquals(await settled(call), [])
    const [, after] = await chainFrames(call)
    assertEquals(after.pictures.map((p: Picture) => p.image), [before.image, after.image])
    assertEquals(images.prompts.length, 3)
  }))

Deno.test('A Session switches Image Model by name, to one a Backend listed can render', () =>
  withTempDir(async (root) => {
    const switchTo = (call: ReturnType<typeof setup>['call'], imageModel: string) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    // A Mac with no ComfyUI listed: mflux's models only.
    const { call } = await chainOfTwo(join(root, 'mac'))
    const options = await (await call('GET', '/api/settings/options')).json()
    assertEquals(options.imageBackends, ['mflux'])
    assertEquals((await switchTo(call, 'dall-e')).status, 400)
    const qwen = await (await switchTo(call, 'qwen-image-2.1')).json()
    assertEquals([qwen.settings.imageModel, qwen.settings.steps], ['qwen-image-2.1', 25])
    // A Session keeps only what decides what it makes (its models, its music's settings); where
    // they run is Settings'.
    assertEquals(Object.keys(qwen.settings).sort(), [
      'imageModel',
      'musicBehaviour',
      'musicTaste',
      'steps',
      'textModel',
      'thinking',
    ])
    // Picked on a kind of backend, the Session keeps it, as where it would rather render.
    const onMflux = await (await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'qwen-image-2.1',
      imageBackend: 'mflux',
    })).json()
    assertEquals([onMflux.settings.imageModel, onMflux.settings.imageBackend], [
      'qwen-image-2.1',
      'mflux',
    ])
    const wrongKind = await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'boogu-image-turbo',
      imageBackend: 'comfyui',
    })
    assertEquals([wrongKind.status, (await wrongKind.json()).error], [
      400,
      'ComfyUI has no Image Model "boogu-image-turbo"',
    ])
    const noKind = await call('PUT', '/api/sessions/s1/image-model', {
      imageModel: 'qwen-image-2.1',
      imageBackend: 'dall-e',
    })
    assertEquals(noKind.status, 400)
    // A PC: no mflux, a ComfyUI listed.
    const off = { available: false, reason: 'mflux runs only on Apple Silicon Macs' }
    const on = { available: true }
    const comfyui = { id: 'comfyui', kind: 'comfyui' as const, address: '' }
    const pc = (await chainOfTwo(join(root, 'pc'), {
      settings: {
        textModel: 'x',
        backends: [...DEFAULT_SETTINGS.backends, comfyui],
        runOn: { ...DEFAULT_SETTINGS.runOn, images: 'comfyui' },
      },
      features: {
        images: off,
        upscale: off,
        edits: off,
        voices: off,
        scenes: on,
        figures: on,
        lito: off,
        style: off,
        video: off,
      },
    })).call
    assertEquals((await (await pc('GET', '/api/settings/options')).json()).imageBackends, [
      'comfyui',
    ])
    assertEquals((await switchTo(pc, 'fibo-2.0')).status, 200)
    // Boogu is mflux's only, which can't run here.
    assertEquals((await switchTo(pc, 'boogu-image-turbo')).status, 409)
  }))

Deno.test("Every picture by one Image Model is deleted, with its files, but not the Session's own model's", () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root)
    await call('PUT', '/api/sessions/s1/image-model', { imageModel: 'flux2-klein-4b' })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'render', frameIndex: 1 })
    await settled(call)
    const frames = async () =>
      ((await (await call('GET', '/api/sessions/s1')).json()).frames as JsonFrame[]).map((f) =>
        f.pictures.map((p: Picture) => p.imageModel)
      )
    assertEquals(await frames(), [['qwen-image-2.1'], ['qwen-image-2.1', 'flux2-klein-4b']])
    const old = (await (await call('GET', '/api/sessions/s1')).json()).frames[0].pictures[0].image
    const file = join(root, 's1', old)
    assertEquals((await Deno.stat(file)).isFile, true)

    assertEquals((await call('DELETE', '/api/sessions/s1/pictures')).status, 400)
    const own = await call('DELETE', '/api/sessions/s1/pictures?imageModel=flux2-klein-4b')
    assertEquals(own.status, 409)
    const deleted = await call('DELETE', '/api/sessions/s1/pictures?imageModel=qwen-image-2.1')
    assertEquals((await deleted.json()).deleted, 2)
    assertEquals(await frames(), [[], ['flux2-klein-4b']])
    assertEquals(await Deno.stat(file).catch(() => null), null)
  }))

Deno.test("Deleting a model's pictures cancels the work on them, and only that", () =>
  withTempDir(async (root) => {
    const old = 'qwen-image-2.1'
    const other = 'flux2-klein-4b'
    // Renders by the old model take until they're cancelled, once it's held.
    let held = false
    const images = fakeImageGenerator()
    const generate = images.generate
    images.generate = async (req, signal, ...rest) => {
      if (held && req.settings.imageModel === old) {
        await new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason)))
      }
      return generate(req, signal, ...rest)
    }
    const { call } = await chainOfTwo(root, { imageGenerator: images })
    // Frame 2 has no picture yet.
    await readEvents(
      await call('POST', '/api/sessions/s1/frames', { action: 'Kneel', render: false }),
    )
    const switchTo = (imageModel: string) =>
      call('PUT', '/api/sessions/s1/image-model', { imageModel })
    const queue = (kind: string, frameIndex: number) =>
      call('POST', '/api/sessions/s1/jobs', { kind, frameIndex })
    const jobs = async () =>
      ((await (await call('GET', '/api/sessions/s1/jobs')).json()) as Job[]).map((
        j,
      ) => [j.kind, j.frameIndex, j.image?.imageModel ?? null])

    // Frame 1 has a picture by each; Frame 0 only the old model's.
    await switchTo(other)
    await queue('render', 1)
    await settled(call)
    await switchTo(old)
    await call('DELETE', '/api/sessions/s1/jobs/finished')
    held = true
    await queue('render', 0)
    await queue('render', 1)
    await queue('render', 2)
    await queue('upscale', 2)
    await switchTo(other)
    await queue('upscale', 0)
    await queue('upscale', 1)
    await queue('render', 0)
    const all = [
      ['render', 0, old],
      ['render', 1, old],
      ['render', 2, old],
      ['upscale', 2, null],
      ['upscale', 0, null],
      ['upscale', 1, null],
      ['render', 0, other],
    ]
    assertEquals(await jobs(), all)

    // Refused: nothing is cancelled.
    const own = await call('DELETE', `/api/sessions/s1/pictures?imageModel=${other}`)
    assertEquals(own.status, 409)
    assertEquals(await jobs(), all)

    const deleted = await call('DELETE', `/api/sessions/s1/pictures?imageModel=${old}`)
    assertEquals((await deleted.json()).deleted, 2)
    assertEquals((await jobs()).filter(([, , model]) => model === old), [])
    await settled(call)
    assertEquals(await jobs(), [['upscale', 1, null], ['render', 0, other]])
    const { frames } = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(frames.map((f: JsonFrame) => f.pictures.map((p: Picture) => p.imageModel)), [
      [other],
      [other],
      [],
    ])
    assertEquals(!!frames[1].pictures[0].upscaled, true)
  }))

Deno.test("A model's pictures aren't deleted while style scores are being worked out", () =>
  withTempDir(async (root) => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const style: StyleEmbedder = {
      async embed() {
        await held
        return { images: {}, texts: {} }
      },
    }
    const { call } = await chainOfTwo(root, { style })
    const old = 'qwen-image-2.1'
    await call('PUT', '/api/sessions/s1/image-model', { imageModel: 'flux2-klein-4b' })
    await call('POST', '/api/sessions/s1/jobs', { kind: 'style', frameIndex: 0 })
    const refused = await call('DELETE', `/api/sessions/s1/pictures?imageModel=${old}`)
    assertEquals([refused.status, (await refused.json()).error], [
      409,
      'Style scores are being worked out: wait for them to finish first',
    ])
    const { frames } = await (await call('GET', '/api/sessions/s1')).json()
    assertEquals(frames.map((f: JsonFrame) => f.pictures.length), [1, 1])

    release()
    await settled(call)
    const deleted = await call('DELETE', `/api/sessions/s1/pictures?imageModel=${old}`)
    assertEquals((await deleted.json()).deleted, 2)
  }))
