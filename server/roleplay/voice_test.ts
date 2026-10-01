import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { withTempDir } from '../testing.ts'
import { fakeVoiceEngine, type SpeakRequest } from '../voice.ts'
import { replyOf, scriptedRoleplayModel, testCast } from './testing.ts'
import type { RoleplaySession } from './types.ts'
import {
  designVoice,
  parseDelivery,
  REF_TEXT,
  setVoiceDescription,
  speakable,
  speakFrame,
  type VoiceEvent,
  voiceMessages,
} from './voice.ts'

const roleplay = (): RoleplaySession => ({
  id: 'r1',
  kind: 'roleplay',
  brief: 'A storm at sea.',
  scenarioId: null,
  settings: DEFAULT_SETTINGS,
  seed: 100,
  createdAt: '2026-10-01T00:00:00.000Z',
  cast: testCast,
  frames: [
    {
      index: 0,
      message: null,
      reply: replyOf('*Hold* the wheel.'),
      image: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      index: 1,
      message: 'I wait.',
      reply: replyOf('...'),
      image: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ],
})

async function setup(root: string, voices: string[] = ['A low, husky woman of thirty-four.']) {
  const store = dirSessionStore(root)
  const session = roleplay()
  await store.save(session)
  const voice = fakeVoiceEngine()
  const deps = { store, voice, model: scriptedRoleplayModel({ voices, name: 'artist' }) }
  const files = async () => {
    const names: string[] = []
    for await (const e of Deno.readDir(store.dir('r1'))) {
      if (e.name.endsWith('.wav')) names.push(e.name)
    }
    return names.sort()
  }
  return { store, session, voice, deps, files }
}

const signal = new AbortController().signal

Deno.test('speakable drops emphasis marks, and finds nothing in an ellipsis', () => {
  assertEquals(speakable('*Hold* the  wheel.'), 'Hold the wheel.')
  assertEquals(speakable('...'), '')
  assertEquals(speakable('…'), '')
})

Deno.test('The voice is described from the Character alone', async () => {
  const [system] = await voiceMessages(roleplay())
  assertStringIncludes(system.content, 'Navigator of the Kestrel')
  assertEquals(system.content.includes('Sam Reyes'), false)
})

Deno.test('Speaking a line first describes and designs the voice, then clones it', () =>
  withTempDir(async (root) => {
    const { session, voice, deps, files } = await setup(root)
    const events: VoiceEvent[] = []
    const spoken = await speakFrame(deps, session, 0, (e) => events.push(e), signal)

    const ref = spoken.voice!.ref!
    assertEquals(spoken.voice, {
      description: 'A low, husky woman of thirty-four.',
      model: 'artist',
      ref,
    })
    const speech = spoken.frames[0].speech!
    assertEquals([speech.ref, Object.keys(speech.timings)], [ref, ['audio']])
    assertEquals(voice.calls.map((c) => [c.kind, c.req.text]), [
      ['design', REF_TEXT],
      ['speak', 'Hold the wheel.'],
    ])
    assertEquals(voice.calls[1].req, {
      text: 'Hold the wheel.',
      pace: 'normal',
      sound: 'none',
      ref: join(root, 'r1', ref),
      refText: REF_TEXT,
      seed: 100,
      out: join(root, 'r1', speech.file),
    })
    assertEquals(events.map((e) => e.type === 'phase' ? e.phase : e.type), [
      'text',
      'audio',
      'voice',
      'text',
      'audio',
      'spoken',
    ])
    assertEquals(speech.delivery, { pace: 'normal', sound: 'none' })
    assertEquals(await files(), [speech.file, ref].sort())

    // Again: the same voice, and the old audio is replaced.
    const again = await speakFrame(deps, spoken, 0, () => {}, signal)
    assertEquals(again.voice!.ref, ref)
    assertEquals(await files(), [again.frames[0].speech!.file, ref].sort())
  }))

Deno.test('Each line is directed from its moment, and spoken with that pace and sound', () =>
  withTempDir(async (root) => {
    const { store, voice } = await setup(root)
    const session = { ...roleplay(), voice: { description: 'A voice.', ref: 'voice-aaaaaaaa.wav' } }
    await store.save(session)
    const model = scriptedRoleplayModel({
      deliveries: [{ pace: 'slow', sound: 'sigh' }, new Error('Ollama: down')],
    })
    const deps = { store, voice, model }
    const said = (i: number) => voice.calls[i].req as SpeakRequest
    const directed = await speakFrame(deps, session, 0, () => {}, signal)
    assertEquals(directed.frames[0].speech!.delivery, { pace: 'slow', sound: 'sigh' })
    assertEquals([said(0).pace, said(0).sound], ['slow', 'sigh'])
    const [system, request] = model.directed[0]
    assertStringIncludes(system.content, 'voice actor for Mira Vance')
    assertStringIncludes(
      request.content,
      'What Sam Reyes just did or said: none: this opens the scene',
    )
    assertStringIncludes(request.content, 'What Mira Vance does: Mira grips the wheel.')
    assertStringIncludes(request.content, 'The line: Hold the wheel.')

    // A failed direction isn't a failed line: it's spoken as written.
    const plain = await speakFrame(deps, directed, 0, () => {}, signal)
    assertEquals(plain.frames[0].speech!.delivery, undefined)
    assertEquals([said(1).pace, said(1).sound], [undefined, undefined])
  }))

Deno.test('A thought is spoken whispered, as its own audio, without a sound', () =>
  withTempDir(async (root) => {
    const { store, voice, files } = await setup(root)
    const base = roleplay()
    const session: RoleplaySession = {
      ...base,
      voice: { description: 'A voice.', ref: 'voice-aaaaaaaa.wav' },
      frames: [
        { ...base.frames[0], reply: replyOf('Hold on.', { internal: 'He is late again.' }) },
        base.frames[1],
      ],
    }
    await store.save(session)
    const model = scriptedRoleplayModel({ deliveries: [{ pace: 'slow', sound: 'cough' }] })
    const deps = { store, voice, model }
    const thought = await speakFrame(deps, session, 0, () => {}, signal, 'thought')

    const speech = thought.frames[0].thoughtSpeech!
    assertEquals(speech.delivery, { pace: 'slow', sound: 'none' })
    assertEquals(speech.file.startsWith('thought-0-'), true)
    assertEquals(thought.frames[0].speech, undefined)
    const req = voice.calls[0].req as SpeakRequest
    assertEquals([req.text, req.whisper, req.sound], ['He is late again.', true, 'none'])
    assertStringIncludes(model.directed[0][1].content, 'a private thought')
    assertEquals(await files(), [speech.file])

    await assertRejects(
      () => speakFrame(deps, thought, 1, () => {}, signal, 'thought'),
      Error,
      'no thought',
    )
  }))

Deno.test('parseDelivery plays anything it does not recognise as written', () => {
  assertEquals(parseDelivery({ pace: 'fast', sound: 'laughter' }), {
    pace: 'fast',
    sound: 'laughter',
  })
  assertEquals(parseDelivery({ pace: 'very slow', sound: 'scream' }), {
    pace: 'normal',
    sound: 'none',
  })
  assertEquals(parseDelivery(null), { pace: 'normal', sound: 'none' })
})

Deno.test('A new take of the voice replaces its clip; lines spoken in the old one keep theirs', () =>
  withTempDir(async (root) => {
    const { session, deps, files } = await setup(root)
    const spoken = await speakFrame(deps, session, 0, () => {}, signal)
    const retaken = await designVoice(deps, spoken, () => {}, signal)
    const [oldRef, newRef] = [spoken.voice!.ref!, retaken.voice!.ref!]
    assertEquals(oldRef !== newRef, true)
    assertEquals(retaken.voice!.description, spoken.voice!.description)
    assertEquals(retaken.frames[0].speech!.ref, oldRef)
    assertEquals(await files(), [retaken.frames[0].speech!.file, newRef].sort())
  }))

Deno.test('Editing the description drops the clip, to be designed again', () =>
  withTempDir(async (root) => {
    const { store, session, deps, files } = await setup(root)
    const designed = await designVoice(deps, session, () => {}, signal)
    const same = await setVoiceDescription(store, designed, {
      description: designed.voice!.description,
    })
    assertEquals(same.voice, designed.voice)

    const edited = await setVoiceDescription(store, designed, {
      description: '  A deep,\n gravelly man. ',
    })
    assertEquals(edited.voice, { description: 'A deep, gravelly man.' })
    assertEquals(await files(), [])

    for (
      const bad of [{}, { description: ' ' }, { description: 'x'.repeat(601) }, {
        description: 'a nude man',
      }]
    ) {
      await assertRejects(() => setVoiceDescription(store, edited, bad))
    }
  }))

Deno.test('A line with nothing to say, a missing voice service or a failed one fails, leaving no files', () =>
  withTempDir(async (root) => {
    const { session, deps, files } = await setup(root, ['A voice.', 'A voice.'])
    await assertRejects(
      () => speakFrame(deps, session, 1, () => {}, signal),
      Error,
      'nothing to say',
    )
    await assertRejects(
      () => speakFrame({ ...deps, voice: undefined }, session, 0, () => {}, signal),
      Error,
      "aren't available",
    )
    await assertRejects(
      () =>
        speakFrame(
          { ...deps, voice: fakeVoiceEngine({ fail: 'boom' }) },
          session,
          0,
          () => {},
          signal,
        ),
      Error,
      'boom',
    )
    assertEquals(await files(), [])
  }))
