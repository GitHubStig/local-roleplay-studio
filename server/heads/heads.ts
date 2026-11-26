/**
 * Finding heads in a picture, for the face pass of reference sheets, and looking a sheet over
 * before it's used (docs/design/pictures.md): asked of the Qwen3-VL that Qwen-Image 2.1 loads as
 * its text encoder, on mflux (`mflux.ts`) or a ComfyUI (`comfyui.ts`), the only finder of five
 * benched that found every head and says whose it is (2026-11-25). Each backend only answers
 * questions about a picture; the questions (`prompts/heads/`) and reading the answers are here,
 * the same for both.
 */
import type { Backend } from '../../shared/backends.ts'
import type { Subject } from '../../shared/session.ts'
import { loadPrompt } from '../promptFiles.ts'
import { namedIdentity } from '../identity.ts'

/** Which way a head is turned, as seen in the picture. */
export const FACINGS = [
  'front',
  'three-quarter left',
  'profile left',
  'three-quarter right',
  'profile right',
] as const

export type Facing = (typeof FACINGS)[number]

/** A head found: who the model took it for, its box in thousandths of the picture, its turn. */
export interface Head {
  label: string
  /** Left, top, right, bottom, each from 0 to 1000. */
  box: [number, number, number, number]
  /** Said when asked (`find`); not always right (stage 0b: a profile left called right). */
  facing?: Facing
}

/** The picture asked about, and the Backend to ask on (else where the face pass's edits go). */
export interface HeadRequest {
  /** The picture's file inside `dir`. */
  image: string
  dir: string
  backend?: Backend
}

/** A reference sheet as Qwen3-VL saw it (`lookOver`), for `sheetFlaw` to judge. */
export interface SheetLook {
  /** Each time the Subject is shown, left to right, with its turn. */
  views: Head[]
  /** How many heads of a person or creature it has: none for a thing. */
  heads: number
  /** What's written on it, '' for nothing. */
  writing: string
  /** Anything else in it ("a lit oil lamp"), '' for nothing: noted, not judged. */
  others: string
}

export interface HeadFinder {
  /** Where `who` is in the picture: their head, or a thing whole, by name and identity. */
  find(req: HeadRequest & { who: Subject }, signal: AbortSignal): Promise<Head[]>
  /** Looks over `who`'s reference sheet: three questions at once (one load on mflux). */
  lookOver(req: HeadRequest & { who: Subject }, signal: AbortSignal): Promise<SheetLook>
}

/** What a backend does: asks Qwen3-VL each question about the picture, and answers each reply. */
export type AskPicture = (
  req: HeadRequest,
  questions: string[],
  signal: AbortSignal,
) => Promise<string[]>

/** A head finder over a backend's `ask`. */
export function headFinder(ask: AskPicture): HeadFinder {
  return {
    async find(req, signal) {
      const question = await loadPrompt('heads/find', { who: namedIdentity(req.who) })
      const [reply] = await ask(req, [question], signal)
      return parseHeads(reply)
    },
    async lookOver(req, signal) {
      const who = { who: namedIdentity(req.who), name: req.who.name }
      const [views, heads, sheet] = await ask(req, [
        await loadPrompt('heads/views', who),
        await loadPrompt('heads/count'),
        await loadPrompt('heads/sheet', who),
      ], signal)
      const said = parseObject(sheet)
      const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      return {
        views: parseHeads(views).sort((a, b) => a.box[0] - b.box[0]),
        heads: parseHeads(heads).length,
        writing: text(said.writing),
        others: text(said.others),
      }
    },
  }
}

/** A turn as the sheet's views are made: the face pass picks a view by it (`viewFor`). */
const turn = (facing?: Facing) =>
  facing === 'front'
    ? 'front'
    : facing?.startsWith('three-quarter')
    ? 'three-quarter'
    : facing?.startsWith('profile')
    ? 'profile'
    : 'unsaid'

