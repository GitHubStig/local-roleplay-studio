import { frameName, replacePicture, secondsSince, withRetry } from '../frames.ts'
import type { RoleplayEvent } from '../../shared/events.ts'
import type { ImageGenerator } from '../images/imageGenerator.ts'
import type { RenderQueue } from '../renderQueue.ts'
import type { Settings } from '../../shared/settings.ts'
import { activeProseLimits, crossedLimit } from '../limits.ts'
import { othersOf, truthList } from '../scenario.ts'
import type { Scenario } from '../../shared/scenario.ts'
import type { SessionStore } from '../session.ts'
import type { Look } from '../../shared/session.ts'
import type { FigureMaker } from '../3d/figure.ts'
import type { SceneMaker } from '../3d/scene.ts'
import type { VoiceEngine } from '../voice/voice.ts'
import type { RoleplayModel } from './model.ts'
import { GoneError, updateSession } from './update.ts'
import { allPictureFiles, removeFiles } from '../pictures.ts'
import { CastError, openingMessages, parseCast, roleplayMessages } from './prompt.ts'
import { judgeMessages } from './judge.ts'
import {
  artFrameMessages,
  artLookMessages,
  imageOf,
  isLook,
  pictured,
  repictured,
  withNewcomers,
} from './art.ts'
import { cleanLook, lookLimit, renameShown } from '../look.ts'
import { withoutCuesFrom } from './music/director.ts'
import type { Cast, Reply, RoleplayFrame, RoleplaySession } from '../../shared/roleplay.ts'
import { Refusal } from '../refusal.ts'

