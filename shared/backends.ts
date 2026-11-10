/**
 * The Backends Settings list (ADR 0022), as the server and the web app both know them. Shared by
 * the server and the web app: types and plain values only.
 */

export const BACKEND_KINDS = ['here', 'comfyui', 'ollama', 'openai'] as const

export type BackendKind = (typeof BACKEND_KINDS)[number]

export const BACKEND_NAMES: Record<BackendKind, string> = {
  here: 'This machine',
  comfyui: 'ComfyUI',
  ollama: 'Ollama',
  openai: 'OpenAI-compatible server',
}

export interface Backend {
  /** Fixed once it's added, so what names it still does when its address changes. */
  id: string
  kind: BackendKind
  /** Where it answers; '' for its kind's usual address on this machine, and for `here`. */
  address: string
}

/** The kinds of work, each sent to a Backend of its own (`Settings.runOn`). */
export const WORKS = ['text', 'images', 'upscale', 'edits', 'voices'] as const

export type Work = (typeof WORKS)[number]

/** The work each kind of Backend can do; `here` only what this machine can run (`features.ts`). */
export const BACKEND_WORK: Record<BackendKind, readonly Work[]> = {
  here: ['images', 'upscale', 'edits', 'voices'],
  comfyui: ['images', 'upscale', 'edits', 'voices'],
  ollama: ['text'],
  openai: ['text'],
}
