/**
 * `settings.json` at version 3 (2026-11-25): reference sheets (ADR 0045), a
 * Feature of their own, with the edit model that repaints faces from them and the Image Model that
 * makes them. A full copy of version 2's types, so a later change to `shared/` leaves it as it was;
 * what each field means is in `shared/settings.ts`. The change from version 2 is marked "v3".
 */
import type { V2 } from './v2.ts'

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
  /** v3: added */
  | 'sheets'

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
  /** v3: added */
  faceEditModel: EditModel
  /** v3: added */
  sheetImageModel: string
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
  sessionsFolders: string[]
  /** The API keys, by Backend id, kept out of Settings (`SettingsStore`). */
  apiKeys?: Record<string, string>
}

export type V3 = SettingsFile

/**
 * Version 2 to 3: sheets switched on, as every Feature starts (each Session asks again as it
 * starts); Qwen-Image 2.1's edit repaints the faces, and each Session's Image Model makes the
 * sheets.
 */
export const v3 = (doc: V2): V3 => ({
  ...doc,
  features: { ...doc.features, sheets: true },
  faceEditModel: 'qwen-image-2.1-edit',
  sheetImageModel: '',
})