export interface RoleplayDeps {
  store: SessionStore
  roleplayModel: RoleplayModel
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
const castText = ({ character, persona, setting, truths = [], others = [] }: Cast) =>
  [
    ...Object.values(character),
    ...Object.values(persona),
    ...Object.values(setting),
    ...truths,
    ...others,
  ]
    .join('\n')
const replyText = (r: Reply) => [r.internal, r.actions, r.dialogue].join('\n')

export class RoleplayError extends Refusal {}
/** A hand edit crosses a Limit. */
export class RoleplayLimitError extends Refusal {
  static override status = 422
}

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
  const { cast: written } = await withRetry(
    (onThinking) => deps.roleplayModel.writeCast(scenario, signal, onThinking),
    signal,
    emit,
  )
  signal.throwIfAborted()
  // The Truths and the others are the Scenario's, not the model's to write; a rewrite keeps them
  // as edited.
  const cast = {
    ...written,
    truths: session.cast?.truths ?? truthList(scenario),
    others: session.cast?.others ??
      othersOf(scenario, written.character.name, written.persona.name),
  }
  const limit = crossedLimit(castText(cast))
  if (limit) throw new Error(`The Cast crossed a limit: ${limit.message}`)
  // Onto the Roleplay as it is now: a voice may have been designed while the Cast was written. A
  // Look it had is behind the new Cast until the `look` job queued after it writes it again.
  const updated = await updateSession(deps.store, session.id, (latest) => ({
    ...latest,
    cast,
    lookBehindCast: !!latest.look,
  }))
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
  outcome = '',
): Promise<RoleplaySession> {
  const { thinking, ...fields } = reply
  let frame!: RoleplayFrame
  const updated = await updateSession(deps.store, session.id, (latest) => {
    frame = {
      index: latest.frames.length,
      message,
      reply: fields,
      ...(outcome ? { outcome } : {}),
      written: {
        model: deps.roleplayModel.name,
        seconds: secondsSince(start),
        ...(thinking ? { thinking } : {}),
      },
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

  const messageLimit = crossedLimit(message)?.message
  if (messageLimit) {
    emit({ type: 'declined', message: `Declined: ${messageLimit}.` })
    return null
  }

  // With Truths, a judge decides first whether the Message breaks one (`judge.ts`).
  const judging = await judgeMessages(session, message)
  const verdict = judging
    ? await withRetry(() => deps.roleplayModel.judge(judging, signal), signal, emit)
    : null
  signal.throwIfAborted()
  const messages = await roleplayMessages(session, message, verdict?.outcome)
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
  return await commit(deps, session, message, reply, start, emit, verdict?.outcome)
}

/**
 * Writes the Roleplay's Look from its Cast and Brief (the `look` job), queued as the Cast is written
 * so the player can read and edit it while reviewing the Cast (ADR 0044): an identity for the
 * Character, the Persona and anyone else the Brief names, and an art style. Written again, it
 * replaces the Look, and every pictured Frame takes the new one.
 */
export async function writeLook(
  deps: RoleplayDeps,
  session: RoleplaySession,
  scenario: Scenario,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast) throw new RoleplayError('This Roleplay has no Cast yet')
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const from = castStart(session.cast)
  const messages = await artLookMessages(session, scenario)
  const { look, thinking } = await withRetry(
    (onThinking) => deps.roleplayModel.writeLook(messages, signal, onThinking),
    signal,
    emit,
  )
  signal.throwIfAborted()
  const updated = await updateSession(deps.store, session.id, (latest) => ({
    ...latest,
    look,
    lookWritten: {
      model: deps.roleplayModel.name,
      seconds: secondsSince(start),
      ...(thinking ? { thinking } : {}),
    },
    // The Cast's start edited while it was written leaves it behind already.
    lookBehindCast: !latest.cast || castStart(latest.cast) !== from,
    // Frames pictured with an older Look take the new one.
    frames: latest.frames.map((f) => repictured(f, look)),
  }))
  emit({ type: 'look', look })
  return updated
}

/**
 * Pictures Frame `index` with the Art Agent: the Frame's seven sentences from the story up to it,
 * saved as its Image Prompt with the Look's identities and style. Refused before the Look is
 * written. Picturing a Frame again replaces its picture. The Image Prompt is checked against the
 * Limits in force; one that crosses them is saved as blocked, like a Storyboard Frame.
 */
export async function pictureFrame(
  deps: RoleplayDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: RoleplayEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!session.cast || !session.frames[index]) {
    throw new RoleplayError(`There is no ${frameName(index)}`)
  }
  if (!session.look) {
    throw new RoleplayError('This Roleplay has no Look yet: write it in Look & Cast first')
  }
  const art = deps.roleplayModel
  emit({ type: 'phase', phase: 'text' })
  const start = performance.now()
  const written = session.look
  const messages = await artFrameMessages(session, index)
  // Anyone the picture brings in joins the Look, so they look the same next time.
  let look = written
  const draw = async () => {
    const { body, expression, shown, newcomers, clothing, thinking } = await withRetry(
      (onThinking) => art.pictureFrame(messages, signal, onThinking),
      signal,
      emit,
    )
    signal.throwIfAborted()
    look = withNewcomers(written, newcomers)
    return { drawn: imageOf(look, { body, expression, shown, clothing }), thinking }
  }
  let { drawn, thinking } = await draw()
  // A picture that crosses a Limit gets one more try, told which; the second is kept either way.
  if (drawn.blocked) {
    messages[1] = {
      ...messages[1],
      content: `${messages[1].content}\n\nYour last picture of this Frame crossed a limit ` +
        `(${drawn.blocked}). Picture it again, within the Limits.`,
    }
    ;({ drawn, thinking } = await draw())
  }
  // Saved onto the Roleplay as it is now: the conversation may have moved on meanwhile.
  const wroteLook = look !== session.look
  let frame!: RoleplayFrame
  const updated = await updateSession(deps.store, session.id, (latest) => {
    const now = latest.frames[index]
    if (!now) throw new GoneError(`${frameName(index)} no longer exists`)
    frame = pictured(now, {
      ...imageOf(look, drawn),
      written: { model: art.name, seconds: secondsSince(start), ...(thinking ? { thinking } : {}) },
    })
    const withLook: RoleplaySession = wroteLook
      ? {
        ...latest,
        look,
        // Frames pictured with an older Look take the new one.
        frames: latest.frames.map((f) => repictured(f, look)),
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
  if (!isLook(value)) throw new CastError('The Look needs its Subjects and a style')
  let look: Look
  try {
    look = cleanLook(value)
  } catch (err) {
    throw new CastError((err as Error).message)
  }
  const limit = lookLimit(look)
  if (limit) throw new RoleplayLimitError(`That crosses a limit: ${limit}`)
  return await updateSession(store, session.id, (latest) => {
    const before = latest.look?.subjects ?? []
    return {
      ...latest,
      look,
      // Saved by the player with the Cast as it is now.
      lookBehindCast: false,
      frames: latest.frames.map((f) =>
        repictured(f, look, f.image && renameShown(before, look.subjects, f.image.shown))
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
  const image = session.frames[index]?.image
  if (!image) throw new RoleplayError(`${frameName(index)} isn't pictured yet`)
  if (image.blocked) {
    throw new RoleplayLimitError(`${frameName(index)} crosses a limit: ${image.blocked}`)
  }
  const { session: updated, frame: rendered } = await replacePicture(
    deps,
    session,
    index,
    image.prompt,
    emit,
    signal,
    (change) => updateSession(deps.store, session.id, change),
    { shown: image.shown, expression: image.expression },
  )
  emit({ type: 'rendered', frame: rendered, session: updated })
  return updated
}

/**
 * Undoes the exchanges from Frame `from` on, so the player can say something else from the one
 * before. `latest` is the latest Frame as the player saw it, so a repeated request can't undo more
 * than they meant. The opening stays.
 */
export async function undoExchanges(
  store: SessionStore,
  session: RoleplaySession,
  from: number,
  latest: number,
): Promise<RoleplaySession> {
  if (session.frames.at(-1)?.index !== latest) {
    throw new RoleplayError(`${frameName(latest)} is not the latest Frame`)
  }
  if (from > latest) throw new RoleplayError(`${frameName(from)} is after the latest Frame`)
  if (from <= 0 || session.frames[from].message === null) {
    throw new RoleplayError("The opening can't be undone")
  }
  const undone = session.frames.slice(from)
  // A Cue one of them began goes with it.
  const updated = await updateSession(store, session.id, (now) => ({
    ...withoutCuesFrom(now, from),
    frames: now.frames.slice(0, from),
  }))
  await removeFiles(store.dir(session.id), undone.flatMap(exchangeFiles))
  return updated
}

/**
 * Takes a Roleplay back to its Cast, to edit and begin again: every exchange goes, the opening too,
 * with its pictures and spoken lines (the files deleted). The Cast, the Look and the voice stay.
 */
export async function restartRoleplay(
  store: SessionStore,
  session: RoleplaySession,
): Promise<RoleplaySession> {
  if (!session.frames.length) throw new RoleplayError('The scene has not begun yet')
  let files: string[] = []
  const updated = await updateSession(store, session.id, (latest) => {
    files = latest.frames.flatMap(exchangeFiles)
    return { ...latest, frames: [], cues: [] }
  })
  await removeFiles(store.dir(session.id), files)
  return updated
}

/** The files an exchange is made of: its pictures and its spoken lines. */
const exchangeFiles = (frame: RoleplayFrame): string[] => [
  ...allPictureFiles(frame),
  ...[frame.speech?.file, frame.thoughtSpeech?.file].filter((f): f is string => !!f),
]

/** Replaces the Cast, edited by hand; applies from the next reply. */
export async function setCast(
  store: SessionStore,
  session: RoleplaySession,
  value: unknown,
): Promise<RoleplaySession> {
  const cast = parseCast(value)
  const limit = crossedLimit(castText(cast))
  if (limit) throw new RoleplayLimitError(`That crosses a limit: ${limit.message}`)
  return await updateSession(store, session.id, (latest) => {
    const started = latest.cast && castStart(cast) !== castStart(latest.cast)
    if (latest.frames.length && started) {
      throw new CastError("How the scene started can't change once it has begun: restart it first")
    }
    // A Look written from the start as it was may not fit it now: the player is asked.
    return {
      ...latest,
      cast,
      lookBehindCast: latest.lookBehindCast || (!!started && !!latest.look),
    }
  })
}

/**
 * How things were when the scene began: who's who, the Character's age and looks, the Persona, the
 * Setting. Fixed once it has begun, as the story moves on from it (time passes, looks change) and
 * the Look's Subjects go by the names; the rest of the Character still steers it.
 */
const castStart = ({ character: { name, age, appearance }, persona, setting }: Cast) =>
  JSON.stringify({ name, age, appearance, persona, setting })
