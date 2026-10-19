import { assertEquals, assertMatch, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore, type StoryboardSession } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { composePrompt, MAX_SHOWN } from '../look.ts'
import { LimitError } from '../limits.ts'
import {
  editFrameByAction,
  FRAME_COUNT,
  insertBeat,
  planStoryboard,
  removeBeat,
  renderStoryboardFrame,
  restartStoryboard,
  setBeat,
  setFrameBody,
  setLook,
  StageError,
  type StoryboardEvent,
  writeStoryboard,
} from './storyboard.ts'
import { briefScenario } from '../scenario.ts'
import { switchImageModel } from '../pictures.ts'
import { callFile } from '../calls.ts'
import { GoneError } from '../update.ts'
import {
  fakeImageGenerator,
  planOf,
  scriptedTextModel,
  withTempDir,
  writtenBody,
} from '../testing.ts'

const scenario = briefScenario('A player dribbles and dunks, sketch style.')
const signal = () => new AbortController().signal

const newStoryboard = (frameCount = 3): StoryboardSession => ({
  id: 's1',
  kind: 'storyboard',
  brief: 'A player dribbles and dunks, sketch style.',
  scenarioId: null,
  settings: { ...DEFAULT_SETTINGS, textModel: 'fake' },
  seed: 7,
  createdAt: '2026-09-25T00:00:00.000Z',
  frameCount,
  look: null,
  frames: [],
})

function depsFor(
  root: string,
  scripts: Parameters<typeof scriptedTextModel>[2] = {},
  realPeople: string[] = [],
) {
  const images = fakeImageGenerator()
  const textModel = scriptedTextModel([], realPeople, scripts)
  return {
    deps: { store: dirSessionStore(root), textModel, imageGenerator: images },
    images,
    textModel,
  }
}

/** A Storyboard of three Frames, planned (and written, unless `write` is false). */
async function planned(
  root: string,
  scripts: Parameters<typeof scriptedTextModel>[2] = {},
  write = true,
) {
  const { deps, images, textModel } = depsFor(root, { plans: [planOf(3)], ...scripts })
  const plan = await planStoryboard(deps, newStoryboard(), scenario, () => {}, signal())
  const session = write ? await writeStoryboard(deps, plan, scenario, () => {}, signal()) : plan
  return { deps, images, textModel, session }
}

Deno.test('planStoryboard streams the Look and Beats, then saves them unwritten', () =>
  withTempDir(async (root) => {
    const { deps } = depsFor(root, { plans: [planOf(2)] })
    const events: StoryboardEvent[] = []
    const session = await planStoryboard(
      deps,
      newStoryboard(2),
      scenario,
      (e) => events.push(e),
      signal(),
    )
    assertEquals(events.map((e) => e.type), [
      'phase',
      'look',
      'planned-beat',
      'planned-beat',
      'planned',
    ])
    assertEquals(session.look, planOf(2).look)
    assertEquals(
      session.frames.map(({ beat, body, shown, prompt }) => ({ beat, body, shown, prompt })),
      [
        { beat: 'Beat 1', body: '', shown: ['Ace'], prompt: '' },
        { beat: 'Beat 2', body: '', shown: ['Ace'], prompt: '' },
      ],
    )
    assertEquals((await deps.store.load('s1'))!.frames.length, 2)
  }))

Deno.test('planStoryboard refuses a Brief or a Look that crosses a Limit, saving nothing', () =>
  withTempDir(async (root) => {
    const { deps } = depsFor(root, { plans: [planOf(3)] })
    await assertRejects(
      () =>
        planStoryboard(
          deps,
          newStoryboard(),
          briefScenario('a teenager running'),
          () => {},
          signal(),
        ),
      LimitError,
      'everyone depicted must be an adult',
    )
    const bad = planOf(2, { look: { subjects: [], style: 'Lingerie catalogue shot.' } })
    const { deps: deps2 } = depsFor(root, { plans: [bad] })
    await assertRejects(
      () => planStoryboard(deps2, newStoryboard(2), scenario, () => {}, signal()),
      LimitError,
    )
    assertEquals(await deps.store.load('s1'), undefined)
  }))

