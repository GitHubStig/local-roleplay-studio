import { assertEquals, assertRejects } from '@std/assert'
import { dirSessionStore, type Session, type SessionStore } from './session.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { withTempDir } from './testing.ts'
import { GoneError, removeSession, updateSession } from './update.ts'

const chain = (): Session => ({
  id: 'c1',
  kind: 'chain',
  brief: 'A lighthouse in a storm.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 1,
  createdAt: '2026-10-21T00:00:00.000Z',
  frames: [],
})

/** A store whose saves wait until `release` is called. */
function slowSaves(store: SessionStore) {
  const gate = Promise.withResolvers<void>()
  const slow: SessionStore = {
    ...store,
    save: async (session) => {
      await gate.promise
      await store.save(session)
    },
  }
  return { store: slow, release: gate.resolve }
}

Deno.test('A Session removed while a change to it is saving stays removed', () =>
  withTempDir(async (root) => {
    const plain = dirSessionStore(root)
    await plain.save(chain())
    const { store, release } = slowSaves(plain)
    // A job's change has loaded the Session and is saving it as the Session is deleted.
    const saving = updateSession(store, 'c1', 'chain', (s) => ({ ...s, renderFrames: false }))
    await new Promise((r) => setTimeout(r, 10))
    const removing = removeSession(store, 'c1')
    release()
    await saving
    await removing
    assertEquals(await plain.load('c1'), undefined)
    await assertRejects(
      () => updateSession(store, 'c1', 'chain', (s) => s),
      GoneError,
      'no longer exists',
    )
  }))