/**
 * Why a reference sheet is unfit for the face pass, or undefined when it's fit (2026-11-26, 42
 * sheets by seven Image Models, docs/bench/reference-sheets/2026-11-26/check/): it must show its
 * Subject three times, one to each third, as it's cut into thirds; a person's or creature's
 * from the front, at a three-quarter turn and in profile, in that order, as the face pass picks the
 * view nearest a head's turn by its place (a thing's turns Qwen3-VL doesn't read, so only its
 * three are checked); and no writing, which the bench's FIBO 2.0 Turbo sheets had (a name). The
 * backdrop isn't checked: every one of the 42 was read as dark and plain. Nor what else is in it
 * (an oil lamp from the style): whether that harms the face pass is untried.
 */
export function sheetFlaw(look: SheetLook, name: string): string | undefined {
  const flaws: string[] = []
  const n = look.views.length
  if (n !== 3) {
    flaws.push(
      n
        ? `It shows ${name} ${n === 1 ? 'once' : `${n} times`}, not three times.`
        : `${name.charAt(0).toUpperCase()}${name.slice(1)} isn't found in it.`,
    )
  }
  if (n === 3 && look.heads > 0) {
    const turns = look.views.map((v) => turn(v.facing))
    if (turns.join() !== 'front,three-quarter,profile') {
      flaws.push(
        `Its views aren't the front, a three-quarter turn and the profile, in that order (it read ${
          turns.join(', ')
        }).`,
      )
    }
  }
  if (look.writing) flaws.push(`It has writing on it: “${look.writing}”.`)
  return flaws.length ? flaws.join(' ') : undefined
}

/** The first JSON object in a reply (fenced or not), or {} when there's none. */
function parseObject(reply: string): Record<string, unknown> {
  const match = reply.match(/\{[\s\S]*\}/)
  try {
    const value = match && JSON.parse(match[0])
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/**
 * The heads in a reply: each complete object with a box, read one by one, so a reply cut off at
 * its token cap still gives those before the cut (the bench's collage of 16 heads stopped at 5).
 * Its JSON may come fenced (```json). Boxes are kept within 0–1000, left to right and top to
 * bottom; one with no area is left out.
 */
export function parseHeads(reply: string): Head[] {
  const heads: Head[] = []
  for (const match of reply.matchAll(/\{[^{}]*\}/g)) {
    let value: { label?: unknown; bbox_2d?: unknown; facing?: unknown }
    try {
      value = JSON.parse(match[0])
    } catch {
      continue
    }
    const raw = value.bbox_2d
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === 'number')) {
      continue
    }
    const [x1, y1, x2, y2] = raw.map((n: number) => Math.min(1000, Math.max(0, Math.round(n))))
    const box: Head['box'] = [
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.max(x1, x2),
      Math.max(y1, y2),
    ]
    if (box[2] === box[0] || box[3] === box[1]) continue
    const facing = FACINGS.find((f) => f === value.facing)
    heads.push({
      label: typeof value.label === 'string' ? value.label : '',
      box,
      ...(facing && { facing }),
    })
  }
  return heads
}

/**
 * Asks each question on the Backend given, or the one the face pass's edits go to now: mflux
 * here, or a ComfyUI at its address (as `imageBackends` sends edits).
 */
export function headBackends(backends: {
  mflux?: AskPicture
  comfyui: (address: string) => AskPicture
  /** The Backend the face pass's edits go to now; none when no Backend can run them. */
  backendOf: () => Promise<Backend | undefined>
}): AskPicture {
  return async (req, questions, signal) => {
    const backend = req.backend ?? await backends.backendOf()
    if (backend?.kind === 'comfyui') {
      return backends.comfyui(backend.address)(req, questions, signal)
    }
    if (backend?.kind === 'here' && backends.mflux) return backends.mflux(req, questions, signal)
    throw new Error(
      'No Backend can find heads: add one with Qwen-Image 2.1 in Settings, on the Machines tab',
    )
  }
}
