import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { dirSessionStore } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { briefScenario } from '../scenario.ts'
import { scriptedTextModel, withTempDir } from '../testing.ts'
import {
  beginRoleplay,
  pictureFrame,
  RoleplayError,
  type RoleplayEvent,
  RoleplayLimitError,
  sendMessage,
  setCast,
  setLook,
  undoLatestExchange,
  writeCast,
} from './engine.ts'
import { CastError } from './prompt.ts'
import { replyOf, scriptedRoleplayModel, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'

const signal = () => new AbortController().signal
const scenario = briefScenario('A storm at sea; the player is the new first mate.')

const newSession = (): RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A storm at sea; the player is the new first mate.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  cast: null,
  frames: [],
})

async function setUp(
  root: string,
  replies: Parameters<typeof scriptedRoleplayModel>[0]['replies'] = [],
) {
  const store = dirSessionStore(root)
  const roleplayModel = scriptedRoleplayModel({
    casts: [testCast],
    replies: [replyOf('You are late.'), ...(replies ?? [])],
  })
  const deps = { store, roleplayModel, textModel: scriptedTextModel([], ['Taylor Swift']) }
  const events: RoleplayEvent[] = []
  const emit = (e: RoleplayEvent) => events.push(e)
  const cast = await writeCast(deps, newSession(), scenario, emit, signal())
  const session = await beginRoleplay(deps, cast, emit, signal())
  roleplayModel.asked.length = 0
  return { store, deps, session, events, roleplayModel }
}

Deno.test('writeCast saves the Cast for review; beginRoleplay has the Character speak first', () =>
  withTempDir(async (root) => {
    const { store, session, events } = await setUp(root)
    assertEquals(session.cast, testCast)
    assertEquals(session.frames.map((f) => [f.message, f.reply.dialogue]), [[
      null,
      'You are late.',
    ]])
    assertEquals(events.map((e) => e.type), [
      'phase',
      'cast',
      'phase',
      'reply-part',
      'reply-part',
      'reply-part',
      'replied',
    ])
    assertEquals((await store.load('r1')) as RoleplaySession, session)
  }))

Deno.test('beginRoleplay writes the opening from the Cast as edited, and only once', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const roleplayModel = scriptedRoleplayModel({ casts: [testCast], replies: [replyOf('Hi.')] })
    const deps = { store, roleplayModel, textModel: scriptedTextModel([]) }
    const written = await writeCast(deps, newSession(), scenario, () => {}, signal())
    const edited = await setCast(store, written, {
      ...testCast,
      character: { ...testCast.character, name: 'Mara Vance' },
    })
    const begun = await beginRoleplay(deps, edited, () => {}, signal())
    assertEquals(roleplayModel.asked[0].map((m) => m.role), ['system', 'user'])
    assertStringIncludes(
      roleplayModel.asked[0][0].content.replace(/\s+/g, ' '),
      'You are Mara Vance',
    )
    await assertRejects(() => beginRoleplay(deps, begun, () => {}, signal()), RoleplayError)
    await assertRejects(
      () => writeCast(deps, begun, scenario, () => {}, signal()),
      RoleplayError,
      'already begun',
    )
  }))

Deno.test('writeCast fails, saving nothing, when the Cast crosses a Limit', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const roleplayModel = scriptedRoleplayModel({
      casts: [{
        ...testCast,
        setting: { ...testCast.setting, place: 'A cell; Sam is held captive.' },
      }],
    })
    await assertRejects(
      () =>
        writeCast(
          { store, roleplayModel, textModel: scriptedTextModel([]) },
          newSession(),
          scenario,
          () => {},
          signal(),
        ),
      Error,
      'crossed a limit',
    )
    assertEquals(await store.load('r1'), undefined)
  }))

Deno.test('sendMessage sends the whole conversation and saves the reply as a Frame', () =>
  withTempDir(async (root) => {
    const { deps, session, roleplayModel } = await setUp(root, [replyOf('Take the wheel.')])
    const events: RoleplayEvent[] = []
    const updated = await sendMessage(
      deps,
      session,
      'Sorry, captain.',
      (e) => events.push(e),
      signal(),
    )
    assertEquals(updated!.frames.map((f) => f.message), [null, 'Sorry, captain.'])
    assertEquals(roleplayModel.asked[0].map((m) => m.role), ['system', 'assistant', 'user'])
    assertEquals(
      events.filter((e) => e.type === 'reply-part').map((e) => e.type === 'reply-part' && e.key),
      ['internal', 'actions', 'dialogue'],
    )
    assertEquals(events.at(-1)!.type, 'replied')
  }))