Deno.test('writeStoryboard writes each Frame from the plan and the Frames before it', () =>
  withTempDir(async (root) => {
    const { deps, textModel, session: plan } = await planned(root, {}, false)
    const events: StoryboardEvent[] = []
    const session = await writeStoryboard(deps, plan, scenario, (e) => events.push(e), signal())
    assertEquals(events.map((e) => e.type), [
      'phase',
      'written-frame',
      'written-frame',
      'written-frame',
      'written',
    ])
    assertEquals(textModel.writeRequests.map((r) => [r.index, r.before]), [
      [0, []],
      [1, [writtenBody(0)]],
      [2, [writtenBody(0), writtenBody(1)]],
    ])
    assertEquals(textModel.writeRequests[0].beats[2], { beat: 'Beat 3', shown: ['Ace'] })
    const [first] = session.frames
    assertEquals(first.body, writtenBody(0))
    assertEquals(first.prompt, composePrompt(planOf(3).look, writtenBody(0), ['Ace']))
    assertEquals(typeof first.timings!.text, 'number')
    assertEquals(
      ((await deps.store.load('s1')) as StoryboardSession).frames[2].body,
      writtenBody(2),
    )
    await assertRejects(
      () => writeStoryboard(deps, session, scenario, () => {}, signal()),
      StageError,
      'written already',
    )
  }))

Deno.test('writeStoryboard keeps the Frames written when one fails, and carries on after', () =>
  withTempDir(async (root) => {
    const { deps, session: plan } = await planned(root, {
      writes: [{ body: 'He dribbles.' }, new Error('down'), new Error('down'), new Error('down')],
    }, false)
    await assertRejects(() => writeStoryboard(deps, plan, scenario, () => {}, signal()))
    const saved = (await deps.store.load('s1')) as StoryboardSession
    assertEquals(saved.frames.map((f) => f.body), ['He dribbles.', '', ''])

    const { deps: again, textModel } = depsFor(root)
    const session = await writeStoryboard(again, saved, scenario, () => {}, signal())
    assertEquals(textModel.writeRequests.map((r) => r.index), [1, 2])
    assertEquals(session.frames.map((f) => f.body), [
      'He dribbles.',
      writtenBody(1),
      writtenBody(2),
    ])
  }))

Deno.test('writeStoryboard refuses Beats across a Limit, and blocks a Frame that crosses one', () =>
  withTempDir(async (root) => {
    const { deps, session: plan, textModel } = await planned(root, {}, false)
    // A Beat edited by hand is checked as it's saved; this one stands in for one that slipped by.
    const bad = {
      ...plan,
      frames: plan.frames.map((f, i) => i ? f : { ...f, beat: 'Fully nude.' }),
    }
    await assertRejects(
      () => writeStoryboard(deps, bad, scenario, () => {}, signal()),
      LimitError,
      'A Beat crosses a limit',
    )
    assertEquals(textModel.writeRequests, [])

    const { deps: deps2 } = depsFor(root, {
      writes: [{ body: 'Stands.' }, { body: 'Stands, wrists bound.' }, { body: 'Sits.' }],
    })
    const session = await writeStoryboard(deps2, plan, scenario, () => {}, signal())
    assertEquals(session.frames.map((f) => f.blocked), [
      undefined,
      'no restraint, captivity or non-consent',
      undefined,
    ])
    await assertRejects(
      () => renderStoryboardFrame(deps2, session, 1, () => {}, signal()),
      LimitError,
      'Frame 2 crosses a limit',
    )
  }))

