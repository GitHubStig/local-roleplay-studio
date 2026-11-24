import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { contentsOf, partOf, servedFile } from './sessionParts.ts'
import { fromThisMachine, noteClient, ownAddress } from './http.ts'
import { withTempDir } from './testing.ts'
import type { Session } from '../shared/session.ts'

Deno.test('Each file in a Session folder belongs to its part, or to none', () => {
  const cases: [string, string | null][] = [
    ['frame-3-1a2b3c4d.png', 'pictures'],
    ['frame-3-1a2b3c4d-2048.png', 'pictures'],
    ['edit-3-1a2b3c4d.png', 'pictures'],
    ['mask-3-1a2b3c4d.png', 'pictures'],
    ['clip-3-lead-in-1a2b3c4d.mp4', 'clips'],
    ['scene-3-1a2b3c4d.ply', '3d'],
    ['lito-3-1a2b3c4d.ply', '3d'],
    ['voice-1a2b3c4d.wav', 'sound'],
    ['speech-3-1a2b3c4d.mp3', 'sound'],
    ['music-cue-1a2b3c4d-5e6f7a8b.flac', 'sound'],
    ['calls/frame-3.json', 'calls'],
    ['calls/setup.json', 'calls'],
    ['session.json', null],
    ['style.json', null],
    ['thumbs/frame-3-1a2b3c4d.webp', null],
  ]
  for (const [path, part] of cases) assertEquals(partOf(path), part, path)
  // Served: what the app shows, not its call logs or text.
  assertEquals(servedFile('frame-3-1a2b3c4d.png'), true)
  assertEquals(servedFile('calls/frame-3.json'), false)
  assertEquals(servedFile('session.json'), false)
})

Deno.test('What a Session holds: its size by part, and its counts', () =>
  withTempDir(async (dir) => {
    const picture = (imageModel: string, file: string) => ({
      imageModel,
      file,
      clips: [{ file: `clip-0-lead-in-${file.slice(8, 16)}.mp4` }],
      edits: [{
        file: 'edit-0-cccccccc.png',
        mask: 'mask-0-cccccccc.png',
        scene: { file: 'scene-0-dddddddd.ply' },
      }],
    })
    const session = {
      kind: 'roleplay',
      cues: [{ track: { file: 'music-cue-11111111-22222222.flac' } }, {}],
      frames: [
        {
          pictures: [picture('a', 'frame-0-aaaaaaaa.png'), picture('b', 'frame-0-bbbbbbbb.png')],
          speech: { file: 'speech-0-eeeeeeee.mp3' },
          thoughtSpeech: { file: 'thought-0-ffffffff.mp3' },
        },
        { pictures: [] },
      ],
    } as unknown as Session
    const write = (path: string, bytes: number) =>
      Deno.writeFile(join(dir, path), new Uint8Array(bytes))
    await Deno.mkdir(join(dir, 'calls'))
    await Deno.mkdir(join(dir, 'thumbs'))
    await write('frame-0-aaaaaaaa.png', 100)
    await write('frame-0-bbbbbbbb.png', 100)
    await write('clip-0-lead-in-aaaaaaaa.mp4', 40)
    await write('scene-0-dddddddd.ply', 30)
    await write('speech-0-eeeeeeee.mp3', 5)
    await write('music-cue-11111111-22222222.flac', 15)
    await write('session.json', 7)
    await write('thumbs/frame-0-aaaaaaaa.webp', 3)
    await Deno.writeTextFile(join(dir, 'calls', 'frame-1.json'), '[{}, {}]')
    await Deno.writeTextFile(join(dir, 'calls', 'setup.json'), '[{}]')
    const contents = await contentsOf(session, dir)
    assertEquals(contents.parts, { pictures: 200, clips: 40, '3d': 30, sound: 20, calls: 12 })
    assertEquals(contents.rest, 10)
    assertEquals(contents.size, 312)
    assertEquals(contents.counts, {
      frames: 2,
      pictures: 2,
      imageModels: 2,
      edits: 2,
      clips: 2,
      speech: 2,
      threeD: 2,
      cues: 1,
      calls: 3,
    })
  }))

const lan = () =>
  [{ address: '192.168.1.20' }, { address: 'fe80::1%en0' }] as Deno.NetworkInterfaceInfo[]

Deno.test("A machine's own addresses: loopback, and its interfaces', however written", () => {
  for (
    const a of [
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
      '192.168.1.20',
      '::ffff:192.168.1.20',
      'FE80::1',
    ]
  ) {
    assertEquals(ownAddress(a, lan), true, a)
  }
  for (const a of ['192.168.1.21', '10.0.0.5', '::2']) assertEquals(ownAddress(a, lan), false, a)
})

Deno.test("A browser is on the server's machine when it and whoever a proxy forwarded for are", () => {
  const from = (client: string | undefined, forwarded?: string) => {
    const req = new Request(
      'http://x/',
      forwarded ? { headers: { 'x-forwarded-for': forwarded } } : {},
    )
    if (client) noteClient(req, { transport: 'tcp', hostname: client, port: 1 })
    return fromThisMachine(req, lan)
  }
  assertEquals(from('127.0.0.1'), true)
  // Opened at the machine's own LAN address.
  assertEquals(from('192.168.1.20'), true)
  assertEquals(from('192.168.1.30'), false)
  // Vite's dev proxy, on this machine, for a phone and for this machine.
  assertEquals(from('127.0.0.1', '192.168.1.30'), false)
  assertEquals(from('127.0.0.1', '::1'), true)
  // Nobody said where it came from.
  assertEquals(from(undefined), false)
  // A header alone, from elsewhere, can't make it this machine.
  assertEquals(from('192.168.1.30', '127.0.0.1'), false)
})
