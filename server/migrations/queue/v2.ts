/**
 * `queue.json` at version 2 (2026-11-26): an edit's order says whether the Edit dialog's Camera
 * list wrote it (`camera`), so its face pass is told the Frame's expression as a render's is, and
 * any other edit of the whole picture is told its own change (ADR 0045). A full copy of version
 * 1's types, so a later change to `shared/` leaves it as it was; what each field means is in
 * `shared/jobs.ts`. The changes from version 1 are marked "v2", with the optional fields reference
 * sheets added without a version (they fitted version 1), so this copy is `shared/` as it is.
 */
import type { V1 } from './v1.ts'

type JobKind =
  /** v2: listed (added with reference sheets, before versions changed for it) */
  | 'look'
  /** v2: listed (likewise) */
  | 'sheet'
  | 'picture'
  | 'render'
  | 'upscale'
  | 'voice'
  | 'speak'
  | 'speak-thought'
  | 'scene'
  | 'figure'
  | 'lito'
  | 'style'
  | 'edit'
  | 'clip'
  | 'direct'
  | 'score-roleplay'
  | 'music'
  | 'steer'
  | 'export'

/** v2: 'faces' listed (added with reference sheets) */
type Phase = 'text' | 'queued' | 'image' | 'audio' | 'download' | 'faces'

type ImageBackendKind = 'mflux' | 'comfyui'

type EditModel =
  | 'qwen-image-2.1-edit'
  | 'qwen-image-2.1-turbo-edit'
  | 'flux3-klein-edit'
  | 'fibo-2.0-dev-edit'
  | 'fibo-2.0-edit-turbo'

interface EditOrder {
  instruction: string
  /** v2: added */
  camera: boolean
  model?: EditModel
  backend?: ImageBackendKind
  mask?: string
  retry?: boolean
}

interface ClipOrder {
  kind: 'lead-in' | 'play-out' | 'idle-loop' | 'into-next'
  prompt: string
  seconds: number
  speech: boolean
  model?: string
}

interface ImageChoice {
  imageModel: string
  steps: number
  imageBackend?: ImageBackendKind
}

interface TextChoiceKept {
  textModel: string
  thinking: boolean
}

interface ComfyFile {
  filename: string
  subfolder: string
  type: string
}

interface ComfyTraces {
  prompts: { base: string; promptId: string }[]
  uploads: { base: string; file: ComfyFile }[]
}

/** v2: listed (added with reference sheets) */
interface FacesStep {
  subjects: string[]
  skipped?: string
  untouched?: boolean
  missed?: string[]
}

interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  status: 'queued' | 'running' | 'failed' | 'done'
  phase?: Phase
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
  startedAt?: string
  endedAt?: string
  machine: string
  image?: ImageChoice
  text?: TextChoiceKept
  imageBackend?: ImageBackendKind
  edit?: EditOrder
  clip?: ClipOrder
  /** v2: listed (added with reference sheets) */
  sheet?: { subject: string }
  /** v2: listed (added with reference sheets) */
  faces?: FacesStep
  export?: { folder: string }
  comfy?: ComfyTraces
  resume?: ComfyTraces
}

interface QueueFile {
  sessions: { sessionId: string; jobs: Job[] }[]
}

export type V2 = QueueFile

/**
 * Every edit queued before marks no camera move: the Camera list's wording is told as a render's
 * pass is only from now on, and a queued edit's face pass is then told its change, as any edit of
 * the whole picture is.
 */
export function v2(doc: V1): V2 {
  return {
    ...doc,
    sessions: doc.sessions.map((s) => ({
      ...s,
      jobs: s.jobs.map(({ edit, ...job }): Job =>
        edit ? { ...job, edit: { ...edit, camera: false } } : job
      ),
    })),
  }
}
