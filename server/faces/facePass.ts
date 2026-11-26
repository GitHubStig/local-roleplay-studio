/**
 * The face pass (ADR 0045): after a Frame renders, or its picture is edited,
 * each face it shows of a Subject with a reference sheet is repainted from that sheet (for an edit
 * of a painted area, only the heads the area touches, told to keep what the edit changed).
 * How the faces come from the sheets is one interface (`FaceWay`), as the plan keeps one pass
 * possible; two passes is the default, and the only way built: one pass would hand the sheets to
 * the render itself, which needs an Image Model that takes references.
 *
 * Two passes: find the heads of the Subjects shown, by name and identity, with which way each is
 * turned; then an edit each (stage 0b: one edit for two lost a scowl and a turn of the head), its
 * area the head's box grown by a fifth and softened, its instruction naming the Frame's expression
 * sentence (or an edit's change), and its reference the one view of the sheet nearest the head's turn, mirrored where it
 * faces the other way. One view, not the sheet whole as stage 0 settled: on 2026-11-26 the whole
 * sheet left a face that barely moves (Elara) as rendered, where one view gave it the sheet's face
 * on every seed; and one head can't paste the sheet's three in, so the heads aren't counted after
 * (docs/bench/reference-sheets/2026-11-26/).
 */
import { join } from '@std/path'
import type { Backend } from '../../shared/backends.ts'
import type { FacePass } from '../../shared/pictures.ts'
import type { FacesStep } from '../../shared/jobs.ts'
import type { ProgressEvent } from '../../shared/events.ts'
import type { Session, Sheet, SheetPicture, Subject } from '../../shared/session.ts'
import type { Settings } from '../../shared/settings.ts'
import { EDIT_MODELS, type EditModel } from '../../shared/images.ts'
import { type Head, type HeadFinder, type HeadRequest, sheetFlaw } from '../heads/heads.ts'
import type { ImageGenerator } from '../images/imageGenerator.ts'
import { editJob, type HeavyJob } from '../machine.ts'
import { pngSize } from '../png.ts'
import { loadPrompt } from '../promptFiles.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { SessionStore } from '../session.ts'
import { DEFAULT_SETTINGS } from '../settings.ts'
import { headArea, touches } from './area.ts'

/** A Subject the Frame shows that has a sheet to repaint it from: ticked, and made. */
export interface ShownSheet {
  subject: string
  identity: string
  made: SheetPicture
}

/** What a face pass is asked to do: a Frame's render or edit, and who it shows with a sheet. */
export interface FacesRequest {
  session: Session
  index: number
  /** The render or the edit, a PNG in the Session's folder. */
  file: string
  /** It's an edit, not a render, as what's skipped says. */
  edited?: boolean
  /**
   * An edit made from a version whose face pass is in use, so each face is already its sheet's:
   * repainted lighter (`FaceStrengths.again`), which keeps what an earlier edit added (a cap, a cut).
   */
  again?: boolean
  /** The seed it was made with: the first face edit is one on (ADR 0011). */
  seed: number
  /**
   * For an edit, the area painted for it (a PNG in the Session's folder): only the heads it
   * touches are repainted, as the rest are as they were. None for a render, or an edit of all of
   * the picture (a camera move), whose every head is repainted.
   */
  area?: string
  sheets: ShownSheet[]
  /** The Frame's expression sentence, '' when not known. */
  expression: string
  /** For an edit, what it was told: the face pass keeps that change rather than the expression named. */
  change?: string
  /**
   * What the Frame's clothing sentence says each person has on, marks on the skin included (a
   * Roleplay's): named for the pass to keep, unless it's told an edit's change.
   */
  worn?: string
}

/** What a face pass did: the picture with its faces repainted, or why it left it as rendered. */
export type FacesDone =
  | { faced: { file: string; pass: Omit<FacePass, 'without' | 'other'>; missed: string[] } }
  | { skipped: string; untouched?: boolean }

/** Its progress: the render's own events, and the step's (`faces`) as it begins. */
export type FacesEmit = (event: ProgressEvent) => void

/** A reference sheet just made, to check before it's used: a PNG in the Session's folder. */
export interface SheetCheckRequest {
  session: Session
  file: string
  who: Subject
}

/** How a Frame's faces come from their sheets (one interface for one pass or two, ADR 0045). */
export interface FaceWay {
  /** After the render: repaints the faces, or says why it didn't. Removes what it made on failure. */
  repaint(req: FacesRequest, emit: FacesEmit, signal: AbortSignal): Promise<FacesDone>
  /** Why a sheet just made is unfit for this way (none when it's fit), and whether it's a thing's. */
  checkSheet(req: SheetCheckRequest, signal: AbortSignal): Promise<SheetCheck>
}