Deno.test('sendMessage declines, saving nothing, a message or reply that crosses a Limit', () =>
  withTempDir(async (root) => {
    const { deps, session, store, roleplayModel } = await setUp(root, [
      replyOf('Fine.', { actions: 'She pulls off her sweater, then her underwear.' }),
    ])
    const events: RoleplayEvent[] = []
    const emit = (e: RoleplayEvent) => events.push(e)
    // The term list declines before the Character is asked.
    assertEquals(
      await sendMessage(deps, session, 'You are fifteen years old now', emit, signal()),
      null,
    )
    assertEquals(await sendMessage(deps, session, 'Hi Taylor Swift', emit, signal()), null)
    assertEquals(roleplayModel.asked.length, 0)
    // The reply crosses one.
    assertEquals(await sendMessage(deps, session, 'Help me.', emit, signal()), null)
    assertEquals(events.filter((e) => e.type === 'declined').length, 3)
    assertEquals(((await store.load('r1')) as RoleplaySession).frames.length, 1)
  }))

Deno.test("The Character's prose isn't held to the restraint list; the player's messages are", () =>
  withTempDir(async (root) => {
    const { deps, session } = await setUp(root, [
      replyOf('Stay put.', {
        actions: 'Elena restrained him by the shoulders, helpless to stop him.',
      }),
    ])
    const declined: string[] = []
    const emit = (e: RoleplayEvent) => e.type === 'declined' && declined.push(e.message)
    assertEquals(await sendMessage(deps, session, 'I tie her to the chair.', emit, signal()), null)
    assertEquals(declined, ['Declined: no restraint, captivity or non-consent.'])
    const updated = await sendMessage(deps, session, 'I head for the door.', emit, signal())
    assertEquals(updated!.frames.length, 2)
  }))

Deno.test('undoLatestExchange removes only the latest exchange, never the opening', () =>
  withTempDir(async (root) => {
    const { deps, session, store } = await setUp(root, [replyOf('Take the wheel.')])
    const two = (await sendMessage(deps, session, 'Sorry.', () => {}, signal()))!
    await assertRejects(() => undoLatestExchange(store, two, 0), RoleplayError, 'not the latest')
    const one = await undoLatestExchange(store, two, 1)
    assertEquals(one.frames.length, 1)
    await assertRejects(() => undoLatestExchange(store, one, 0), RoleplayError, "can't be undone")
  }))

Deno.test('setCast saves an edited Cast and refuses one that crosses a Limit', () =>
  withTempDir(async (root) => {
    const { session, store } = await setUp(root)
    const renamed = { ...testCast, persona: { ...testCast.persona, name: 'Alex' } }
    assertEquals((await setCast(store, session, renamed)).cast?.persona.name, 'Alex')
    const bad = { ...testCast, setting: { ...testCast.setting, place: 'A nude beach.' } }
    await assertRejects(() => setCast(store, session, bad), RoleplayLimitError)
  }))

const body = (pose: string) =>
  `${pose} She frowns. A wide shot. A navy coat. The bridge. Lamplight. Deep blues.`

Deno.test('pictureFrame writes the Look once, then each Frame from the story up to it', () =>
  withTempDir(async (root) => {
    const { deps, session, store } = await setUp(root, [replyOf('Take the wheel.')])
    const look = { subject: 'Mira Vance, a tall woman of 34.', style: 'An oil painting.' }
    const scripted = scriptedRoleplayModel({
      looks: [look],
      bodies: [body('Mira grips the wheel.'), body('Mira points ahead.')],
    })
    const art = { ...deps, roleplayModel: scripted }
    const two = (await sendMessage(deps, session, 'Sorry.', () => {}, signal()))!
    const events: RoleplayEvent[] = []
    const first = await pictureFrame(art, two, scenario, 1, (e) => events.push(e), signal())
    assertEquals(events.map((e) => e.type), ['phase', 'look', 'pictured'])
    assertEquals(first.look, look)
    assertStringIncludes(first.frames[1].promptText!, 'adult, Mira Vance, a tall woman of 34.')
    assertStringIncludes(scripted.art[1][1].content, 'Picture Frame 1.')
    // Kept for debugging: how long each call took, and any reasoning.
    assertEquals(typeof first.lookTimings?.text, 'number')
    assertEquals(typeof first.frames[1].pictureTimings?.text, 'number')
    assertEquals(first.frames[1].pictureThinking, 'Kael first, then the bar.')

    const second = await pictureFrame(art, first, scenario, 0, () => {}, signal())
    assertEquals(scripted.art.length, 3) // the Look is written only once
    assertStringIncludes(second.frames[0].promptText!, 'Mira points ahead.')
    assertEquals(((await store.load('r1')) as RoleplaySession).frames[1].body, first.frames[1].body)
  }))

Deno.test('setLook rewrites every pictured Frame, and refuses an incomplete Look', () =>
  withTempDir(async (root) => {
    const { deps, session, store } = await setUp(root)
    const scripted = scriptedRoleplayModel({
      looks: [{ subject: 'Mira.', style: 'Ink.' }],
      bodies: [body('Mira waits.')],
    })
    const pictured = await pictureFrame(
      { ...deps, roleplayModel: scripted },
      session,
      scenario,
      0,
      () => {},
      signal(),
    )
    const restyled = await setLook(store, pictured, { subject: 'Mira.', style: 'Watercolour.' })
    assertStringIncludes(restyled.frames[0].promptText!, 'Watercolour.')
    await assertRejects(() => setLook(store, pictured, { subject: 'Mira.' }), CastError)
  }))
