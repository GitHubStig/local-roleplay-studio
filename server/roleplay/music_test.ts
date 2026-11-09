import { assert, assertEquals, assertMatch } from '@std/assert'
import { join } from '@std/path'
import { readEvents, settled, setup } from '../appTesting.ts'
import type { MusicGenerator, MusicRequest } from '../music/musicGenerator.ts'
import { withTempDir } from '../testing.ts'
import { replyOf, scriptedRoleplayModel, testCast, testScore } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const COMFY = { id: 'pc', kind: 'comfyui' as const, address: 'http://192.0.2.20:8188' }
const direction = (decision: string) => ({
  reading: 'The ground has moved.',
  decision,
  entry: 'gentle',
  line: 'A wave!',
})
const cue = (mood: string, extra: Record<string, unknown> = {}) => ({
  mood,
  energy: 'restrained',
  density: 'sparse',
  tempo: 'slow',
  instruments: ['fiddle'],
  vocals: 'none',
  shape: 'intimate',
  key: 'A minor',
  caption: `Folk, ${mood}. It opens on a fiddle.`,
  lyrics: '[Intro - fiddle]',
  ...extra,
})

/** A stand-in music model, which writes a small file and remembers what it was asked. */
function fakeMusic() {
  const asked: MusicRequest[] = []
  const music: MusicGenerator = {
    async makeMusic(req) {
      asked.push(req)
      await Deno.writeFile(join(req.dir, `${req.name}.flac`), new Uint8Array([1, 2, 3]))
      return `${req.name}.flac`
    },
  }
  return { music, asked }
}

/** A begun Roleplay of two Frames, with Music on and a ComfyUI listed. */
async function played(root: string, script: Parameters<typeof scriptedRoleplayModel>[0]) {
  const { music, asked } = fakeMusic()
  const model = scriptedRoleplayModel({
    casts: [testCast],
    replies: [replyOf('Hello.'), replyOf('Yes.')],
    scores: [testScore()],
    ...script,
  })
  const harness = setup({
    root,
    settings: {
      textModel: 'x',
      music: true,
      backends: [{ id: 'here', kind: 'here', address: '' }, COMFY],
    },
    roleplayModel: model,
    music,
  })
  const { call } = harness
  await call('POST', '/api/sessions', { kind: 'roleplay', brief: 'A storm at sea.' })
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/cast'))
  const after = { picture: false }
  await readEvents(await call('POST', '/api/sessions/s1/roleplay/begin', after))
  await readEvents(
    await call('POST', '/api/sessions/s1/roleplay/messages', { text: 'Sorry.', ...after }),
  )
  return { ...harness, asked }
}
const roleplay = async (call: ReturnType<typeof setup>['call']) =>
  (await (await call('GET', '/api/sessions/s1')).json()) as RoleplaySession
const direct = async (call: ReturnType<typeof setup>['call'], frameIndex: number) => {
  await call('POST', '/api/sessions/s1/jobs', { kind: 'direct', frameIndex })
  await settled(call)
}

Deno.test('A Cue the Director begins gets its track, made from its words', () =>
  withTempDir(async (root) => {
    const { call, asked } = await played(root, {
      directions: [direction('transition')],
      cues: [cue('wary')],
    })
    await direct(call, 0)
    const session = await roleplay(call)
    const track = session.cues![0].track!
    assertMatch(track.file, /^music-cue-[0-9a-f]{8}-[0-9a-f]{8}\.flac$/)
    assertEquals([track.seconds, track.seed], [60, session.seed])
    assertEquals(asked.length, 1)
    assertEquals(asked[0].caption, 'Folk, wary. It opens on a fiddle.')
    assertEquals(asked[0].lyrics, '[Intro - fiddle]')
    assertEquals(asked[0].key, 'A minor')
    assertEquals(asked[0].bpm, track.bpm)
    const jobs = await (await call('GET', '/api/sessions/s1/jobs')).json()
    assertEquals(jobs.find((j: { kind: string }) => j.kind === 'music').machine, '192.0.2.20')
    // The page can fetch it.
    const res = await call('GET', `/api/sessions/s1/images/${track.file}`)
    assertEquals(res.status, 200)
    await res.body?.cancel()
  }))

Deno.test('A silence, and a Frame where the music continues, make no track', () =>
  withTempDir(async (root) => {
    const { call, asked } = await played(root, {
      directions: [direction('transition'), direction('continue')],
      cues: [cue('wary')],
    })
    await direct(call, 0)
    await direct(call, 1)
    assertEquals(asked.length, 1)
  }))

Deno.test('A Cue directed again gets a new track, and the old file goes', () =>
  withTempDir(async (root) => {
    const { call, asked } = await played(root, {
      directions: [direction('transition'), direction('transition')],
      cues: [cue('wary'), cue('warmer')],
    })
    await direct(call, 0)
    const first = (await roleplay(call)).cues![0].track!.file
    await direct(call, 0)
    const second = (await roleplay(call)).cues![0].track!.file
    assert(first !== second)
    assertEquals(asked.map((a) => a.caption.split(',')[1].trim()), [
      'wary. It opens on a fiddle.',
      'warmer. It opens on a fiddle.',
    ])
    const dir = join(root, 's1')
    const files = [...Deno.readDirSync(dir)].map((f) => f.name).filter((n) =>
      n.startsWith('music-')
    )
    assertEquals(files, [second])
  }))

Deno.test('A new take makes the same words again with the next seed, replacing the track', () =>
  withTempDir(async (root) => {
    const { call, asked } = await played(root, {
      directions: [direction('transition')],
      cues: [cue('wary')],
    })
    await direct(call, 0)
    const first = (await roleplay(call)).cues![0]
    const res = await call('POST', '/api/sessions/s1/jobs', { kind: 'music', frameIndex: 0 })
    assertEquals(res.status, 201)
    await settled(call)
    const second = (await roleplay(call)).cues![0]
    assertEquals(second.id, first.id)
    assertEquals(second.values, first.values)
    assertEquals(second.track!.seed, first.track!.seed + 1)
    assert(second.track!.file !== first.track!.file)
    assertEquals(asked.map((a) => a.seed), [first.track!.seed, first.track!.seed + 1])
    assertEquals(asked[1].caption, asked[0].caption)
    const files = [...Deno.readDirSync(join(root, 's1'))].map((f) => f.name)
    assertEquals(files.filter((n) => n.startsWith('music-')), [second.track!.file])
  }))

Deno.test("A track can't be made without Music on, a Cue there, or a ComfyUI", () =>
  withTempDir(async (root) => {
    const { call, settings } = await played(root, {
      directions: [direction('transition')],
      cues: [cue('wary')],
    })
    const queue = () => call('POST', '/api/sessions/s1/jobs', { kind: 'music', frameIndex: 1 })
    assertEquals((await queue()).status, 409)
    const on = await settings.load()
    await settings.save({ ...on, music: false })
    assertEquals((await queue()).status, 409)
    await settings.save({ ...on, backends: [{ id: 'here', kind: 'here', address: '' }] })
    const none = await queue()
    assertEquals(none.status, 409)
    assertMatch((await none.json()).error, /Machines tab/)
  }))
