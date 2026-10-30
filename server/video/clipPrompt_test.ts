import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { reply, scriptedTextModel, withTempDir } from '../testing.ts'
import { chainFrames, chainOfTwo, readEvents } from '../appTesting.ts'
import { loadPrompt } from '../promptFiles.ts'
import type { Session } from '../session.ts'
import { cleanClipPrompt, frameStory } from './clipPrompt.ts'

/** A Chain of two Frames whose Text Model writes `clips` as clip prompts. */
async function chainWritingClips(root: string, clips: (string | Error)[]) {
  const model = scriptedTextModel([reply('standing'), reply('sitting')], [], { clips })
  return { model, ...await chainOfTwo(root, { textModel: model }) }
}

const ask = { kind: 'lead-in', seconds: 5, speech: false }
const writePrompt = (
  call: Awaited<ReturnType<typeof chainOfTwo>>['call'],
  index: number,
  body: unknown,
) => call('POST', `/api/sessions/s1/frames/${index}/clip-prompt`, body)

Deno.test('A Lead In’s prompt is written from the picture and the story, streamed, and tidied', () =>
  withTempDir(async (root) => {
    const { call, model } = await chainWritingClips(root, [
      'Here is the prompt: "She sits down slowly on the bench. Sound: rain."',
    ])
    const events = await readEvents(await writePrompt(call, 1, ask))
    const parts = events.filter(([e]) => e === 'clip-prompt-part')
    assert(parts.length > 1, 'written piece by piece')
    assertEquals(events.at(-1), [
      'clip-prompt',
      { type: 'clip-prompt', text: 'She sits down slowly on the bench. Sound: rain.' },
    ])
    const [{ system, user }] = model.clipRequests
    const [opening, second] = await chainFrames(call)
    assertStringIncludes(system, await loadPrompt('video/lead-in'))
    assertStringIncludes(system, await loadPrompt('video/without-speech'))
    assertStringIncludes(user, `The picture: ${second.prompt}`)
    assertStringIncludes(user, `Sit\n${second.narration}`)
    assertStringIncludes(user, `Just before it:\n${opening.narration}`)
    assertStringIncludes(user, 'a 5-second Lead In clip')
    // Nothing is saved.
    assertEquals((await chainFrames(call))[1].clips, undefined)
  }))

Deno.test('Into Next’s prompt is told the next picture, and refused on the last Frame', () =>
  withTempDir(async (root) => {
    const { call, model } = await chainWritingClips(root, ['The man sits.'])
    const intoNext = { ...ask, kind: 'into-next', speech: true }
    const last = await writePrompt(call, 1, intoNext)
    assertEquals(last.status, 409)
    assertStringIncludes((await last.json()).error, 'to end on')
    await readEvents(await writePrompt(call, 0, intoNext))
    const [, second] = await chainFrames(call)
    const [{ system, user }] = model.clipRequests
    assertStringIncludes(system, await loadPrompt('video/with-speech'))
    assertStringIncludes(user, `The clip ends on the next picture: ${second.prompt}`)
    assertStringIncludes(user, 'Just before it:\nnone')
  }))

Deno.test('A clip prompt is asked for with a kind, a length and speech, on a Frame', () =>
  withTempDir(async (root) => {
    const { call, model } = await chainWritingClips(root, [])
    assertEquals((await writePrompt(call, 1, { ...ask, kind: 'zoom' })).status, 400)
    assertEquals((await writePrompt(call, 1, { ...ask, seconds: 30 })).status, 400)
    assertEquals((await writePrompt(call, 1, { kind: 'lead-in', seconds: 5 })).status, 400)
    assertEquals((await writePrompt(call, 9, ask)).status, 404)
    assertEquals(model.clipRequests, [])
  }))

Deno.test('A prompt the Text Model leaves empty fails, saying so', () =>
  withTempDir(async (root) => {
    const { call } = await chainWritingClips(root, ['  ""  '])
    const [, failed] = (await readEvents(await writePrompt(call, 1, ask))).at(-1)!
    assertEquals(failed.type, 'failed')
    assertStringIncludes(failed.message as string, 'wrote no prompt')
  }))

Deno.test('Each kind of Session tells its own story of a Frame', () => {
  const chain = {
    kind: 'chain',
    frames: [{ action: null, narration: 'Rain.' }, { action: 'Sit', narration: 'He sits.' }],
  } as unknown as Session
  assertEquals([frameStory(chain, 0), frameStory(chain, 1)], ['Rain.', 'Sit\nHe sits.'])
  const storyboard = {
    kind: 'storyboard',
    frames: [{ beat: 'She arrives.' }],
  } as unknown as Session
  assertEquals(frameStory(storyboard, 0), 'She arrives.')
  const roleplay = {
    kind: 'roleplay',
    cast: { character: { name: 'Kael' }, persona: { name: 'Elara' } },
    frames: [{
      message: 'I sit.',
      reply: { internal: 'Hm.', actions: 'He nods.', dialogue: 'Sit.' },
    }],
  } as unknown as Session
  // Thoughts are left out: a clip can't show them.
  assertEquals(frameStory(roleplay, 0), 'Elara: I sit.\nKael: He nods. "Sit."')
})

Deno.test('A prompt loses an introduction and quote marks around it all, not inside it', () => {
  assertEquals(cleanClipPrompt('Sure, here it is: “He waits.”'), 'He waits.')
  assertEquals(cleanClipPrompt('He says "Sit." She sits.'), 'He says "Sit." She sits.')
})

Deno.test('A Play out is told the Frame has happened, and nothing of the next, to decide itself', () =>
  withTempDir(async (root) => {
    const { call, model } = await chainWritingClips(root, ['She sits.', 'He waits.'])
    await readEvents(await writePrompt(call, 0, { ...ask, kind: 'play-out' }))
    await readEvents(await writePrompt(call, 0, { ...ask, kind: 'into-next' }))
    const [opening, second] = await chainFrames(call)
    const [playOut, intoNext] = model.clipRequests.map((r) => r.user)
    const done = await loadPrompt('video/clip-story-done', { story: opening.narration })
    // Both start on the picture, so both are told its story as already happened.
    assertStringIncludes(playOut, done)
    assertStringIncludes(intoNext, done)
    // Only Into Next is told the next Frame.
    assertEquals(playOut.includes(second.narration), false)
    assertStringIncludes(intoNext, second.narration)
  }))

Deno.test('A prompt is rewritten from the one a clip was made from and what was wrong with it', () =>
  withTempDir(async (root) => {
    const { call, model } = await chainWritingClips(root, ['She stays at the table.'])
    const revise = { prompt: 'She walks to the door.', problem: 'She should stay at the table.' }
    const events = await readEvents(await writePrompt(call, 1, { ...ask, revise }))
    assertEquals(events.at(-1)?.[1].text, 'She stays at the table.')
    const [{ user }] = model.clipRequests
    assertStringIncludes(user, 'a 5-second Lead In clip')
    assertStringIncludes(user, 'is (or was) made from:\nShe walks to the door.')
    assertStringIncludes(user, 'if they watched it:\nShe should stay at the table.')
    // Half a revision is refused.
    const half = await writePrompt(call, 1, { ...ask, revise: { prompt: 'She walks.' } })
    assertEquals(half.status, 400)
  }))
