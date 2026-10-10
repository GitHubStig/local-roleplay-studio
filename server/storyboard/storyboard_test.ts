import { assertEquals, assertMatch, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore, type Look, type StoryboardSession } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { composePrompt, MAX_SHOWN } from '../look.ts'
import {
  editFrameByAction,
  LimitError,
  planStoryboard,
  renderStoryboardFrame,
  setFrameBody,
  setLook,
  type StoryboardEvent,
} from './storyboard.ts'
import { briefScenario } from '../scenario.ts'
import { switchImageModel } from '../pictures.ts'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from '../testing.ts'

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

async function planned(root: string, scripts: Parameters<typeof scriptedTextModel>[2] = {}) {
  const { deps, images, textModel } = depsFor(root, { plans: [planOf(3)], ...scripts })
  const session = await planStoryboard(deps, newStoryboard(), scenario, () => {}, signal())
  return { deps, images, textModel, session }
}

Deno.test('planStoryboard streams the Look, Beats and Frames, then saves them', () =>
  withTempDir(async (root) => {
    const { deps } = depsFor(root, { plans: [planOf(3)] })
    const events: StoryboardEvent[] = []
    const session = await planStoryboard(
      deps,
      newStoryboard(),
      scenario,
      (e) => events.push(e),
      signal(),
    )
    assertEquals(events.map((e) => e.type), [
      'phase',
      'look',
      'beats',
      'planned-frame',
      'planned-frame',
      'planned-frame',
      'planned',
    ])
    assertEquals(session.frames.length, 3)
    const [first] = session.frames
    assertEquals(first.beat, 'Beat 1')
    assertEquals(first.prompt, composePrompt(planOf(3).look, planOf(3).frames[0].body, ['Ace']))
    assertEquals(first.pictures, [])
    assertEquals(typeof first.timings!.text, 'number')
    assertEquals((await deps.store.load('s1'))!.frames.length, 3)
  }))

Deno.test('planStoryboard refuses a Brief that crosses a Limit, saving nothing', () =>
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
    assertEquals(await deps.store.load('s1'), undefined)
  }))