Deno.test('a Frame not written yet is neither rendered nor edited', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root, {}, false)
    await assertRejects(
      () => renderStoryboardFrame(deps, session, 0, () => {}, signal()),
      StageError,
      "Frame 1 isn't written yet",
    )
    await assertRejects(() => setFrameBody(deps, session, 0, 'He leaps.'), StageError)
    await assertRejects(
      () => editFrameByAction(deps, session, scenario, 0, 'jump', () => {}, signal()),
      StageError,
    )
  }))

Deno.test('renderStoryboardFrame renders one Frame, and a re-render replaces its image', () =>
  withTempDir(async (root) => {
    const { deps, images, session } = await planned(root)
    const [first] = (await renderStoryboardFrame(deps, session, 1, () => {}, signal())).pictures
    assertMatch(first.image, /^frame-1-[0-9a-f]{8}\.png$/)
    assertEquals(first.imageModel, 'qwen-image-2.1')
    assertEquals(images.prompts, [session.frames[1].prompt])
    assertEquals(typeof first.timings!.image, 'number')

    const [second] = (await renderStoryboardFrame(deps, session, 1, () => {}, signal())).pictures
    const files = (await Array.fromAsync(Deno.readDir(join(root, 's1')))).map((f) => f.name)
    assertEquals(files.includes(first.image), false)
    assertEquals(files.includes(second.image), true)
    assertEquals((await deps.store.load('s1'))!.frames[1].pictures, [second])
  }))

Deno.test("A re-render keeps another Image Model's picture, and an edit marks it stale too", () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    const [qwen] = (await renderStoryboardFrame(deps, session, 0, () => {}, signal())).pictures
    const klein = await switchImageModel(deps.store, session, 'flux2-klein-4b') as StoryboardSession
    const [, first] = (await renderStoryboardFrame(deps, klein, 0, () => {}, signal())).pictures
    assertEquals(first.imageModel, 'flux2-klein-4b')
    // Rendered again by the same model: that model's picture is replaced, the other kept.
    const second = (await renderStoryboardFrame(deps, klein, 0, () => {}, signal())).pictures
    assertEquals(second.map((p) => p.imageModel), ['qwen-image-2.1', 'flux2-klein-4b'])
    assertEquals(second[0], qwen)
    const files = (await Array.fromAsync(Deno.readDir(join(root, 's1')))).map((f) => f.name)
    assertEquals([first.image, qwen.image, second[1].image].map((f) => files.includes(f)), [
      false,
      true,
      true,
    ])

    const edited = await setFrameBody(deps, klein, 0, 'He leaps.')
    assertEquals(edited.frames[0].pictures.map((p) => p.stale), [true, true])
  }))

Deno.test('setFrameBody rewrites one Frame, marks it stale if rendered, and refuses Limits', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    await renderStoryboardFrame(deps, session, 0, () => {}, signal())
    const edited = await setFrameBody(deps, session, 0, 'He leaps.\n- Lighting: dusk.')
    assertEquals(edited.frames[0].body, 'He leaps. dusk.')
    assertEquals(edited.frames[0].prompt, composePrompt(edited.look!, 'He leaps. dusk.', ['Ace']))
    assertEquals(edited.frames[0].pictures.map((p) => p.stale), [true])
    assertEquals(edited.frames[1].pictures, [])
    await assertRejects(() => setFrameBody(deps, edited, 1, 'Fully nude.'), LimitError)

    // Who it shows can change with it: no one, here.
    const empty = await setFrameBody(deps, edited, 2, 'An empty court.', [])
    assertEquals(empty.frames[2].shown, [])
    assertEquals(empty.frames[2].prompt, 'An empty court. A pencil sketch.')
  }))

