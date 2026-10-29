import { assertEquals, assertMatch, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from '../testing.ts'
import { chainFrames, chainOfTwo, settled } from '../appTesting.ts'
import { fakeVideoGenerator } from './testing.ts'
import { makeClip } from './makeClip.ts'
import type { Session, SessionStore } from '../session.ts'

const leadIn = { kind: 'lead-in', prompt: 'She walks in.', seconds: 5, speech: false }
const queueClip = (
  call: Awaited<ReturnType<typeof chainOfTwo>>['call'],
  frameIndex: number,
  clip: unknown,
) => call('POST', '/api/sessions/s1/jobs', { kind: 'clip', frameIndex, clip })

Deno.test('A Lead In is made from a Frame’s picture, kept on it, served, and undone with it', () =>
  withTempDir(async (root) => {
    const video = fakeVideoGenerator()
    const { call } = await chainOfTwo(root, { video })
    const queued = await queueClip(call, 1, leadIn)
    assertEquals(queued.status, 201)
    // It keeps the Image Model of the picture it's made from.
    const [job] = await queued.json()
    assertEquals(await settled(call), [])
    const [opening, second] = await chainFrames(call)
    assertEquals(job.image.imageModel, second.imageModel)
    const [clip] = second.clips
    assertMatch(clip.file, /^clip-1-lead-in-[0-9a-f]{8}\.mp4$/)
    assertEquals(
      [clip.kind, clip.prompt, clip.seconds, clip.speech, clip.seed],
      ['lead-in', 'She walks in.', 5, false, 1234],
    )
    assertEquals(opening.clips, undefined)
    // By the video model Settings choose, as made with.
    assertEquals([video.made[0].model, clip.model], ['ltx-2.5', 'ltx-2.5'])
    // The picture is the clip's last frame only.
    assertEquals([video.made[0].first, video.made[0].last], [undefined, second.image])
    const served = await call('GET', `/api/sessions/s1/images/${clip.file}`)
    assertEquals(served.headers.get('content-type'), 'video/mp4')
    await served.body?.cancel()
    await call('DELETE', '/api/sessions/s1/frames/1')
    assertEquals((await call('GET', `/api/sessions/s1/images/${clip.file}`)).status, 404)
  }))

Deno.test('A kind made again replaces its clip; another kind sits beside it', () =>
  withTempDir(async (root) => {
    const video = fakeVideoGenerator()
    const { call } = await chainOfTwo(root, { video })
    await queueClip(call, 1, leadIn)
    await settled(call)
    const first = (await chainFrames(call))[1].clips[0].file
    await queueClip(call, 1, { ...leadIn, prompt: 'She runs in.' })
    await queueClip(call, 1, { ...leadIn, kind: 'idle-loop', seconds: 4 })
    await settled(call)
    const [, second] = await chainFrames(call)
    assertEquals(
      second.clips.map((c: { kind: string; prompt: string }) => [c.kind, c.prompt]),
      [['lead-in', 'She runs in.'], ['idle-loop', 'She walks in.']],
    )
    assertEquals((await call('GET', `/api/sessions/s1/images/${first}`)).status, 404)
    // An Idle Loop's picture is at both ends.
    assertEquals([video.made[2].first, video.made[2].last], [second.image, second.image])
  }))

Deno.test('Into Next ends on the next Frame’s picture, and the last Frame has none', () =>
  withTempDir(async (root) => {
    const video = fakeVideoGenerator()
    const { call } = await chainOfTwo(root, { video })
    const intoNext = { ...leadIn, kind: 'into-next' }
    const last = await queueClip(call, 1, intoNext)
    assertEquals(last.status, 409)
    assertStringIncludes((await last.json()).error, 'no picture to end on')
    assertEquals((await queueClip(call, 0, intoNext)).status, 201)
    await settled(call)
    const [opening, second] = await chainFrames(call)
    assertEquals([video.made[0].first, video.made[0].last], [opening.image, second.image])
    assertEquals(opening.clips[0].next, second.image)
  }))

Deno.test('A clip’s order is checked before it’s queued', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root, { video: fakeVideoGenerator() })
    for (
      const [clip, why] of [
        [{ ...leadIn, kind: 'zoom' }, 'kind must be one of'],
        [{ ...leadIn, prompt: ' ' }, 'Say what happens'],
        [{ ...leadIn, seconds: 11 }, 'seconds must be'],
        [{ ...leadIn, seconds: 4.5 }, 'seconds must be'],
        [{ ...leadIn, speech: 'no' }, 'speech must be'],
        [undefined, 'kind must be one of'],
      ] as const
    ) {
      const res = await queueClip(call, 1, clip)
      assertEquals(res.status, 400)
      assertStringIncludes((await res.json()).error, why)
    }
  }))

Deno.test('Without a video generator, a clip is refused, saying why', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root)
    const res = await queueClip(call, 1, leadIn)
    assertEquals(res.status, 409)
    assertStringIncludes((await res.json()).error, "Clips isn't available")
  }))

Deno.test('A failed clip leaves the picture as it was, and no file behind', () =>
  withTempDir(async (root) => {
    const { call } = await chainOfTwo(root, {
      video: fakeVideoGenerator({ fail: 'out of memory' }),
    })
    await queueClip(call, 1, leadIn)
    const [job] = await settled(call)
    assertEquals([job.status, job.error], ['failed', 'out of memory'])
    assertEquals((await chainFrames(call))[1].clips, undefined)
    const files = [...Deno.readDirSync(join(root, 's1'))].map((e) => e.name)
    assertEquals(files.filter((f) => f.startsWith('clip-')), [])
  }))

Deno.test('A clip is made from the picture of the Image Model it was queued for', () =>
  withTempDir(async (root) => {
    const video = fakeVideoGenerator()
    // The Session shows Klein's pictures now; the clip was queued for Krea's.
    const session = {
      id: 's1',
      seed: 3,
      settings: { imageModel: 'flux2-klein' },
      frames: [0, 1].map((index) => ({
        index,
        pictures: [
          { image: `krea-${index}.png`, imageModel: 'krea-2' },
          { image: `klein-${index}.png`, imageModel: 'flux2-klein' },
        ],
      })),
    } as unknown as Session
    await Deno.mkdir(join(root, 's1'))
    const deps = {
      store: { dir: (id: string) => join(root, id) } as SessionStore,
      video,
      videoModel: () => Promise.resolve('ltx-2.5'),
    }
    const order = { ...leadIn, kind: 'into-next' as const }
    let saved: Session | undefined
    await makeClip(
      deps,
      session,
      0,
      order,
      'krea-2',
      () => {},
      new AbortController().signal,
      (change) => {
        saved = change(session)
        return Promise.resolve(saved)
      },
    )
    assertEquals([video.made[0].first, video.made[0].last], ['krea-0.png', 'krea-1.png'])
    const pictures = saved!.frames[0].pictures as { imageModel: string; clips?: unknown[] }[]
    assertEquals(pictures.map((p) => [p.imageModel, p.clips?.length]), [['krea-2', 1], [
      'flux2-klein',
      undefined,
    ]])
  }))