Deno.test('planStoryboard fails on a Look across a Limit, and blocks a Frame that crosses one', () =>
  withTempDir(async (root) => {
    const bad = planOf(2, { look: { people: [], style: 'Lingerie catalogue shot.' } })
    const { deps } = depsFor(root, { plans: [bad] })
    await assertRejects(
      () => planStoryboard(deps, newStoryboard(2), scenario, () => {}, signal()),
      LimitError,
    )

    const oneBad = planOf(2, {
      frames: [{ body: 'Stands.', shown: [] }, { body: 'Stands, wrists bound.', shown: [] }],
    })
    const { deps: deps2 } = depsFor(root, { plans: [oneBad] })
    const session = await planStoryboard(deps2, newStoryboard(2), scenario, () => {}, signal())
    assertEquals(session.frames[0].blocked, undefined)
    assertEquals(session.frames[1].blocked, 'no restraint, captivity or non-consent')
    await assertRejects(
      () => renderStoryboardFrame(deps2, session, 1, () => {}, signal()),
      LimitError,
      'Frame 2 crosses a limit',
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

Deno.test('setLook rewrites every Frame and marks the rendered ones stale', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    await renderStoryboardFrame(deps, session, 2, () => {}, signal())
    const look = {
      people: [{ name: 'Ace', identity: 'Ace, a short adult athlete.' }],
      style: 'A watercolour.',
    }
    const updated = await setLook(deps, session, look)
    for (const f of updated.frames) assertEquals(f.prompt, composePrompt(look, f.body, ['Ace']))
    assertEquals(updated.frames.map((f) => f.pictures.map((p) => p.stale)), [[], [], [true]])
    await assertRejects(
      () =>
        setLook(deps, updated, { people: [{ name: 'Kid', identity: 'A child.' }], style: 'Ink.' }),
      LimitError,
    )
    await assertRejects(
      () => setLook(deps, updated, { people: [{ name: 'Ace', identity: '' }], style: 'Ink.' }),
      Error,
      'needs a name and an identity',
    )
  }))

Deno.test('setLook keeps a person renamed in place shown, and drops one removed', () =>
  withTempDir(async (root) => {
    const two = planOf(2, {
      look: {
        people: [
          { name: 'Ace', identity: 'Ace, a tall adult athlete.' },
          { name: 'Bo', identity: 'Bo, a stocky adult coach.' },
        ],
        style: 'Ink.',
      },
      frames: [{ body: 'Ace shoots.', shown: ['Ace'] }, {
        body: 'Bo shouts.',
        shown: ['Bo', 'Ace'],
      }],
    })
    const { deps } = depsFor(root, { plans: [two] })
    const session = await planStoryboard(deps, newStoryboard(2), scenario, () => {}, signal())
    const renamed = await setLook(deps, session, {
      people: [
        { name: 'Ace Ray', identity: 'Ace Ray, a tall adult athlete.' },
        { name: 'Bo', identity: 'Bo, a stocky adult coach.' },
      ],
      style: 'Ink.',
    })
    assertEquals(renamed.frames.map((f) => f.shown), [['Ace Ray'], ['Bo', 'Ace Ray']])
    const removed = await setLook(deps, renamed, {
      people: [{ name: 'Bo', identity: 'Bo, a stocky adult coach.' }],
      style: 'Ink.',
    })
    assertEquals(removed.frames.map((f) => f.shown), [[], ['Bo']])
    assertEquals(removed.frames[0].prompt, 'Ace shoots. Ink.')
  }))

Deno.test('a Frame shows only the people it names, at most three, and no one for a place', () =>
  withTempDir(async (root) => {
    // Without a full stop, an identity still ends as a sentence.
    const people = ['Ana', 'Ben', 'Cal', 'Dee'].map((name) => ({
      name,
      identity: `${name}, an adult sailor`,
    }))
    const plan = planOf(3, {
      look: { people, style: 'Film still.' },
      frames: [
        { body: 'Ben raises a lantern.', shown: ['ben', 'Zoe'] },
        { body: 'The crew hauls a rope.', shown: ['Ana', 'Ben', 'Cal', 'Dee'] },
        { body: 'Rain on an empty street.', shown: [] },
      ],
    })
    const { deps } = depsFor(root, { plans: [plan] })
    const session = await planStoryboard(deps, newStoryboard(), scenario, () => {}, signal())
    // Matched to the Look's names; someone not in it is dropped.
    assertEquals(session.frames[0].shown, ['Ben'])
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

Deno.test('editFrameByAction rewrites the Frame, and a Look change reaches every Frame', () =>
  withTempDir(async (root) => {
    const look: Look = { ...planOf(3).look, style: 'Charcoal.' }
    const { deps, session } = await planned(root, {
      edits: [
        {
          outcome: 'done',
          narration: 'Pose: mid-air.',
          body: 'He soars.',
          shown: ['Ace'],
          look: planOf(3).look,
        },
        { outcome: 'done', narration: 'Ace leaves.', body: 'An empty hoop.', shown: [], look },
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
    assertEquals(first.session.frames[0].body, session.frames[0].body)

    const second = await editFrameByAction(
      deps,
      first.session,
      scenario,
      1,
      'charcoal instead',
      () => {},
      signal(),
    )
    assertEquals(second.session.look, look)
    assertEquals(second.session.frames[1].prompt, 'An empty hoop. Charcoal.')
    for (const f of second.session.frames) {
      assertEquals(f.prompt, composePrompt(look, f.body, f.shown))
    }
  }))

Deno.test('editFrameByAction leaves everything as it was when declined or unclear', () =>
  withTempDir(async (root) => {
    const { deps, session, textModel } = await planned(root, {
      edits: [{
        outcome: 'unclear',
        narration: 'What should change?',
        body: 'x',
        shown: [],
        look: planOf(3).look,
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
    assertEquals(textModel.calls, 1) // the plan only: the Action never reached the Text Model

    const unclear = await editFrameByAction(deps, session, scenario, 0, 'asdf', () => {}, signal())
    assertEquals(unclear.outcome, 'unclear')
    assertEquals(unclear.session, session)
  }))

Deno.test('composePrompt ends each part as a sentence so they never run together', () => {
  const look = (identity: string, style: string) => ({ people: [{ name: 'X', identity }], style })
  assertEquals(
    composePrompt(look('A tall man ', 'Manga ink'), 'He jumps.', ['X']),
    'A tall man. He jumps. Manga ink.',
  )
  assertEquals(
    composePrompt(look('She asks "why?"', 'Oil paint!'), '', ['X']),
    'She asks "why?" Oil paint!',
  )
})
