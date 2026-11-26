import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { filesGone, keepOptions, leaving, leftOutFrom, removeLeftOut } from './keep.ts'
import { dirSessionStore } from './session.ts'
import { contentsOf, filesIn } from './sessionParts.ts'
import { withTempDir } from './testing.ts'
import { KEEP_ALL, type LeftOut } from '../shared/keep.ts'
import type { RoleplaySession } from '../shared/roleplay.ts'
import type { Session } from '../shared/session.ts'

const clip = (model: string, kind: string, file: string) => ({ model, kind, file })

/**
 * A Roleplay with every part: Frame 1 pictured by Qwen (upscaled, a SHARP scene, two clips by LTX,
 * and an edit, picked, with its painted area and its own clip) and by Krea; Frame 2 by Krea alone;
 * a voice, a spoken line and thought, a Cue's track.
 */
const roleplay = () =>
  ({
    id: 'r1',
    kind: 'roleplay',
    title: 'Tavern',
    settings: { imageModel: 'qwen' },
    thumbnail: 'frame-1-bbbbbbbb.png',
    voice: { description: 'gruff', ref: 'voice-11111111.wav' },
    cues: [{ id: 'c1', track: { file: 'music-cue-11111111-22222222.flac' } }, { id: 'c2' }],
    sheets: [{
      subject: 'Kael',
      ticked: true,
      identity: 'a lean man',
      seed: 1,
      made: {
        file: 'sheet-kael-12345678.png',
        views: [1, 2, 3].map((i) => `sheet-kael-12345678-view${i}.png`),
        mirrored: [1, 2, 3].map((i) => `sheet-kael-12345678-view${i}-mirrored.png`),
        imageModel: 'qwen',
      },
    }],
    frames: [
      {
        index: 0,
        pictures: [
          {
            imageModel: 'qwen',
            file: 'frame-0-aaaaaaaa.png',
            upscaled: 'frame-0-aaaaaaaa-2048.png',
            scene: { file: 'scene-0-aaaaaaaa.ply' },
            clips: [
              clip('ltx', 'lead-in', 'clip-0-lead-in-aaaaaaaa.mp4'),
              clip('ltx', 'idle-loop', 'clip-0-idle-loop-aaaaaaaa.mp4'),
            ],
            timings: { image: 30 },
            edits: [{
              file: 'edit-0-cccccccc.png',
              mask: 'mask-0-cccccccc.png',
              editModel: 'flux',
              instructions: ['a hat'],
              seed: 1,
              clips: [clip('ltx', 'lead-in', 'clip-0-lead-in-cccccccc.mp4')],
            }],
            picked: 1,
          },
          { imageModel: 'krea', file: 'frame-0-dddddddd.png' },
        ],
        speech: { file: 'speech-0-eeeeeeee.mp3', ref: 'voice-11111111.wav' },
        thoughtSpeech: { file: 'thought-0-eeeeeeee.mp3', ref: 'voice-11111111.wav' },
      },
      { index: 1, pictures: [{ imageModel: 'krea', file: 'frame-1-bbbbbbbb.png' }] },
    ],
  }) as unknown as RoleplaySession

/** Every file the Roleplay above has, call logs included. */
const every = () => {
  return [
    'frame-0-aaaaaaaa.png',
    'frame-0-aaaaaaaa-2048.png',
    'scene-0-aaaaaaaa.ply',
    'clip-0-lead-in-aaaaaaaa.mp4',
    'clip-0-idle-loop-aaaaaaaa.mp4',
    'edit-0-cccccccc.png',
    'mask-0-cccccccc.png',
    'clip-0-lead-in-cccccccc.mp4',
    'frame-0-dddddddd.png',
    'frame-1-bbbbbbbb.png',
    'speech-0-eeeeeeee.mp3',
    'thought-0-eeeeeeee.mp3',
    'voice-11111111.wav',
    'music-cue-11111111-22222222.flac',
    'sheet-kael-12345678.png',
    ...[1, 2, 3].flatMap((i) => [
      `sheet-kael-12345678-view${i}.png`,
      `sheet-kael-12345678-view${i}-mirrored.png`,
    ]),
    'calls/frame-0.json',
    'calls/setup.json',
  ]
}

