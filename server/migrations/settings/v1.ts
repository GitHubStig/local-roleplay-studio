/**
 * `settings.json` at version 1 (2026-11-20): the shape it had before versions began, unchanged,
 * now numbered. A full copy of the types, so a later change to `shared/` leaves it as it was; what
 * each field means is in `shared/settings.ts`. The next version copies this file whole and marks
 * what it changes (ADR 0041).
 */

type BackendKind = 'here' | 'comfyui' | 'ollama' | 'openai'

interface Backend {
  id: string
  kind: BackendKind
  address: string
}

type Work = 'text' | 'images' | 'upscale' | 'edits' | 'voices'

type Feature =
  | 'images'
  | 'upscale'
  | 'edits'
  | 'voices'
  | 'scenes'
  | 'figures'
  | 'lito'
  | 'style'
  | 'video'

type Quantize = null | 4 | 8

type Upscaler = 'seedvr2-7b' | 'seedvr2-3b'

type EditModel =
  | 'qwen-image-2.1-edit'
  | 'qwen-image-2.1-turbo-edit'
  | 'flux3-klein-edit'
  | 'fibo-2.0-dev-edit'
  | 'fibo-2.0-edit-turbo'

type ClipSize = 'small' | 'large'

interface SettingsFile {
  backends: Backend[]
  runOn: Record<Work, string>
  textModel: string
  thinking: boolean
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  stepCache: null | 0.25 | 0.4 | 0.5
  float16: 'auto' | 'on' | 'off'
  previews: boolean
  seedMode: 'random' | 'fixed'
  seed: number
  upscaler: Upscaler
  editModel: EditModel
  editQuantize: Quantize
  videoModel: string
  videoSizes?: Record<string, ClipSize>
  videoOn?: string
  musicOn?: string
  features: Record<Feature, boolean>
  limits: boolean
  callLog: boolean
  music: boolean
  musicBehaviour: 'steady' | 'story' | 'cinematic'
  musicTaste: string
  sessionsFolder: string
  /** The API keys, by Backend id, kept out of Settings (`SettingsStore`). */
  apiKeys?: Record<string, string>
}

export type V1 = SettingsFile

/** A file from before versions: already this shape, so only numbered. */
export const v1 = (doc: unknown): V1 => doc as V1
