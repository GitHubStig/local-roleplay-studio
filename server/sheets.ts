/**
 * Reference sheets (docs/reference-sheets-plans.md): a sheet of each Subject of a Storyboard's or
 * a Roleplay's Look, three views of it in one render, made while the player reviews the plan or
 * the Cast, for the face pass to repaint faces from. Kept beside the Look (`sheets`), in its order,
 * each made from its Subject's identity word for word, and settled once the story begins.
 */
import decodePng from '@jsquash/png/decode.js'
import encodePng from '@jsquash/png/encode.js'
import { join } from '@std/path'
import type { RoleplaySession } from '../shared/roleplay.ts'
import type { Sheet, SheetPicture, StoryboardSession } from '../shared/session.ts'
import type { SheetEvent } from '../shared/events.ts'
import { type RenderDeps, renderImage } from './frames.ts'
import { crossedLimit } from './limits.ts'
import { sheetImageModel } from './machine.ts'
import { removeFiles } from './pictures.ts'
import { loadPrompt } from './promptFiles.ts'
import { Refusal } from './refusal.ts'
import { DEFAULT_SETTINGS } from './settings.ts'
import { GoneError, updateSession } from './update.ts'

/** A Session that can have sheets: one with a Look. */
export type WithSheets = StoryboardSession | RoleplaySession

/** A sheet's size: three views side by side, each a 512×640 head and shoulders. */
export const SHEET_SIZE = { width: 1536, height: 640 }

/** Why a sheet can't be made, redone or ticked: it crosses a Limit, or its story has begun. */
export class SheetError extends Refusal {}

/**
 * Whether a Session's sheets are settled: once its story has begun (a Roleplay's opening, a
 * Storyboard's first Frame written), they're made, redone and ticked no more, so no picture is
 * made from a sheet that later changes. One still being made then is finished.
 */
export const sheetsSettled = (session: WithSheets): boolean =>
  session.kind === 'roleplay' ? session.frames.length > 0 : session.frames.some((f) => f.image)

/** The files a made sheet keeps: the sheet, its views and their mirrors. */
export const sheetFiles = (made: SheetPicture | undefined): string[] =>
  made ? [made.file, ...made.views, ...made.mirrored] : []

/**
 * A Session's sheets brought in line with its Look: one per Subject, in its order. A Subject's
 * sheet is kept; a renamed one's is renamed (while the Look has as many Subjects as before, the one
 * in the same place, as `renameShown` takes it); a new Subject's starts ticked, seeded from the
 * Session's seed and its place. One whose identity changed is made again (`remade`), as a sheet
 * and its identity must agree; a removed Subject's goes. `dropped` are the pictures no sheet keeps.
 */
export function reconcileSheets(session: WithSheets): {
  sheets: Sheet[]
  remade: string[]
  dropped: SheetPicture[]
} {
  const old = session.sheets
  const subjects = session.settings.sheets ? session.look?.subjects ?? [] : []
  const sameCount = old.length === subjects.length
  const remade: string[] = []
  const sheets = subjects.map((subject, i): Sheet => {
    const named = old.find((s) => s.subject === subject.name)
    const renamed = !named && sameCount && !subjects.some((p) => p.name === old[i].subject)
    const sheet = named ?? (renamed ? { ...old[i], subject: subject.name } : undefined)
    if (!sheet) {
      return {
        subject: subject.name,
        ticked: true,
        identity: subject.identity,
        seed: session.seed + i,
      }
    }
    if (sheet.identity === subject.identity) return sheet
    remade.push(subject.name)
    const { made: _, ...rest } = sheet
    return { ...rest, identity: subject.identity }
  })
  const kept = new Set(sheets.flatMap((s) => s.made ? [s.made.file] : []))
  const dropped = old.flatMap((s) => s.made && !kept.has(s.made.file) ? [s.made] : [])
  return { sheets, remade, dropped }
}

/** The sheets still to make: ticked, and not made yet. */
export const sheetsToMake = (session: WithSheets): Sheet[] =>
  session.settings.sheets ? session.sheets.filter((s) => s.ticked && !s.made) : []

/** A Subject's sheet's prompt: its identity, the sheet's three views, the Look's style. */
export const sheetPrompt = (sheet: Sheet, style: string) =>
  loadPrompt('sheets/sheet', { identity: sheet.identity, name: sheet.subject, style })

/** A file name's part for a Subject: "the-lantern-of-vael". */
const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subject'

/**
 * Makes Subject `subject`'s sheet: renders it at `SHEET_SIZE` by the sheets' Image Model (Settings'
 * choice, or the Session's own) at the sheet's seed, through the render queue, cuts its three
 * views and mirrors them, and saves it, replacing any it had. Discarded if, meanwhile, the sheet
 * went, or its identity or seed changed (made again by another job).
 */