/** What goes, sorted, for a choice. */
const goes = (left: Partial<LeftOut>) => {
  const before = roleplay()
  const all = { ...KEEP_ALL, ...left }
  return filesGone(before, leaving(before, all), every(), all).sort()
}

Deno.test('Keeping everything changes nothing and deletes nothing', () => {
  assertEquals(leaving(roleplay(), KEEP_ALL), roleplay())
  assertEquals(goes({}), [])
})

Deno.test("An Image Model left out takes everything made from its pictures, and Home's picture", () => {
  assertEquals(goes({ imageModels: ['qwen'] }), [
    'clip-0-idle-loop-aaaaaaaa.mp4',
    'clip-0-lead-in-aaaaaaaa.mp4',
    'clip-0-lead-in-cccccccc.mp4',
    'edit-0-cccccccc.png',
    'frame-0-aaaaaaaa-2048.png',
    'frame-0-aaaaaaaa.png',
    'mask-0-cccccccc.png',
    'scene-0-aaaaaaaa.ply',
  ])
  const after = leaving(roleplay(), { ...KEEP_ALL, imageModels: ['krea'] })
  assertEquals(after.thumbnail, undefined)
  assertEquals(after.frames.map((f) => f.pictures.length), [1, 0])
})

Deno.test('Edits left out take their painted areas and what was made from them; the render is the picture again', () => {
  assertEquals(goes({ edits: true }), [
    'clip-0-lead-in-cccccccc.mp4',
    'edit-0-cccccccc.png',
    'mask-0-cccccccc.png',
  ])
  const [qwen] = leaving(roleplay(), { ...KEEP_ALL, edits: true }).frames[0].pictures
  assertEquals([qwen.edits, qwen.picked], [undefined, undefined])
})

Deno.test('Upscales, a kind of clip, a kind of 3D, each sound and the call logs go alone', () => {
  assertEquals(goes({ upscales: true }), ['frame-0-aaaaaaaa-2048.png'])
  assertEquals(goes({ clips: { ltx: ['lead-in'] } }), [
    'clip-0-lead-in-aaaaaaaa.mp4',
    'clip-0-lead-in-cccccccc.mp4',
  ])
  assertEquals(goes({ threeD: ['scene'] }), ['scene-0-aaaaaaaa.ply'])
  assertEquals(goes({ sound: ['speech'] }), ['speech-0-eeeeeeee.mp3', 'thought-0-eeeeeeee.mp3'])
  assertEquals(goes({ sound: ['voices'] }), ['voice-11111111.wav'])
  assertEquals(goes({ sound: ['cues'] }), ['music-cue-11111111-22222222.flac'])
  assertEquals(goes({ calls: true }), ['calls/frame-0.json', 'calls/setup.json'])
  // The records go with them: a line's voice stays named, its description kept.
  const quiet = leaving(roleplay(), { ...KEEP_ALL, sound: ['voices', 'cues'] }) as RoleplaySession
  assertEquals(quiet.voice, { description: 'gruff' })
  assertEquals(quiet.cues.map((c) => c.track), [undefined, undefined])
  const still = leaving(roleplay(), { ...KEEP_ALL, clips: { ltx: ['lead-in', 'idle-loop'] } })
  assertEquals(still.frames[0].pictures[0].clips, undefined)
})

Deno.test('The reference sheets are never left out, as later pictures need them', () => {
  const nothing: LeftOut = {
    imageModels: ['qwen', 'krea'],
    upscales: true,
    edits: true,
    beforeFaces: true,
    chosenOnly: true,
    clips: { ltx: ['lead-in', 'idle-loop'] },
    threeD: ['scene'],
    sound: ['speech', 'voices', 'cues'],
    calls: true,
  }
  assertEquals(goes(nothing).filter((f) => f.startsWith('sheet-')), [])
  assertEquals((leaving(roleplay(), nothing) as RoleplaySession).sheets, roleplay().sheets)
})