/** What a sheet's check found. */
export interface SheetCheck {
  /** Why it's unfit for the face pass; none when it's fit. */
  flaw?: string
  /** No head on it: a thing's sheet, not a person's or creature's. */
  thing: boolean
}

/** The sheets of the Subjects a Frame shows that its face pass uses: ticked and made, in its order. */
export function shownSheets(sheets: readonly Sheet[], shown: readonly string[]): ShownSheet[] {
  return shown.flatMap((name) => {
    const sheet = sheets.find((s) => s.subject === name && s.ticked && s.made)
    return sheet ? [{ subject: name, identity: sheet.identity, made: sheet.made! }] : []
  })
}

/** Why a Frame's faces are left as rendered when it shows no one with a sheet. */
export const NO_ONE_WITH_A_SHEET = 'No one with a sheet in it: saved as rendered.'
/** The same, for an edit. */
export const NO_ONE_WITH_A_SHEET_EDITED = 'No one with a sheet in it: saved as edited.'

export interface TwoPassDeps {
  store: SessionStore
  imageGenerator: ImageGenerator
  heads: HeadFinder
  renderQueue?: RenderQueue
  settings?: () => Promise<Settings>
  backendOf?: (job: HeavyJob) => Promise<Backend | undefined>
  /** How much of each head is repainted: the face edit model's own (`faceStrength`) unless a bench tries another. */
  strength?: number
}

const seconds = (start: number) => Math.round((performance.now() - start) / 100) / 10

/** Two passes: the render, then an edit per face (the default, and the only way built). */
export function twoPasses(deps: TwoPassDeps): FaceWay {
  return {
    /**
     * Looked over by the Qwen3-VL the face pass finds heads with, where the face pass's edits go,
     * taking its turn there as they do: three views in the order the pass picks one by, no writing
     * (`sheetFlaw`).
     */
    async checkSheet(req, signal) {
      const now = deps.settings ? await deps.settings() : DEFAULT_SETTINGS
      const job = editJob(now.faceEditModel)
      const backend = await deps.backendOf?.(job)
      const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {}, {
        job,
      })
      try {
        const look = await deps.heads.lookOver(
          {
            dir: deps.store.dir(req.session.id),
            image: req.file,
            who: req.who,
            ...(backend && { backend }),
          },
          signal,
        )
        const flaw = sheetFlaw(look, req.who.name)
        return { ...(flaw && { flaw }), thing: look.heads === 0 }
      } finally {
        release()
      }
    },
    async repaint(req, emit, signal) {
      const now = deps.settings ? await deps.settings() : DEFAULT_SETTINGS
      const model = now.faceEditModel
      const job = editJob(model)
      const backend = await deps.backendOf?.(job)
      const dir = deps.store.dir(req.session.id)
      const ask: Omit<HeadRequest, 'image'> = { dir, ...(backend && { backend }) }
      const step = (faces: FacesStep) => emit({ type: 'faces', faces })
      const as = req.edited ? 'edited' : 'rendered'
      // The masks and the edits on the way, removed once the pass ends; the last edit is kept.
      const made: string[] = []
      let picture = req.file
      const release = await (deps.renderQueue ?? new RenderQueue()).acquire(signal, () => {
        emit({ type: 'phase', phase: 'queued' })
      }, { job })
      try {
        step({ subjects: req.sheets.map((s) => s.subject) })
        emit({ type: 'phase', phase: 'faces' })
        let started = performance.now()
        const found: { sheet: ShownSheet; head: Head }[] = []
        for (const sheet of req.sheets) {
          const heads = await deps.heads.find(
            { ...ask, image: req.file, who: { name: sheet.subject, identity: sheet.identity } },
            signal,
          )
          const head = pickHead(heads, sheet.subject, found.map((f) => f.head))
          if (head) found.push({ sheet, head })
        }
        const find = seconds(started)
        const missed = req.sheets.filter((s) => !found.some((f) => f.sheet === s))
          .map((s) => s.subject)
        if (!found.length) {
          const names = new Intl.ListFormat('en', { type: 'disjunction' }).format(missed)
          return { skipped: `No head found of ${names}: saved as ${as}.` }
        }
        if (req.area) {
          const area = await Deno.readFile(join(dir, req.area))
          const touched = await Promise.all(found.map((f) => touches(area, f.head.box)))
          found.splice(0, found.length, ...found.filter((_, i) => touched[i]))
          if (!found.length) {
            return {
              skipped: 'The edit touched no face: its faces are as they were.',
              untouched: true,
            }
          }
        }
        step({ subjects: found.map((f) => f.sheet.subject) })
        started = performance.now()
        const size = pngSize(await Deno.readFile(join(dir, req.file)))
        let seed = req.seed
        for (const [i, { sheet, head }] of found.entries()) {
          const mask = `mask-${req.index}-${crypto.randomUUID().slice(0, 8)}.png`
          await Deno.writeFile(join(dir, mask), await headArea(head.box, size))
          made.push(mask)
          seed += 1
          const file = await deps.imageGenerator.edit(
            {
              model,
              ...(backend && { backend }),
              image: picture,
              mask,
              references: [viewFor(sheet.made, head.facing)],
              instruction: await faceInstruction(sheet.subject, {
                expression: req.expression,
                change: req.change,
                worn: req.worn,
                thing: sheet.made.thing,
              }),
              seed,
              strength: deps.strength ?? faceStrength(model, req.again),
              quantize: now.editQuantize,
              dir,
              name: `frame-${req.index}-${crypto.randomUUID().slice(0, 8)}`,
            },
            signal,
            // Every edit's steps as one bar.
            (done, total) =>
              emit({ type: 'progress', step: i * total + done, total: found.length * total }),
            () => emit({ type: 'phase', phase: 'download' }),
          )
          if (picture !== req.file) made.push(picture)
          picture = file
          signal.throwIfAborted()
          emit({ type: 'phase', phase: 'faces' })
        }
        return {
          faced: {
            file: picture,
            pass: {
              subjects: found.map((f) => f.sheet.subject),
              seed,
              timings: { find, faces: seconds(started) },
            },
            missed,
          },
        }
      } catch (err) {
        // The faces so far go with it; the render stays, as its caller saved it.
        if (picture !== req.file) made.push(picture)
        throw err
      } finally {
        await Promise.all(made.map((f) => Deno.remove(join(dir, f)).catch(() => {})))
        release()
      }
    },
  }
}

