/**
 * Finding and counting heads in a picture, for the face pass of reference sheets
 * (docs/reference-sheets-plans.md): asked of the Qwen3-VL that Qwen-Image 2.1 loads as its text
 * encoder, on mflux (`mflux.ts`) or a ComfyUI (`comfyui.ts`), the only finder of five benched that
 * found every head and says whose it is (2026-11-25). Each backend only answers a question about
 * a picture; the questions (`prompts/heads/`) and reading the answers are here, the same for both.
 */
import type { Backend } from '../../shared/backends.ts'
import type { Subject } from '../../shared/session.ts'
import { loadPrompt } from '../promptFiles.ts'

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

export interface HeadFinder {
  /** Where `who` is in the picture: their head, or a thing whole, by name and identity. */
  find(req: HeadRequest & { who: Subject }, signal: AbortSignal): Promise<Head[]>
  /**
   * Every head of a person or creature in the picture. Unused since 2026-11-26, when the face pass
   * took one view of a sheet, which can't paste the sheet's three heads in, so nothing is counted
   * after it any more. Kept for now, to revisit: stage 6's check of a sheet (three distinct angles)
   * may use it (docs/reference-sheets-plans.md).
   */
  count(req: HeadRequest, signal: AbortSignal): Promise<Head[]>
}

/** What a backend does: asks Qwen3-VL `question` about the picture and answers with its reply. */
export type AskPicture = (
  req: HeadRequest,
  question: string,
  signal: AbortSignal,
) => Promise<string>

/** A head finder over a backend's `ask`. */
export function headFinder(ask: AskPicture): HeadFinder {
  return {
    async find(req, signal) {
      const question = await loadPrompt('heads/find', { who: req.who.identity })
      return parseHeads(await ask(req, question, signal))
    },
    async count(req, signal) {
      return parseHeads(await ask(req, await loadPrompt('heads/count'), signal))
    },
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
  return async (req, question, signal) => {
    const backend = req.backend ?? await backends.backendOf()
    if (backend?.kind === 'comfyui') return backends.comfyui(backend.address)(req, question, signal)
    if (backend?.kind === 'here' && backends.mflux) return backends.mflux(req, question, signal)
    throw new Error(
      'No Backend can find heads: add one with Qwen-Image 2.1 in Settings, on the Machines tab',
    )
  }
}
