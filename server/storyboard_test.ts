import { assertEquals, assertMatch, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore, type StoryboardSession } from './session.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import {
  composePrompt,
  editFrameByAction,
  LimitError,
  planStoryboard,
  renderStoryboardFrame,
  setFrameBody,
  setLook,
  type StoryboardEvent,
} from './storyboard.ts'
import { briefScenario } from './scenario.ts'
import { fakeImageGenerator, planOf, scriptedTextModel, withTempDir } from './testing.ts'

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
    assertEquals(first.prompt, composePrompt(planOf(3).look, planOf(3).bodies[0]))
    assertEquals(first.promptText, `adult, ${first.prompt}`)
    assertEquals(first.image, null)
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
    const bad = planOf(2, { look: { subject: 'A tall adult.', style: 'Lingerie catalogue shot.' } })
    const { deps } = depsFor(root, { plans: [bad] })
    await assertRejects(
      () => planStoryboard(deps, newStoryboard(2), scenario, () => {}, signal()),
      LimitError,
    )

    const oneBad = planOf(2, { bodies: ['Stands.', 'Stands, wrists bound.'] })
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
    const first = await renderStoryboardFrame(deps, session, 1, () => {}, signal())
    assertMatch(first.image!, /^frame-1-[0-9a-f]{8}\.png$/)
    assertEquals(images.prompts, [session.frames[1].promptText])
    assertEquals(typeof first.timings!.image, 'number')

    const second = await renderStoryboardFrame(deps, session, 1, () => {}, signal())
    const files = (await Array.fromAsync(Deno.readDir(join(root, 's1')))).map((f) => f.name)
    assertEquals(files.includes(first.image!), false)
    assertEquals(files.includes(second.image!), true)
    assertEquals((await deps.store.load('s1'))!.frames[1].image, second.image)
  }))

Deno.test('setFrameBody rewrites one Frame, marks it stale if rendered, and refuses Limits', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    await renderStoryboardFrame(deps, session, 0, () => {}, signal())
    const edited = await setFrameBody(deps, session, 0, 'He leaps.\n- Lighting: dusk.')
    assertEquals(edited.frames[0].body, 'He leaps. dusk.')
    assertEquals(edited.frames[0].prompt, composePrompt(edited.look!, 'He leaps. dusk.'))
    assertEquals(edited.frames[0].stale, true)
    assertEquals(edited.frames[1].stale, undefined)
    await assertRejects(() => setFrameBody(deps, edited, 1, 'Fully nude.'), LimitError)
  }))

Deno.test('setLook rewrites every Frame and marks the rendered ones stale', () =>
  withTempDir(async (root) => {
    const { deps, session } = await planned(root)
    await renderStoryboardFrame(deps, session, 2, () => {}, signal())
    const look = { subject: 'A short adult athlete.', style: 'A watercolour.' }
    const updated = await setLook(deps, session, look)
    for (const f of updated.frames) assertEquals(f.prompt, composePrompt(look, f.body))
    assertEquals(updated.frames.map((f) => f.stale ?? false), [false, false, true])
    await assertRejects(
      () => setLook(deps, updated, { subject: 'A child.', style: 'Ink.' }),
      LimitError,
    )
  }))

Deno.test('editFrameByAction rewrites the Frame, and a Look change reaches every Frame', () =>
  withTempDir(async (root) => {
    const look = { subject: 'A tall adult athlete.', style: 'Charcoal.' }
    const { deps, session } = await planned(root, {
      edits: [
        { outcome: 'done', narration: 'Pose: mid-air.', body: 'He soars.', look: planOf(3).look },
        { outcome: 'done', narration: 'Style: charcoal.', body: 'He soars.', look },
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
    for (const f of second.session.frames) assertEquals(f.prompt, composePrompt(look, f.body))
  }))

Deno.test('editFrameByAction leaves everything as it was when declined or unclear', () =>
  withTempDir(async (root) => {
    const { deps, session, textModel } = await planned(root, {
      edits: [{
        outcome: 'unclear',
        narration: 'What should change?',
        body: 'x',
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
  assertEquals(
    composePrompt({ subject: 'A tall man ', style: 'Manga ink' }, 'He jumps.'),
    'A tall man. He jumps. Manga ink.',
  )
  assertEquals(
    composePrompt({ subject: 'She asks "why?"', style: 'Oil paint!' }, ''),
    'She asks "why?" Oil paint!',
  )
})