Deno.test('setBeat and setLook edit the plan until a Frame is written, then refuse', () =>
  withTempDir(async (root) => {
    const two = planOf(2, {
      look: {
        subjects: [
          { name: 'Ace', identity: 'Ace, a tall adult athlete.' },
          { name: 'Bo', identity: 'Bo, a stocky adult coach.' },
        ],
        style: 'Ink.',
      },
      beats: [{ beat: 'Ace shoots.', shown: ['Ace'] }, {
        beat: 'Bo shouts.',
        shown: ['Bo', 'Ace'],
      }],
    })
    const { deps } = depsFor(root, { plans: [two] })
    const plan = await planStoryboard(deps, newStoryboard(2), scenario, () => {}, signal())

    const beat = await setBeat(deps, plan, 0, '  Ace  misses. ', ['Bo', 'Zed'])
    assertEquals([beat.frames[0].beat, beat.frames[0].shown], ['Ace misses.', ['Bo']])
    await assertRejects(() => setBeat(deps, beat, 1, 'Bo is fully nude.'), LimitError)
    await assertRejects(() => setBeat(deps, beat, 1, ' '), Error, 'needs a line')

    // A person renamed in place stays shown where they were; one removed is dropped.
    const renamed = await setLook(deps, beat, {
      subjects: [
        { name: 'Ace', identity: 'Ace, a tall adult athlete.' },
        { name: 'Bo Dee', identity: 'Bo Dee, a stocky adult coach.' },
      ],
      style: 'Ink.',
    })
    assertEquals(renamed.frames.map((f) => f.shown), [['Bo Dee'], ['Bo Dee', 'Ace']])
    const removed = await setLook(deps, renamed, {
      subjects: [{ name: 'Ace', identity: 'Ace, a tall adult athlete.' }],
      style: 'Ink.',
    })
    assertEquals(removed.frames.map((f) => f.shown), [[], ['Ace']])
    await assertRejects(
      () =>
        setLook(deps, removed, {
          subjects: [{ name: 'Kid', identity: 'A child.' }],
          style: 'Ink.',
        }),
      LimitError,
    )
    await assertRejects(
      () => setLook(deps, removed, { subjects: [{ name: 'Ace', identity: '' }], style: 'Ink.' }),
      Error,
      'needs a name and an identity',
    )

    const written = await writeStoryboard(deps, removed, scenario, () => {}, signal())
    await assertRejects(() => setBeat(deps, written, 0, 'Ace dunks.'), StageError, 'restart')
    await assertRejects(() => setLook(deps, written, removed.look!), StageError, 'restart')
  }))

Deno.test('insertBeat adds a Beat anywhere in the plan until a Frame is written', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root, {}, false)
    const between = await insertBeat(deps, session, 1, '  Ace  pivots. ', [])
    assertEquals(between.frames.map((f) => [f.index, f.beat]), [
      [0, 'Beat 1'],
      [1, 'Ace pivots.'],
      [2, 'Beat 2'],
      [3, 'Beat 3'],
    ])
    assertEquals([between.frames[1].body, between.frames[1].shown], ['', []])
    // Without who it shows, it shows whoever the Frame before it does; at the start, the one after.
    const last = await insertBeat(deps, between, 4, 'Ace bows.')
    assertEquals([last.frames[4].beat, last.frames[4].shown], ['Ace bows.', ['Ace']])
    const first = await insertBeat(deps, last, 0, 'The empty court.')
    assertEquals(first.frames[0].shown, ['Ace'])
    assertEquals(first.frames.map((f) => f.index), [0, 1, 2, 3, 4, 5])

    await assertRejects(() => insertBeat(deps, first, 1, 'Ace is fully nude.'), LimitError)
    await assertRejects(() => insertBeat(deps, first, 1, ' '), Error, 'needs a line')
    await assertRejects(() => insertBeat(deps, first, 7, 'Ace waves.'), Error, '1 to 7')

    // Written out like any other Beat, then fixed.
    const written = await writeStoryboard(deps, first, scenario, () => {}, signal())
    assertEquals(written.frames.every((f) => f.body !== ''), true)
    await assertRejects(() => insertBeat(deps, written, 0, 'Ace waves.'), StageError, 'restart')
  }))

