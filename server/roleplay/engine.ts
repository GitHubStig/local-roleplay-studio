import {
  limitCrossedBy,
  type ProgressEvent,
  replacePicture,
  secondsSince,
  withRetry,
} from '../frames.ts'
import type { ImageGenerator } from '../images/imageGenerator.ts'
import type { RenderQueue } from '../renderQueue.ts'
import type { Settings } from '../settings.ts'
import { activeProseLimits, crossedLimit } from '../limits.ts'
import type { Scenario } from '../scenario.ts'
import type { Look, SessionStore } from '../session.ts'
import type { TextModel } from '../textModel.ts'
import type { FigureMaker } from '../3d/figure.ts'
import type { SceneMaker } from '../3d/scene.ts'
import type { VoiceEngine } from '../voice/voice.ts'
import type { RoleplayModel } from './model.ts'
import { GoneError, updateSession } from './update.ts'
import { allPictureFiles, removeFiles } from '../pictures.ts'
import { CastError, openingMessages, parseCast, roleplayMessages } from './prompt.ts'
import {
  artFrameMessages,
  artLookMessages,
  type ArtStyle,
  isLook,
  pictured,
  withNewcomers,
} from './art.ts'
import { cleanLook, lookLimit, renameShown } from '../look.ts'
import type { Cast, Reply, RoleplayFrame, RoleplaySession } from './types.ts'

/** Progress of a Roleplay's setup or reply, streamed to the player as it happens. */
export type RoleplayEvent =
  | ProgressEvent
  /** The Cast, once written. */
  | { type: 'cast'; cast: Cast; session: RoleplaySession }
  /** One field of the reply, the moment the model finishes writing it. */
  | { type: 'reply-part'; key: keyof Reply; value: string }
  | { type: 'replied'; frame: RoleplayFrame; session: RoleplaySession }
  /** The message or the reply crossed a Limit: nothing was saved. */
  | { type: 'declined'; message: string }
  /** The Art Agent's Look, written the first time a Frame is pictured. */
  | { type: 'look'; look: Look }
  /** A Frame's picture: its Image Prompt, not yet rendered. */
  | { type: 'pictured'; frame: RoleplayFrame; session: RoleplaySession }
  /** A Frame's picture, rendered. */
  | { type: 'rendered'; frame: RoleplayFrame; session: RoleplaySession }

export interface RoleplayDeps {
  store: SessionStore
  roleplayModel: RoleplayModel
  /** For the real-person question the Limits ask (ADR 0002). */
  textModel: TextModel
  /** The Art Agent's model when Settings name one; otherwise pictures use `roleplayModel`. */
  artModel?: RoleplayModel
  /** Whether the Art Agent writes prose (the default) or tags. */
  artStyle?: ArtStyle
  /** The voice service, when voices are available. */
  voice?: VoiceEngine
  /** SHARP, when 3D scenes are available. */
  scene?: SceneMaker
  /** TripoSplat, when 3D figures are available. */
  figure?: FigureMaker
  /** Apple's LiTo, when its figures are available. */
  lito?: FigureMaker
  /** For rendering pictures, through the render queue every Session shares. */
  imageGenerator: ImageGenerator
  renderQueue?: RenderQueue
  /** Settings as they are now, for how a render runs (`renderSettings`). */
  settings?: () => Promise<Settings>
}

/** The text of a Cast and a reply that the Limits check. */
const castText = ({ character, persona, setting }: Cast) =>
  [...Object.values(character), ...Object.values(persona), ...Object.values(setting)].join('\n')
const replyText = (r: Reply) => [r.internal, r.actions, r.dialogue].join('\n')

export class RoleplayError extends Error {}
/** A hand edit crosses a Limit. */
export class RoleplayLimitError extends Error {}

/**
 * Writes the Cast from the Roleplay's Brief (or Scenario), for the player to review before the
 * scene begins. Can be rewritten until then. Refused if the Cast crosses a Limit.
 */
export async function writeCast(
  deps: RoleplayDeps,
  session: RoleplaySession,
  scenario: Scenario,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (session.frames.length) throw new RoleplayError('The scene has already begun')
  emit({ type: 'phase', phase: 'text' })
  const { cast } = await withRetry(
    (onThinking) => deps.roleplayModel.writeCast(scenario, signal, onThinking),
    signal,
    emit,
  )
  signal.throwIfAborted()
  const limit = crossedLimit(castText(cast))
  if (limit) throw new Error(`The Cast crossed a limit: ${limit.message}`)
  const updated: RoleplaySession = { ...session, cast }
  await deps.store.save(updated)
  emit({ type: 'cast', cast, session: updated })
  return updated
}

/**
 * Begins the scene: the Character's opening Reply, written from the Cast as the player left it,
 * becomes the Opening Frame. A Reply that crosses a Limit fails, and Begin can be tried again.
 */
