import { join } from '@std/path'
import type { FigureMaker } from '../figure.ts'
import { type ProgressEvent, removeImage, renderImage, secondsSince } from '../frames.ts'
import { renderPrompt } from '../imagePrompt.ts'
import type { ImageGenerator } from '../imageGenerator.ts'
import { crossedLimit } from '../limits.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { Session, SessionStore } from '../session.ts'
import { composePrompt } from '../storyboard.ts'
import type { TextModel } from '../textModel.ts'
import { identityFor, isRoleplayLook, undressed } from './art.ts'
import type { Figure, Framing, RoleplaySession, Who } from './types.ts'
import { updateSession } from './update.ts'

export interface FigureDeps {
  store: SessionStore
  /** TripoSplat, when 3D figures are available. */
  figure?: FigureMaker
  /** For rendering portraits, through the render queue every Session shares. */
  imageGenerator: ImageGenerator
  textModel: TextModel
  renderQueue?: RenderQueue
}

export type FigureEvent =
  | ProgressEvent
  | { type: 'figured'; who?: Who; index?: number; figure: Figure; session: RoleplaySession }

export class FigureError extends Error {}

/** What a portrait shows of them, in a sentence; standing alone so the figure is all of them. */
const FRAMING: Record<Framing, string> = {
  full: 'Alone, full length from head to feet, standing in a relaxed three-quarter stance ' +
    'facing the viewer, arms loose at the sides, hands and feet visible.',
  waist: 'Alone, a waist-up portrait from the top of the head to the waist, in a slight ' +
    'three-quarter turn facing the viewer, the face clearly visible, arms relaxed at the sides.',
}
/** Portraits are rendered tall for full length, square for waist-up. */
const SIZE: Record<Framing, string> = { full: 'portrait', waist: 'square' }
/**
 * A plain backdrop and even light: TripoSplat cuts the person out cleanly against it, and builds
 * no detail it can't see (docs/research/image-to-3d.md).
 */
const STUDIO = 'A plain, dark grey studio backdrop with nothing else in the scene. Soft, even, ' +
  'frontal lighting with gentle shadows, every part of them clearly lit.'

/**
 * What they wear in the latest picture that says: the whole clothing sentence of a picture of them
 * alone (it may say only "He wears…"), or the parts of a shared one that name them ("Kael wears a
 * coat, while Elara wears a robe" gives Elara the robe and not the coat).
 */
export function latestClothing(session: RoleplaySession, who: Who): string | undefined {
  const cast = session.cast
  if (!cast) return undefined
  const name = (who === 'character' ? cast.character.name : cast.persona.name).split(/\s+/)[0]
  const names = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  for (const frame of session.frames.toReversed()) {
    if (!frame.clothing) continue
    if (frame.shown === who) return frame.clothing
    if (frame.shown && frame.shown !== 'both') continue
    const parts = frame.clothing.split(/(?<=\.)\s+|;\s*|,\s*(?:while|and)\s+/)
      .map((p) => p.trim().replace(/[.;,]+$/, ''))
      .filter((p) => names.test(p))
    if (parts.length) return `${parts.join('; ')}.`
  }
  return undefined
}

/**
 * The Image Prompt for a portrait of one person to make a figure from: their identity from the
 * Look, the framing, their clothes in the latest picture they're in, a plain studio, the Look's
 * style. Refused if it crosses a Limit, as a Frame's picture would be.
 */
export function portraitPrompt(session: RoleplaySession, who: Who, framing: Framing): string {
  if (!session.cast || !isRoleplayLook(session.look)) {
    throw new FigureError('Picture a Frame first: the figure is drawn from the Look')
  }
  const clothing = latestClothing(session, who)
  const body = [FRAMING[framing], clothing, STUDIO].filter(Boolean).join(' ')
  const promptText = renderPrompt(
    composePrompt({ subject: identityFor(session.look, who), style: session.look.style }, body),
  )
  const blocked = crossedLimit(promptText)?.message ?? undressed(session.cast, who, clothing)
  if (blocked) throw new FigureError(`The portrait crosses a limit: ${blocked}`)
  return promptText
}

