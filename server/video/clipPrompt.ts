/**
 * A clip's prompt, written by the Text Model for the player to read and edit before the clip is
 * made (ADR 0025): what moves between the pictures, from the story around the Frame.
 * Nothing is saved. Its prompts are `prompts/video/clip*.md` and the kinds' own.
 */
import type { ClipAsk } from '../jobs.ts'
import { crossedLimit } from '../limits.ts'
import { loadPrompt } from '../promptFiles.ts'
import { shownVersionOf } from '../pictures.ts'
import { exchangeText } from '../roleplay/art.ts'
import type { Session } from '../session.ts'
import type { TextModel } from '../textModel.ts'
import { clipRefusal } from './makeClip.ts'
import type { ClipKind } from './videoGenerator.ts'

/** What each kind of clip is called in the prompt, as the player sees it. */
const KIND_NAMES: Record<ClipKind, string> = {
  'lead-in': 'Lead In',
  'play-out': 'Play out',
  'idle-loop': 'Idle Loop',
  'into-next': 'Into Next',
}

export type ClipPromptEvent =
  | { type: 'phase'; phase: 'text' }
  /** The prompt as written so far, untidied. */
  | { type: 'clip-prompt-part'; text: string }
  /** The whole prompt, tidied. */
  | { type: 'clip-prompt'; text: string }

export class ClipPromptError extends Error {}

/**
 * What happens in Frame `index`: a Roleplay's exchange (the Message, what the Character did and
 * said), a Chain's Action and Narration, a Storyboard's Beat.
 */
export function frameStory(session: Session, index: number): string {
  if (session.kind === 'roleplay') return exchangeText(session, index)
  if (session.kind === 'storyboard') return session.frames[index].beat
  const { action, narration } = session.frames[index]
  return action ? `${action}\n${narration}` : narration
}

/** What Frame `index`'s picture shows: its Image Prompt. */
const pictureOf = (session: Session, index: number) => session.frames[index]?.prompt ?? ''

/**
 * What comes after the picture, as a clip of `kind` is told it: Into Next, the next picture it ends
 * on; Play out, the next Frame's story, or on the newest Frame, that nothing new happens.
 */
async function afterPicture(session: Session, index: number, kind: ClipKind): Promise<string> {
  const next = session.frames[index + 1]
  if (kind === 'into-next') {
    return loadPrompt('video/clip-next', {
      picture: pictureOf(session, index + 1),
      story: frameStory(session, index + 1),
    })
  }
  if (kind !== 'play-out') return ''
  return next
    ? loadPrompt('video/clip-after', { story: frameStory(session, index + 1) })
    : loadPrompt('video/clip-after-none')
}

/** A prompt to rewrite: the one a clip was made from, and what the player said was wrong with it. */
export interface ClipRevision {
  prompt: string
  problem: string
}

/**
 * The call that writes a clip's prompt: its kind's direction, the picture, the story around it;
 * with `revise`, the prompt a clip was made from and what was wrong with it, to rewrite.
 */
export async function clipMessages(
  session: Session,
  index: number,
  ask: ClipAsk,
  revise?: ClipRevision,
): Promise<{ system: string; user: string }> {
  // A Play out starts on the picture, by which the Frame's own story has happened.
  const story = await loadPrompt(
    ask.kind === 'play-out' ? 'video/clip-story-done' : 'video/clip-story',
    { story: frameStory(session, index) },
  )
  const messages = {
    system: await loadPrompt('video/clip', {
      direction: await loadPrompt(`video/${ask.kind}`),
      speech: await loadPrompt(ask.speech ? 'video/with-speech' : 'video/without-speech'),
    }),
    user: await loadPrompt('video/clip-request', {
      kind: KIND_NAMES[ask.kind],
      seconds: ask.seconds,
      picture: pictureOf(session, index),
      story,
      before: index > 0 ? frameStory(session, index - 1) : 'none: the story starts here',
      after: await afterPicture(session, index, ask.kind),
    }),
  }
  if (!revise) return messages
  return {
    ...messages,
    user: await loadPrompt('video/clip-revise', { request: messages.user, ...revise }),
  }
}

/** Tidies a prompt: an introduction ("Here's the prompt:") and quote marks around it all go. */
export function cleanClipPrompt(text: string): string {
  // To the first colon only: a prompt has its own ("Sound: rain").
  let s = text.trim().replace(/^(?:here(?:'s| is)[^\n:]*:|sure[^\n:]*:)\s*/i, '')
  const quoted = s.match(/^["“](.*)["”]$/s)
  if (quoted && !/["“”]/.test(quoted[1])) s = quoted[1]
  return s.trim()
}

/**
 * Writes the prompt for a clip of Frame `index`'s picture, passing it on as it's written. Throws if
 * the Frame has no picture (or Into Next none to end on), or the model wrote nothing, or something
 * that crosses a Limit in force.
 */
export async function writeClipPrompt(
  model: TextModel,
  session: Session,
  index: number,
  ask: ClipAsk,
  emit: (event: ClipPromptEvent) => void,
  signal: AbortSignal,
  revise?: ClipRevision,
): Promise<string> {
  const name = session.kind === 'storyboard' ? `Frame ${index + 1}` : `Frame ${index}`
  if (!shownVersionOf(session, index)) throw new ClipPromptError(`${name} has no picture yet`)
  const refused = clipRefusal(session, index, ask.kind, name)
  if (refused) throw new ClipPromptError(refused)
  const messages = await clipMessages(session, index, ask, revise)
  emit({ type: 'phase', phase: 'text' })
  let written = ''
  const raw = await model.writeClip(messages, signal, (chunk) => {
    written += chunk
    emit({ type: 'clip-prompt-part', text: written })
  })
  signal.throwIfAborted()
  const text = cleanClipPrompt(raw)
  if (!text) throw new ClipPromptError('The Text Model wrote no prompt; try again')
  const limit = crossedLimit(text)
  if (limit) throw new ClipPromptError(`The prompt crossed a limit (${limit.message}); try again`)
  emit({ type: 'clip-prompt', text })
  return text
}