export async function beginRoleplay(
  deps: RoleplayDeps,
  session: RoleplaySession,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast) throw new RoleplayError('This Roleplay has no Cast yet')
  if (session.frames.length) throw new RoleplayError('The scene has already begun')
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const messages = await openingMessages(session.cast)
  const reply = await withRetry(
    (onThinking) =>
      deps.roleplayModel.reply(messages, signal, {
        thinking: onThinking,
        field: (key, value) => emit({ type: 'reply-part', key, value }),
      }),
    signal,
    emit,
  )
  signal.throwIfAborted()
  const limit = crossedLimit(replyText(reply), activeProseLimits())
  if (limit) throw new Error(`The opening crossed a limit (${limit.message}); try Begin again.`)
  return await commit(deps, session, null, reply, start, emit)
}

/** Saves a Reply (and the Message it answers) as the next Frame. */
async function commit(
  deps: RoleplayDeps,
  session: RoleplaySession,
  message: string | null,
  reply: Reply & { thinking?: string },
  start: number,
  emit: (event: RoleplayEvent) => void,
): Promise<RoleplaySession> {
  const { thinking, ...fields } = reply
  let frame!: RoleplayFrame
  const updated = await updateSession(deps.store, session.id, (latest) => {
    frame = {
      index: latest.frames.length,
      message,
      reply: fields,
      ...(thinking ? { thinking } : {}),
      timings: { text: secondsSince(start) },
      pictures: [],
      createdAt: new Date().toISOString(),
    }
    return { ...latest, frames: [...latest.frames, frame] }
  })
  emit({ type: 'replied', frame, session: updated })
  return updated
}

/**
 * Sends the player's message and saves the Character's reply as a new Frame. A message or reply
 * that crosses a Limit is declined: nothing is saved, and the player can reword it.
 */
export async function sendMessage(
  deps: RoleplayDeps,
  session: RoleplaySession,
  message: string,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession | null> {
  if (!session.cast || !session.frames.length) {
    throw new RoleplayError('The scene has not begun yet')
  }
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()

  const messageLimit = await limitCrossedBy(message, deps.textModel, signal)
  if (messageLimit) {
    emit({ type: 'declined', message: `Declined: ${messageLimit}.` })
    return null
  }

  const messages = await roleplayMessages(session, message)
  const reply = await withRetry(
    (onThinking) =>
      deps.roleplayModel.reply(messages, signal, {
        thinking: onThinking,
        field: (key, value) => emit({ type: 'reply-part', key, value }),
      }),
    signal,
    emit,
  )
  signal.throwIfAborted()
  const replyLimit = crossedLimit(replyText(reply), activeProseLimits())
  if (replyLimit) {
    emit({
      type: 'declined',
      message: `The reply crossed a limit (${replyLimit.message}); try again or reword.`,
    })
    return null
  }
  return await commit(deps, session, message, reply, start, emit)
}

/**
 * Pictures Frame `index` with the Art Agent: writes the Roleplay's Look first if it has none,
 * then the Frame's seven sentences from the story up to it, and saves its Image Prompt. Picturing
 * a Frame again replaces its picture. The Image Prompt is checked against the Limits in force; one
 * that crosses them is saved as blocked, like a Storyboard Frame.
 */
export async function pictureFrame(
  deps: RoleplayDeps,
  session: RoleplaySession,
  scenario: Scenario,
  index: number,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast || !session.frames[index]) throw new RoleplayError(`There is no Frame ${index}`)
  const art = deps.artModel ?? deps.roleplayModel
  emit({ type: 'phase', phase: 'text' })
  let current = session
  // No Look yet (or one from before it listed people): write one.
  if (!isLook(current.look)) {
    const start = performance.now()
    const messages = await artLookMessages(current, scenario)
    const { look, thinking } = await withRetry(
      (onThinking) => art.writeLook(messages, signal, onThinking),
      signal,
      emit,
    )
    const { lookThinking: _, ...rest } = current
    current = {
      ...rest,
      look,
      lookTimings: { text: secondsSince(start) },
      lookModel: art.name,
      ...(thinking ? { lookThinking: thinking } : {}),
      // Frames pictured with an older Look take the new one.
      frames: current.frames.map((f) => (f.body ? pictured(f, look, f.body) : f)),
    }
    emit({ type: 'look', look })
  }
  const start = performance.now()
  const written = current.look as Look
  const { pictureThinking: _, ...previous } = current.frames[index]
  const style = deps.artStyle ?? 'prose'
  const messages = await artFrameMessages(current, index, style)
  // Anyone the picture brings in joins the Look, so they look the same next time.
  let look = written
  const draw = async () => {
    const { body, shown, newcomers, clothing, thinking } = await withRetry(
      (onThinking) => art.pictureFrame(messages, signal, onThinking, style),
      signal,
      emit,
    )
    signal.throwIfAborted()
    look = withNewcomers(written, newcomers)
    return { frame: pictured(previous, look, body, shown, clothing), thinking }
  }
  let { frame: drawn, thinking } = await draw()
  // A picture that crosses a Limit gets one more try, told which; the second is kept either way.
  if (drawn.blocked) {
    messages[1] = {
      ...messages[1],
      content: `${messages[1].content}\n\nYour last picture of this Frame crossed a limit ` +
        `(${drawn.blocked}). Picture it again, within the Limits.`,
    }
    ;({ frame: drawn, thinking } = await draw())
  }
  // Saved onto the Roleplay as it is now: the conversation may have moved on meanwhile.
  const wroteLook = look !== session.look
  let frame!: RoleplayFrame
  const updated = await updateSession(deps.store, session.id, (latest) => {
    const now = latest.frames[index]
    if (!now) throw new GoneError(`Frame ${index} no longer exists`)
    const { pictureThinking: _, pictureStyle: __, ...kept } = now
    frame = {
      ...pictured(kept, look, drawn.body!, drawn.shown, drawn.clothing),
      pictureTimings: { text: secondsSince(start) },
      pictureModel: art.name,
      ...(style === 'tags' ? { pictureStyle: 'tags' as const } : {}),
      ...(thinking ? { pictureThinking: thinking } : {}),
    }
    const withLook: RoleplaySession = wroteLook
      ? {
        ...latest,
        look,
        lookTimings: current.lookTimings,
        lookModel: current.lookModel,
        ...(current.lookThinking ? { lookThinking: current.lookThinking } : {}),
        // Frames pictured with an older Look take the new one.
        frames: latest.frames.map((f) => (f.body ? pictured(f, look, f.body) : f)),
      }
      : latest
    return { ...withLook, frames: withLook.frames.map((f) => (f.index === index ? frame : f)) }
  })
  emit({ type: 'pictured', frame, session: updated })
  return updated
}