Deno.test('insertBeat stops at the most Frames a Storyboard has', () =>
  withTempDir(async (root) => {
    const { deps } = depsFor(root, { plans: [planOf(FRAME_COUNT.max)] })
    const full = await planStoryboard(
      deps,
      newStoryboard(FRAME_COUNT.max),
      scenario,
      () => {},
      signal(),
    )
    await assertRejects(() => insertBeat(deps, full, 0, 'Ace waves.'), StageError, 'at most')
  }))

Deno.test('removeBeat takes a Beat out of the plan until a Frame is written', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root, {}, false)
    const seen = (s: StoryboardSession, i: number) => ({
      frames: s.frames.length,
      createdAt: s.frames[i].createdAt,
    })
    const removed = await removeBeat(deps, session, 1, seen(session, 1))
    assertEquals(removed.frames.map((f) => [f.index, f.beat]), [[0, 'Beat 1'], [1, 'Beat 3']])
    // Sent again, as the plan was seen then: the Beat that took its place stays.
    await assertRejects(() => removeBeat(deps, removed, 1, seen(session, 1)), GoneError)

    const one = await removeBeat(deps, removed, 0, seen(removed, 0))
    await assertRejects(() => removeBeat(deps, one, 0, seen(one, 0)), StageError, 'at least one')

    const written = await writeStoryboard(deps, one, scenario, () => {}, signal())
    await assertRejects(() => removeBeat(deps, written, 0, seen(written, 0)), StageError, 'restart')
  }))

Deno.test('A restarted plan keeps its call log with each Frame as Beats are added and removed', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    const dir = deps.store.dir('s1')
    await Deno.mkdir(join(dir, 'calls'), { recursive: true })
    for (const i of [0, 1, 2]) await Deno.writeTextFile(callFile(dir, i), `Beat ${i + 1}`)
    const restarted = await restartStoryboard(deps, session)
    const log = (i: number) => Deno.readTextFile(callFile(dir, i)).catch(() => null)

    const added = await insertBeat(deps, restarted, 1, 'Ace pivots.')
    assertEquals(await Promise.all([0, 1, 2, 3].map(log)), ['Beat 1', null, 'Beat 2', 'Beat 3'])
    await removeBeat(deps, added, 0, { frames: 4, createdAt: added.frames[0].createdAt })
    assertEquals(await Promise.all([0, 1, 2].map(log)), [null, 'Beat 2', 'Beat 3'])
  }))

Deno.test('restartStoryboard takes it back to its plan, deleting the pictures', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    const rendered = await renderStoryboardFrame(deps, session, 1, () => {}, signal())
    const restarted = await restartStoryboard(
      deps,
      (await deps.store.load('s1')) as StoryboardSession,
    )
    assertEquals(
      restarted.frames.map(({ beat, body, prompt, pictures, timings }) => ({
        beat,
        body,
        prompt,
        pictures,
        timings,
      })),
      ['Beat 1', 'Beat 2', 'Beat 3'].map((beat) => ({
        beat,
        body: '',
        prompt: '',
        pictures: [],
        timings: undefined,
      })),
    )
    assertEquals(restarted.frames[1].shown, ['Ace'])
    const files = (await Array.fromAsync(Deno.readDir(join(root, 's1')))).map((f) => f.name)
    assertEquals(files.includes(rendered.pictures[0].image), false)
    // The plan can be edited again.
    const edited = await setBeat(deps, restarted, 0, 'Ace warms up.')
    assertEquals(edited.frames[0].beat, 'Ace warms up.')
  }))

