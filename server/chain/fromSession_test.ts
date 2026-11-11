import { assertEquals, assertNotEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { composePrompt } from '../look.ts'
import { sentences, subjectSentence } from '../imagePrompt.ts'
import { dirSessionStore } from '../session.ts'
import type { Look, StoryboardFrame, StoryboardSession } from '../../shared/session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { withTempDir } from '../testing.ts'
import { pictureFiles } from '../pictures.ts'
import {
  chainFromRoleplay,
  chainFromStoryboard,
  CopyError,
  NO_ONE,
  oneSubject,
} from './fromSession.ts'
import type { RoleplayFrame, RoleplaySession } from '../../shared/roleplay.ts'
import { replyOf, testCast } from '../roleplay/testing.ts'

const look: Look = {
  subjects: [
    { name: 'Mara', identity: 'Mara, a woman in her 30s, lean, with short red hair.' },
    { name: 'Cal', identity: 'Cal, a man in his 40s. He has a grey beard.' },
  ],
  style: 'Ink sketch, loose cross-hatching.',
}
const body = 'They stand. They smile. Eye level. Coats. A dock. Dusk. Blues.'

const frame = (index: number, shown: string[], extra: Partial<StoryboardFrame> = {}) => ({
  index,
  beat: `Beat ${index + 1}`,
  body,
  shown,
  prompt: composePrompt(look, body, shown),
  pictures: [{ image: `frame-${index}-0000000${index}.png`, imageModel: 'qwen' }],
  createdAt: '2026-10-16T00:00:00.000Z',
  ...extra,
})

const storyboard = (frames: StoryboardFrame[]): StoryboardSession => ({
  id: 'board',
  kind: 'storyboard',
  brief: 'Two old friends meet on a dock.',
  scenarioId: null,
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 42,
  createdAt: '2026-10-16T00:00:00.000Z',
  frameCount: frames.length,
  look,
  frames,
})

const chain = { id: 'chain', createdAt: '2026-10-16T01:00:00.000Z' }

/** Saves `board` with a file for each of its pictures, and their edits and painted areas. */
async function saved(root: string, board: StoryboardSession) {
  const store = dirSessionStore(root)
  await store.save(board)
  for (const f of board.frames) {
    for (const file of f.pictures.flatMap(pictureFiles)) {
      await Deno.writeTextFile(join(store.dir(board.id), file), file)
    }
  }
  return store
}

Deno.test('oneSubject joins identities into one sentence, every word kept', () => {
  assertEquals(
    oneSubject(look.subjects.map((p) => p.identity)),
    'Mara, a woman in her 30s, lean, with short red hair; Cal, a man in his 40s; He has a grey beard.',
  )
  assertEquals(oneSubject([]), NO_ONE)
})

Deno.test('chainFromStoryboard copies the Frames up to one, as nine-sentence prompts', () =>
  withTempDir(async (root) => {
    const board = storyboard([frame(0, ['Mara']), frame(1, ['Mara', 'Cal']), frame(2, [])])
    const store = await saved(root, board)
    const made = await chainFromStoryboard(store, board, 1, chain)

    assertEquals(made.kind, 'chain')
    assertEquals([made.brief, made.seed], [board.brief, 42])
    assertEquals(made.frames.map((f) => [f.index, f.action, f.outcome]), [
      [0, null, 'done'],
      [1, 'Beat 2', 'done'],
    ])
    // One person: the prompt is the Storyboard's as it was.
    assertEquals(made.frames[0].prompt, board.frames[0].prompt)
    // Two: one subject sentence for both, then the seven, then the style.
    const two = made.frames[1].prompt
    assertEquals(sentences(two).length, 9)
    assertEquals(subjectSentence(two), oneSubject(look.subjects.map((p) => p.identity)))
    // Only where sentences end changed, so the pictures still show the prompts.
    assertEquals(made.frames.flatMap((f) => f.pictures.map((p) => p.stale)), [undefined, undefined])

    // Each picture is a copy under a new name; the Storyboard's stay where they were.
    const copied = made.frames[1].pictures[0].image
    assertNotEquals(copied, board.frames[1].pictures[0].image)
    assertEquals(copied.startsWith('frame-1-'), true)
    assertEquals(await Deno.readTextFile(join(store.dir('chain'), copied)), 'frame-1-00000001.png')
    assertEquals((await store.load('board'))?.kind, 'storyboard')
    assertEquals((await store.load('chain'))?.frames.length, 2)
  }))

Deno.test('chainFromStoryboard copies a picture with its picked edit, the rest left behind', () =>
  withTempDir(async (root) => {
    const edit = (n: number) => ({
      image: `edit-0-0000000${n}.png`,
      instructions: [`Paint ${n}`],
      editModel: 'qwen-image-2.1-edit',
      seed: 42,
      mask: `mask-0-0000000${n}.png`,
    })
    const pictures = [{
      image: 'frame-0-00000000.png',
      imageModel: 'qwen',
      edits: [edit(1), { ...edit(2), upscaled: 'edit-0-00000002-2048.png' }, edit(3)],
      picked: 2,
    }]
    const board = storyboard([frame(0, ['Mara'], { pictures }), frame(1, ['Mara'])])
    const store = await saved(root, board)
    const made = await chainFromStoryboard(store, board, 1, chain)
    const [render, picked] = [made.frames[0].pictures[0], made.frames[0].pictures[0].edits![0]]
    // The render and Edit 2, still picked, with the instructions that led to it; no masks.
    assertEquals([made.frames[0].pictures[0].edits!.length, render.picked], [1, 1])
    assertEquals([picked.instructions, picked.copied, picked.mask], [
      ['Paint 1', 'Paint 2'],
      true,
      undefined,
    ])
    const read = (file: string) => Deno.readTextFile(join(store.dir('chain'), file))
    assertEquals(await read(render.image), 'frame-0-00000000.png')
    assertEquals(await read(picked.image), 'edit-0-00000002.png')
    assertEquals(await read(picked.upscaled!), 'edit-0-00000002-2048.png')
    // The render picked: it alone is copied.
    const plain = storyboard([frame(0, ['Mara'], { pictures: [{ ...pictures[0], picked: 0 }] })])
    const alone = await chainFromStoryboard(store, plain, 0, { ...chain, id: 'chain2' })
    assertEquals([alone.frames[0].pictures[0].edits, alone.frames[0].pictures[0].picked], [
      undefined,
      undefined,
    ])
  }))

Deno.test('chainFromStoryboard gives a Frame of no one a subject, its pictures out of date', () =>
  withTempDir(async (root) => {
    const board = storyboard([frame(0, [])])
    const made = await chainFromStoryboard(await saved(root, board), board, 0, chain)
    assertEquals(subjectSentence(made.frames[0].prompt), NO_ONE)
    assertEquals(sentences(made.frames[0].prompt).length, 9)
    assertEquals(made.frames[0].pictures[0].stale, true)
  }))

Deno.test('chainFromStoryboard leaves out blocked Frames, and refuses to end on one', () =>
  withTempDir(async (root) => {
    const board = storyboard([
      frame(0, ['Mara']),
      frame(1, ['Mara'], { blocked: 'no nudity' }),
      frame(2, ['Cal']),
    ])
    const store = await saved(root, board)
    const made = await chainFromStoryboard(store, board, 2, chain)
    assertEquals(made.frames.map((f) => [f.index, f.action]), [[0, null], [1, 'Beat 3']])
    assertEquals(made.frames[1].narration, "From the Storyboard's Frame 3.")
    await assertRejects(
      () => chainFromStoryboard(store, board, 1, { ...chain, id: 'chain-2' }),
      CopyError,
      'Frame 2 crosses a limit',
    )
    assertEquals(await store.load('chain-2'), undefined)
  }))

Deno.test('chainFromStoryboard refuses Frames not written yet', () =>
  withTempDir(async (root) => {
    const board = storyboard([
      frame(0, ['Mara']),
      frame(1, ['Mara'], { body: '', prompt: '', pictures: [] }),
    ])
    const store = await saved(root, board)
    assertEquals((await chainFromStoryboard(store, board, 0, chain)).frames.length, 1)
    await assertRejects(
      () => chainFromStoryboard(store, board, 1, { ...chain, id: 'chain-2' }),
      CopyError,
      'Write the Frames up to Frame 2 first',
    )
  }))

Deno.test('chainFromStoryboard saves nothing when a picture file is missing', () =>
  withTempDir(async (root) => {
    const board = storyboard([frame(0, ['Mara'])])
    const store = dirSessionStore(root)
    await store.save(board)
    await assertRejects(() => chainFromStoryboard(store, board, 0, chain), Deno.errors.NotFound)
    assertEquals(await store.load('chain'), undefined)
  }))

const roleplay = (frames: RoleplayFrame[]): RoleplaySession => ({
  id: 'talk',
  kind: 'roleplay',
  brief: 'Two old friends meet on a dock.',
  scenarioId: null,
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 7,
  createdAt: '2026-11-11T00:00:00.000Z',
  cast: testCast,
  look,
  cues: [],
  frames,
})

const exchange = (index: number, extra: Partial<RoleplayFrame> = {}): RoleplayFrame => ({
  index,
  message: index ? `Message ${index}` : null,
  reply: replyOf(`Reply ${index}`),
  timings: { text: 1 },
  textModel: 'fake',
  pictures: [],
  createdAt: '2026-11-11T00:00:00.000Z',
  ...extra,
})

const pictured = (index: number, shown: string[], extra: Partial<RoleplayFrame> = {}) =>
  exchange(index, {
    body,
    shown,
    prompt: composePrompt(look, body, shown),
    pictureTimings: { text: 3.5 },
    pictureModel: 'artist',
    pictures: [{
      image: `frame-${index}-0000000${index}.png`,
      imageModel: 'qwen',
      clips: [{
        kind: 'idle-loop',
        model: 'ltx',
        file: `clip-${index}-00000000.mp4`,
        prompt: 'She breathes.',
        speech: false,
        seconds: 4,
        seed: 7,
        timings: { clip: 30 },
      }],
    }],
    ...extra,
  })

/** Saves `talk` with a file for each of its pictures. */
async function savedRoleplay(root: string, talk: RoleplaySession) {
  const store = dirSessionStore(root)
  await store.save(talk)
  for (const f of talk.frames) {
    for (const file of f.pictures.flatMap(pictureFiles)) {
      await Deno.writeTextFile(join(store.dir(talk.id), file), file)
    }
  }
  return store
}

Deno.test('chainFromRoleplay opens a Chain on one pictured Frame, its picture copied', () =>
  withTempDir(async (root) => {
    const talk = roleplay([pictured(0, ['Mara']), exchange(1), pictured(2, ['Mara', 'Cal'])])
    const store = await savedRoleplay(root, talk)
    const made = await chainFromRoleplay(store, talk, 2, chain)

    assertEquals([made.kind, made.brief, made.seed], ['chain', talk.brief, 7])
    assertEquals(made.frames.length, 1)
    const [opening] = made.frames
    assertEquals([opening.index, opening.action, opening.outcome], [0, null, 'done'])
    assertEquals(opening.narration, "From the Roleplay's Frame 3.")
    assertEquals([opening.timings, opening.textModel], [{ text: 3.5 }, 'artist'])
    // Nine sentences, both people in one subject sentence, the picture still matching it.
    assertEquals(sentences(opening.prompt).length, 9)
    assertEquals(subjectSentence(opening.prompt), oneSubject(look.subjects.map((p) => p.identity)))
    const [picture] = opening.pictures
    assertEquals([picture.stale, picture.clips], [undefined, undefined])
    assertEquals(picture.image.startsWith('frame-0-'), true)
    assertEquals(
      await Deno.readTextFile(join(store.dir('chain'), picture.image)),
      'frame-2-00000002.png',
    )
    assertEquals((await store.load('talk'))?.frames.length, 3)
  }))

Deno.test('chainFromRoleplay refuses a Frame not pictured, or one crossing a limit', () =>
  withTempDir(async (root) => {
    const talk = roleplay([
      pictured(0, ['Mara'], { blocked: 'no nudity' }),
      exchange(1),
    ])
    const store = await savedRoleplay(root, talk)
    await assertRejects(
      () => chainFromRoleplay(store, talk, 1, chain),
      CopyError,
      'Picture Frame 2 first',
    )
    await assertRejects(
      () => chainFromRoleplay(store, talk, 0, chain),
      CopyError,
      'Frame 1 crosses a limit',
    )
    assertEquals(await store.load('chain'), undefined)
  }))