/**
 * Replaces the Look, edited by hand, and rewrites every pictured Frame's Image Prompt with it; a
 * renamed person stays shown where they were.
 */
export async function setLook(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  if (!isLook(value)) throw new CastError('The Look needs its people and a style')
  let look: Look
  try {
    look = cleanLook(value)
  } catch (err) {
    throw new CastError((err as Error).message)
  }
  const limit = lookLimit(look)
  if (limit) throw new RoleplayLimitError(`That crosses a limit: ${limit}`)
  return await updateSession(store, session.id, (latest) => {
    const before = isLook(latest.look) ? latest.look.people : []
    return {
      ...latest,
      look,
      frames: latest.frames.map((f) =>
        f.body ? pictured(f, look, f.body, renameShown(before, look.people, f.shown ?? [])) : f
      ),
    }
  })
}

/**
 * Renders Frame `index`'s picture through the shared render queue, in place of its picture by the
 * same Image Model (`replacePicture`). Refused for a Frame that isn't pictured or whose picture
 * crosses a Limit.
 */
export async function renderRoleplayFrame(
  deps: RoleplayDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  const frame = session.frames[index]
  if (!frame?.prompt) throw new RoleplayError(`Frame ${index} isn't pictured yet`)
  if (frame.blocked) {
    throw new RoleplayLimitError(`Frame ${index} crosses a limit: ${frame.blocked}`)
  }
  const { session: updated, frame: rendered } = await replacePicture(
    deps,
    session,
    index,
    frame.prompt,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, change),
  )
  emit({ type: 'rendered', frame: rendered, session: updated })
  return updated
}

/** Removes the latest exchange, so the player can say something else. The opening stays. */
export async function undoLatestExchange(
  store: SessionStore,
  session: RoleplaySession,
  index: number,
): Promise<RoleplaySession> {
  const latest = session.frames.at(-1)
  if (!latest || latest.index !== index) {
    throw new RoleplayError(`Frame ${index} is not the latest Frame`)
  }
  if (latest.message === null) throw new RoleplayError("The opening can't be undone")
  const updated = await updateSession(store, session.id, (latest) => ({
    ...latest,
    frames: latest.frames.slice(0, -1),
  }))
  const spoken = [latest.speech?.file, latest.thoughtSpeech?.file].filter((f): f is string => !!f)
  await removeFiles(store.dir(session.id), [...allPictureFiles(latest), ...spoken])
  return updated
}

/** Replaces the Cast, edited by hand; applies from the next reply. */
export async function setCast(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  const cast = parseCast(value)
  const limit = crossedLimit(castText(cast))
  if (limit) throw new RoleplayLimitError(`That crosses a limit: ${limit.message}`)
  return await updateSession(store, session.id, (latest) => ({ ...latest, cast }))
}