/** Makes a figure from `image` (a file in the Session's directory) in its turn behind renders. */
async function makeFigure(
  deps: FigureDeps,
  dir: string,
  image: string,
  file: string,
  emit: (event: FigureEvent) => void,
  signal: AbortSignal,
): Promise<{ splats: number; queued?: number; seconds: number }> {
  if (!deps.figure) throw new FigureError('3D figures are off (FIGURES=off)')
  const start = performance.now()
  let waited = false
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
    waited = true
    emit({ type: 'phase', phase: 'queued' })
  })
  try {
    const queued = waited ? secondsSince(start) : undefined
    emit({ type: 'phase', phase: 'image' })
    const began = performance.now()
    const { splats } = await deps.figure.make(
      { image: join(dir, image), out: join(dir, file) },
      signal,
      (downloading) => emit({ type: 'phase', phase: downloading ? 'download' : 'image' }),
    )
    signal.throwIfAborted()
    return { splats, ...(queued !== undefined ? { queued } : {}), seconds: secondsSince(began) }
  } finally {
    release()
  }
}

const suffix = () => crypto.randomUUID().slice(0, 8)

/**
 * Renders a portrait of one person from the Look and makes it into their figure, replacing the
 * one they had. Either can take minutes the first time: the Image Model, then TripoSplat.
 */
export async function makePortraitFigure(
  deps: FigureDeps,
  session: RoleplaySession,
  who: Who,
  framing: Framing,
  emit: (event: FigureEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  if (!deps.figure) throw new FigureError('3D figures are off (FIGURES=off)')
  const prompt = portraitPrompt(session, who, framing)
  const dir = deps.store.dir(session.id)
  const id = suffix()
  const name = `portrait-${who}-${id}`
  const file = `figure-${who}-${id}.ply`
  const timings = { text: 0, image: null as number | null } as {
    text: number
    image: number | null
    queued?: number
  }
  let portrait: string | undefined
  try {
    // The portrait at the size that suits its framing, with the Session's other settings.
    const sized = { ...session, settings: { ...session.settings, size: SIZE[framing] } } as Session
    portrait = await renderImage(deps, sized, prompt, name, timings, emit, signal)
    signal.throwIfAborted()
    const made = await makeFigure(deps, dir, portrait, file, emit, signal)
    const figure: Figure = {
      file,
      splats: made.splats,
      from: portrait,
      framing,
      prompt,
      timings: {
        ...(timings.queued !== undefined ? { queued: timings.queued } : {}),
        image: timings.image ?? 0,
        figure: made.seconds,
      },
    }
    let replaced: Figure | undefined
    const updated = await updateSession(deps.store, session.id, (latest) => {
      replaced = latest.figures?.[who]
      return { ...latest, figures: { ...latest.figures, [who]: figure } }
    })
    if (replaced) await removeFigure(dir, replaced)
    emit({ type: 'figured', who, figure, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    if (portrait) await removeImage(dir, name)
    throw err
  }
}

/**
 * Lifts the person in Frame `index`'s picture out as a figure (from its upscale if it has one),
 * replacing the one it had. Anyone overlapping them takes parts of them away, and two people in
 * the picture may come out as one.
 */
export async function liftFigure(
  deps: FigureDeps,
  session: RoleplaySession,
  index: number,
  emit: (event: FigureEvent) => void,
  signal: AbortSignal,
): Promise<RoleplaySession> {
  const frame = session.frames[index]
  const image = frame?.image
  if (!image) throw new FigureError(`Frame ${index} has no picture yet`)
  const from = frame.upscaled ?? image
  const dir = deps.store.dir(session.id)
  const file = `figure-${index}-${suffix()}.ply`
  try {
    const made = await makeFigure(deps, dir, from, file, emit, signal)
    const figure: Figure = {
      file,
      splats: made.splats,
      from,
      timings: {
        ...(made.queued !== undefined ? { queued: made.queued } : {}),
        figure: made.seconds,
      },
    }
    let replaced: string | undefined
    // Onto the Frame as it is now, if it still shows the picture the figure was made from.
    const updated = await updateSession(deps.store, session.id, (latest) => {
      const current = latest.frames[index]
      if (current?.image !== image) throw new FigureError(`Frame ${index}'s picture changed`)
      replaced = current.figure?.file
      return {
        ...latest,
        frames: latest.frames.map((f) => (f.index === index ? { ...f, figure } : f)),
      }
    })
    if (replaced) await Deno.remove(join(dir, replaced)).catch(() => {})
    emit({ type: 'figured', index, figure, session: updated })
    return updated
  } catch (err) {
    await Deno.remove(join(dir, file)).catch(() => {})
    throw err
  }
}

/** Deletes a portrait figure's files: the figure, and the portrait rendered for it. */
async function removeFigure(dir: string, figure: Figure) {
  await Deno.remove(join(dir, figure.file)).catch(() => {})
  if (figure.framing) await removeImage(dir, figure.from.replace(/\.\w+$/, ''))
}