Deno.test('a Frame shows only the Subjects its Beat names, at most three, and no one for a place', () =>
  withTempDir(async (root) => {
    // Without a full stop, an identity still ends as a sentence.
    const subjects = ['Ana', 'Ben', 'Cal', 'Dee'].map((name) => ({
      name,
      identity: `${name}, an adult sailor`,
    }))
    const plan = planOf(3, {
      look: { subjects, style: 'Film still.' },
      beats: [
        { beat: 'Ben raises a lantern.', shown: ['ben', 'Zoe'] },
        { beat: 'The crew hauls a rope.', shown: ['Ana', 'Ben', 'Cal', 'Dee'] },
        { beat: 'Rain on an empty street.', shown: [] },
      ],
    })
    const { deps } = depsFor(root, {
      plans: [plan],
      writes: [
        { body: 'Ben raises a lantern.' },
        { body: 'The crew hauls a rope.' },
        { body: 'Rain on an empty street.' },
      ],
    })
    const beats = await planStoryboard(deps, newStoryboard(), scenario, () => {}, signal())
    // Matched to the Look's names; someone not in it is dropped.
    assertEquals(beats.frames[0].shown, ['Ben'])
    const session = await writeStoryboard(deps, beats, scenario, () => {}, signal())
    assertEquals(
      session.frames[0].prompt,
      'Ben, an adult sailor. Ben raises a lantern. Film still.',
    )
    assertEquals(MAX_SHOWN, 3)
    assertEquals(
      session.frames[1].prompt,
      'Ana, an adult sailor. Ben, an adult sailor. Cal, an adult sailor. ' +
        'The crew hauls a rope. Film still.',
    )
    assertEquals(session.frames[2].prompt, 'Rain on an empty street. Film still.')
  }))

Deno.test('editFrameByAction rewrites only its Frame, from the Look as it is', () =>
  withTempDir(async (root) => {
    const { deps, session, textModel } = await planned(root, {
      edits: [
        { outcome: 'done', narration: 'Pose: mid-air.', body: 'He soars.', shown: ['Ace'] },
        { outcome: 'done', narration: 'Ace leaves.', body: 'An empty hoop.', shown: [] },
      ],
    })
    const first = await editFrameByAction(
      deps,
      session,
      scenario,
      1,
      'jump higher',
      () => {},
      signal(),
    )
    assertEquals(first.outcome, 'done')
    assertEquals(first.session.frames[1].body, 'He soars.')
    assertEquals(first.session.frames[0], session.frames[0])
    assertEquals(first.session.look, session.look)

    const second = await editFrameByAction(
      deps,
      first.session,
      scenario,
      1,
      'he walks off',
      () => {},
      signal(),
    )
    assertEquals(second.session.frames[1].shown, [])
    assertEquals(second.session.frames[1].prompt, 'An empty hoop. A pencil sketch.')
    assertEquals(textModel.calls, 1 + 3 + 2) // the plan, three Frames written, two edits
  }))

Deno.test('editFrameByAction leaves everything as it was when declined or unclear', () =>
  withTempDir(async (root) => {
    const { deps, session, textModel } = await planned(root, {
      edits: [{
        outcome: 'unclear',
        narration: 'The Look is fixed: restart to change it.',
        body: 'x',
        shown: [],
      }],
    })
    const declined = await editFrameByAction(
      deps,
      session,
      scenario,
      0,
      'make him topless',
      () => {},
      signal(),
    )
    assertEquals(declined.outcome, 'declined')
    assertEquals(declined.narration, 'Declined: no sexual or nude imagery.')
    assertEquals(declined.session, session)
    assertEquals(textModel.calls, 4) // the plan and the Frames: the Action never reached it

    const unclear = await editFrameByAction(
      deps,
      session,
      scenario,
      0,
      'make him a giant',
      () => {},
      signal(),
    )
    assertEquals(unclear.outcome, 'unclear')
    assertEquals(unclear.session, session)
  }))

Deno.test('composePrompt ends each part as a sentence so they never run together', () => {
  const look = (identity: string, style: string) => ({ subjects: [{ name: 'X', identity }], style })
  assertEquals(
    composePrompt(look('A tall man ', 'Manga ink'), 'He jumps.', ['X']),
    'A tall man. He jumps. Manga ink.',
  )
  assertEquals(
    composePrompt(look('She asks "why?"', 'Oil paint!'), '', ['X']),
    'She asks "why?" Oil paint!',
  )
})