Deno.test("Chosen picture only keeps each Frame's picture by the Session's model as it shows, a picked edit as its Original", () => {
  const after = leaving(roleplay(), { ...KEEP_ALL, chosenOnly: true })
  assertEquals(
    after.frames[0].pictures,
    [{
      imageModel: 'qwen',
      file: 'edit-0-cccccccc.png',
      clips: [clip('ltx', 'lead-in', 'clip-0-lead-in-cccccccc.mp4')],
    }] as unknown as Session['frames'][0]['pictures'],
  )
  // No picture by Qwen: not yet pictured.
  assertEquals(after.frames[1].pictures, [])
  assertEquals(goes({ chosenOnly: true }), [
    'clip-0-idle-loop-aaaaaaaa.mp4',
    'clip-0-lead-in-aaaaaaaa.mp4',
    'frame-0-aaaaaaaa-2048.png',
    'frame-0-aaaaaaaa.png',
    'frame-0-dddddddd.png',
    'frame-1-bbbbbbbb.png',
    'mask-0-cccccccc.png',
    'scene-0-aaaaaaaa.ply',
  ])
})

Deno.test('The options, each with its size on its own', () => {
  const sizes = new Map(every().map((f, i) => [f, 10 + i]))
  const options = keepOptions(roleplay(), sizes, 7)
  assertEquals(options.imageModel, 'qwen')
  assertEquals(options.imageModels.map((m) => [m.model, m.count]), [['qwen', 1], ['krea', 2]])
  assertEquals(options.edits.count, 1)
  assertEquals(options.upscales, { count: 1, size: sizes.get('frame-0-aaaaaaaa-2048.png') })
  assertEquals(options.chosen.count, 1)
  assertEquals(
    options.clips.map((c) => [c.model, c.kinds.map((k) => [k.kind, k.count])]),
    [['ltx', [['lead-in', 2], ['idle-loop', 1]]]],
  )
  assertEquals(options.threeD.map((t) => [t.kind, t.count]), [['scene', 1]])
  assertEquals(options.sound.map((t) => [t.kind, t.count]), [['speech', 2], ['voices', 1], [
    'cues',
    1,
  ]])
  assertEquals(options.calls.count, 7)
})

Deno.test("What's left out is refused unless it's the right shape", () => {
  assertEquals(leftOutFrom(KEEP_ALL), KEEP_ALL)
  for (
    const bad of [null, {}, { ...KEEP_ALL, edits: 'yes' }, { ...KEEP_ALL, threeD: ['mesh'] }, {
      ...KEEP_ALL,
      clips: { ltx: 'lead-in' },
    }]
  ) {
    let refused = false
    try {
      leftOutFrom(bad)
    } catch {
      refused = true
    }
    assertEquals(refused, true, JSON.stringify(bad))
  }
})

Deno.test('Remove the rest saves the Session without what goes, and deletes just those files', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const session = roleplay()
    await store.save(session)
    await Deno.mkdir(join(root, 'r1', 'calls'))
    for (const f of every()) await Deno.writeFile(join(root, 'r1', f), new Uint8Array(5))
    const left = { ...KEEP_ALL, imageModels: ['krea'], calls: true, sound: ['speech' as const] }
    const { session: after, freed } = await removeLeftOut(
      store,
      session,
      left,
      await filesIn(join(root, 'r1')),
    )
    const on = (await filesIn(join(root, 'r1'))).map((f) => f.path).sort()
    assertEquals(
      on,
      every().filter((f) =>
        ![
          'frame-0-dddddddd.png',
          'frame-1-bbbbbbbb.png',
          'speech-0-eeeeeeee.mp3',
          'thought-0-eeeeeeee.mp3',
        ].includes(f) &&
        !f.startsWith('calls/')
      ).concat('session.json').sort(),
    )
    assertEquals(freed, 6 * 5)
    assertEquals(await store.load('r1'), after)
  }))