/**
 * The head found for `subject`: one labelled with its name if any, else the first, never one
 * already taken by a Subject before it (two alike can both be found for one of them).
 */
export function pickHead(heads: Head[], subject: string, taken: Head[]): Head | undefined {
  const free = heads.filter((h) => !taken.some((t) => overlap(t.box, h.box) > 0.5))
  const first = subject.split(/\s+/)[0].toLowerCase()
  return free.find((h) => h.label.toLowerCase().includes(first)) ?? free[0]
}

/** How much two boxes overlap: their intersection over their union. */
function overlap(a: Head['box'], b: Head['box']): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const area = (x: Head['box']) => (x[2] - x[0]) * (x[3] - x[1])
  const both = w * h
  return both / (area(a) + area(b) - both)
}

/**
 * The view of a sheet nearest a head's turn, for the pass done again: the sheet's views are, left
 * to right, the front, a three-quarter turn and a profile, both facing left, so a head facing right
 * takes a mirrored one. A turn not said takes the three-quarter view, as the bench did.
 */
export function viewFor(made: SheetPicture, facing: Head['facing']): string {
  const i = facing === 'front' ? 0 : facing?.startsWith('profile') ? 2 : 1
  return facing?.endsWith('right') ? made.mirrored[i] : made.views[i]
}

/**
 * How much of each head edit model `model` repaints in the face pass, as measured for it, for a
 * face already its sheet's (`again`) or not; all of it for a model not measured.
 */
export function faceStrength(model: EditModel, again = false): number {
  const faces = EDIT_MODELS.find((m) => m.id === model)?.faces
  return typeof faces === 'object' ? again ? faces.again : faces.strength : 1
}

/** What the face pass's instruction for one Subject is made from. */
export interface FaceTold {
  /** The Frame's expression sentence, '' when not known. */
  expression: string
  /** An edit's instruction, for the pass to keep what it changed. */
  change?: string
  /** The Frame's clothing sentence, '' or none when not known. */
  worn?: string
  /** The Subject is a thing (its sheet has no head). */
  thing?: boolean
}

/**
 * The face pass's instruction for one Subject (`name`): after an edit, the change it made named;
 * else its expression named, where it's known, and what the Frame's clothing sentence says is on
 * them, where it's known. A thing is told to take its sheet's shape and keep its state instead,
 * as a face's words painted a face into a lantern.
 */
export async function faceInstruction(
  name: string,
  { expression, change, worn, thing }: FaceTold,
): Promise<string> {
  const kept = change?.trim().replace(/([^.!?])$/, '$1.')
  if (thing) return loadPrompt(kept ? 'faces/thing-edited' : 'faces/thing', { name, change: kept })
  if (kept) return loadPrompt('faces/face-edited', { name, change: kept })
  const face = expression.trim()
    ? await loadPrompt('faces/face', { name, expression: expression.trim().replace(/\.$/, '') })
    : await loadPrompt('faces/face-unknown', { name })
  return worn?.trim()
    ? `${face} ${await loadPrompt('faces/worn', { name, worn: worn.trim() })}`
    : face
}
