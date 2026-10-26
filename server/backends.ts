/**
 * The Backends Settings list (ADR 0022): each one program that runs models, at an address. This
 * machine's own programs (mflux, the voice service, SHARP, TripoSplat, LiTo, the style scores) are
 * one, `here`; the others are a ComfyUI, an Ollama, or a server with the OpenAI chat API, on this
 * machine or another. Each kind of work goes to the Backend Settings prefer for it, or the next in
 * the list that can do it (`pickBackend`).
 */
import { comfyBase } from './comfyui/client.ts'
import type { ImageBackendKind } from './images/imageModels.ts'
import { OLLAMA_URL } from './text/ollama/ollama.ts'

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

/** This machine's own programs, always in the list. */
export const HERE: Backend = { id: 'here', kind: 'here', address: '' }

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

/** Which Image backend a Backend renders on: mflux here, or its ComfyUI. */
export const imageKindOf = (backend: Backend): ImageBackendKind | undefined =>
  backend.kind === 'here' ? 'mflux' : backend.kind === 'comfyui' ? 'comfyui' : undefined

/** Where a Backend answers; undefined for this machine's own programs. */
export function backendAddress(backend: Backend): string | undefined {
  switch (backend.kind) {
    case 'here':
      return undefined
    case 'comfyui':
      return comfyBase(backend.address)
    case 'ollama':
      return backend.address || OLLAMA_URL
    case 'openai':
      return backend.address
  }
}

/** The Backends in the order a job tries them: the preferred one, then the rest as listed. */
export const inTurn = (backends: readonly Backend[], preferred: string): Backend[] => [
  ...backends.filter((b) => b.id === preferred),
  ...backends.filter((b) => b.id !== preferred),
]

/** Where a job goes: the first Backend, `preferred` first, that `can` do it; none if none can. */
export const pickBackend = (
  backends: readonly Backend[],
  preferred: string,
  can: (backend: Backend) => boolean,
): Backend | undefined => inTurn(backends, preferred).find(can)