const pass = (other: string, without = false) => ({
  subjects: ['Kael'],
  seed: 8,
  without,
  other: { file: other },
  timings: { find: 5, faces: 50 },
})

/**
 * A Storyboard with face passes: Frame 1's render (faces in use, upscaled) and its edit, picked
 * (faces in use); Frame 2's render, used without its face pass.
 */
const faced = () =>
  ({
    id: 's1',
    kind: 'storyboard',
    settings: { imageModel: 'qwen' },
    sheets: [],
    frames: [
      {
        index: 0,
        pictures: [{
          imageModel: 'qwen',
          file: 'frame-0-aaaaaaaa.png',
          faces: {
            ...pass('frame-0-a0a0a0a0.png'),
            other: { file: 'frame-0-a0a0a0a0.png', upscaled: 'frame-0-a0a0a0a0-2048.png' },
          },
          edits: [{
            file: 'frame-0-cccccccc.png',
            editModel: 'qwen-edit',
            instructions: ['a low angle'],
            seed: 9,
            faces: { ...pass('edit-0-c0c0c0c0.png'), seed: 10 },
          }],
          picked: 1,
        }],
      },
      {
        index: 1,
        pictures: [{
          imageModel: 'qwen',
          file: 'frame-1-b0b0b0b0.png',
          faces: pass('frame-1-bbbbbbbb.png', true),
        }],
      },
    ],
  }) as unknown as Session

Deno.test('Renders before the face pass go where the faces are in use, the faces saying whose', () => {
  const left = { ...KEEP_ALL, beforeFaces: true }
  const after = leaving(faced(), left)
  const [first] = after.frames[0].pictures
  assertEquals(first.faces, {
    subjects: ['Kael'],
    seed: 8,
    without: false,
    timings: { find: 5, faces: 50 },
  })
  assertEquals(first.edits![0].faces, {
    subjects: ['Kael'],
    seed: 10,
    without: false,
    timings: { find: 5, faces: 50 },
  })
  // Frame 2 uses its render: the faces beside it stay, to take back.
  assertEquals(after.frames[1].pictures[0], faced().frames[1].pictures[0])
  assertEquals(filesGone(faced(), after, [], left).sort(), [
    'edit-0-c0c0c0c0.png',
    'frame-0-a0a0a0a0-2048.png',
    'frame-0-a0a0a0a0.png',
  ])
  const sizes = new Map([['frame-0-a0a0a0a0.png', 10], ['frame-0-a0a0a0a0-2048.png', 40], [
    'edit-0-c0c0c0c0.png',
    5,
  ]])
  assertEquals(keepOptions(faced(), sizes, 0).beforeFaces, { count: 2, size: 55 })
})

Deno.test("Chosen picture only keeps a face pass's whose and seed, or the render a Frame uses", () => {
  const after = leaving(faced(), { ...KEEP_ALL, chosenOnly: true })
  assertEquals(after.frames[0].pictures, [{
    imageModel: 'qwen',
    file: 'frame-0-cccccccc.png',
    faces: { subjects: ['Kael'], seed: 10, without: false, timings: { find: 5, faces: 50 } },
  }])
  assertEquals(after.frames[1].pictures, [{ imageModel: 'qwen', file: 'frame-1-b0b0b0b0.png' }])
})

Deno.test('The size bar says how much of the pictures is renders before the face pass', () =>
  withTempDir(async (dir) => {
    const files = {
      'frame-0-aaaaaaaa.png': 3,
      'frame-0-a0a0a0a0.png': 10,
      'frame-0-a0a0a0a0-2048.png': 40,
      'frame-1-bbbbbbbb.png': 7,
    }
    for (const [name, size] of Object.entries(files)) {
      await Deno.writeFile(join(dir, name), new Uint8Array(size))
    }
    const contents = await contentsOf(faced(), dir)
    assertEquals([contents.parts.pictures, contents.beforeFaces], [60, 50])
  }))
