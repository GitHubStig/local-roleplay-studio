/**
 * `settings.json` at version 2 (2026-11-24): the Session folders used are remembered, for the
 * Session manager to list. A full copy of version 1's types, so a later change to `shared/` leaves
 * it as it was; what each field means is in `shared/settings.ts`. The change from version 1 is
 * marked "v2".
 */
import type { V1 } from './v1.ts'

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
  /** v2: added */
  sessionsFolders: string[]
  /** The API keys, by Backend id, kept out of Settings (`SettingsStore`). */
  apiKeys?: Record<string, string>
}

export type V2 = SettingsFile

/** Version 1 to 2: the Session folder in use is the one remembered, unless it's the app's own. */
export const v2 = (doc: V1): V2 => ({
  ...doc,
  sessionsFolders: doc.sessionsFolder.trim() ? [doc.sessionsFolder.trim()] : [],
})
