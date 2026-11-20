/**
 * `queue.json` at version 1 (2026-11-20): the shape it had before versions began, unchanged, now
 * numbered. A full copy of the types, so a later change to `shared/` leaves it as it was; what
 * each field means is in `shared/jobs.ts`. The next version copies this file whole and marks what
 * it changes (ADR 0041).
 */

type JobKind =
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

type Phase = 'text' | 'queued' | 'image' | 'audio' | 'download'

type ImageBackendKind = 'mflux' | 'comfyui'

type EditModel =
  | 'qwen-image-2.1-edit'
  | 'qwen-image-2.1-turbo-edit'
  | 'flux3-klein-edit'
  | 'fibo-2.0-dev-edit'
  | 'fibo-2.0-edit-turbo'

interface EditOrder {
  instruction: string
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
  export?: { folder: string }
  comfy?: ComfyTraces
  resume?: ComfyTraces
}

interface QueueFile {
  sessions: { sessionId: string; jobs: Job[] }[]
}

export type V1 = QueueFile

/** A file from before versions: already this shape, so only numbered. */
export const v1 = (doc: unknown): V1 => doc as V1