export async function makeSheet(
  deps: RenderDeps,
  session: WithSheets,
  subject: string,
  emit: (event: SheetEvent) => void,
  signal: AbortSignal,
): Promise<WithSheets> {
  const sheet = session.sheets.find((s) => s.subject === subject)
  if (!sheet || !session.look) throw new GoneError(`${subject} has no sheet`)
  const prompt = await sheetPrompt(sheet, session.look.style)
  const limit = crossedLimit(prompt)
  if (limit) throw new SheetError(`${subject}'s sheet crosses a limit: ${limit.message}`, 422)
  const now = deps.settings ? await deps.settings() : DEFAULT_SETTINGS
  const imageModel = sheetImageModel(session.settings, now)
  const dir = deps.store.dir(session.id)
  const name = `sheet-${slug(subject)}-${crypto.randomUUID().slice(0, 8)}`
  const rendered = await renderImage(deps, session, prompt, name, emit, signal, {
    seed: sheet.seed,
    size: SHEET_SIZE,
    imageModel,
  })
  let made: SheetPicture
  try {
    signal.throwIfAborted()
    made = {
      file: rendered.file,
      ...await cutSheet(dir, rendered.file),
      imageModel: rendered.imageModel,
      createdAt: new Date().toISOString(),
    }
  } catch (err) {
    await removeFiles(dir, [rendered.file])
    throw err
  }
  let replaced: SheetPicture | undefined
  let saved: Sheet | undefined
  const updated = await updateSession(deps.store, session.id, session.kind, (latest) => {
    const now = latest.sheets.find((s) => s.subject === subject)
    if (!now || now.identity !== sheet.identity || now.seed !== sheet.seed) return latest
    replaced = now.made
    saved = { ...now, made }
    return { ...latest, sheets: latest.sheets.map((s) => (s === now ? saved! : s)) }
  })
  if (!saved) {
    await removeFiles(dir, sheetFiles(made))
    throw new GoneError(`${subject}'s sheet changed while it was made`)
  }
  await removeFiles(dir, sheetFiles(replaced))
  emit({ type: 'sheet', subject, sheet: saved })
  return updated
}

/**
 * A sheet's three views, cut apart (left to right: front, three-quarter, profile) and each
 * mirrored, for the face pass's redo with one view: PNGs beside it, named after it.
 */
export async function cutSheet(
  dir: string,
  file: string,
): Promise<Pick<SheetPicture, 'views' | 'mirrored'>> {
  if (!file.endsWith('.png')) throw new Error(`A sheet can't be cut from ${file}: not a PNG`)
  const bytes = await Deno.readFile(join(dir, file))
  const sheet = await decodePng(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
  const width = Math.floor(sheet.width / 3)
  const base = file.replace(/\.png$/, '')
  const views: string[] = []
  const mirrored: string[] = []
  for (let i = 0; i < 3; i++) {
    const view = new Uint8ClampedArray(width * sheet.height * 4)
    const flipped = new Uint8ClampedArray(width * sheet.height * 4)
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < width; x++) {
        const from = (y * sheet.width + i * width + x) * 4
        const to = (y * width + x) * 4
        const mirror = (y * width + (width - 1 - x)) * 4
        for (let c = 0; c < 4; c++) {
          view[to + c] = sheet.data[from + c]
          flipped[mirror + c] = sheet.data[from + c]
        }
      }
    }
    const names = [`${base}-view${i + 1}.png`, `${base}-view${i + 1}-mirrored.png`]
    await Deno.writeFile(
      join(dir, names[0]),
      new Uint8Array(await encodePng(new ImageData(view, width, sheet.height))),
    )
    await Deno.writeFile(
      join(dir, names[1]),
      new Uint8Array(await encodePng(new ImageData(flipped, width, sheet.height))),
    )
    views.push(names[0])
    mirrored.push(names[1])
  }
  return {
    views: views as SheetPicture['views'],
    mirrored: mirrored as SheetPicture['mirrored'],
  }
}

/**
 * Redoes Subject `subject`'s sheet with the next seed (ADR 0011: a Redo is one more), its old
 * picture gone; refused once the story has begun.
 */
export async function redoSheet(
  store: RenderDeps['store'],
  session: WithSheets,
  subject: string,
): Promise<WithSheets> {
  let dropped: SheetPicture | undefined
  const updated = await updateSession(store, session.id, session.kind, (latest) => {
    const sheet = checkChangeable(latest, subject)
    dropped = sheet.made
    const { made: _, ...rest } = sheet
    const redone = { ...rest, seed: sheet.seed + 1 }
    return { ...latest, sheets: latest.sheets.map((s) => (s === sheet ? redone : s)) }
  })
  await removeFiles(store.dir(session.id), sheetFiles(dropped))
  return updated
}

/** Ticks or unticks Subject `subject`'s sheet: whether its face is repainted from it. */
export function tickSheet(
  store: RenderDeps['store'],
  session: WithSheets,
  subject: string,
  ticked: boolean,
): Promise<WithSheets> {
  return updateSession(store, session.id, session.kind, (latest) => {
    const sheet = checkChangeable(latest, subject)
    return {
      ...latest,
      sheets: latest.sheets.map((s) => (s === sheet ? { ...sheet, ticked } : s)),
    }
  })
}

/** Subject `subject`'s sheet, while it can still change; refused otherwise. */
function checkChangeable(session: WithSheets, subject: string): Sheet {
  if (!session.settings.sheets) throw new SheetError('This Session has no reference sheets')
  if (sheetsSettled(session)) {
    throw new SheetError('The sheets are settled once the story has begun')
  }
  const sheet = session.sheets.find((s) => s.subject === subject)
  if (!sheet) throw new SheetError(`${subject} has no sheet`, 404)
  return sheet
}
