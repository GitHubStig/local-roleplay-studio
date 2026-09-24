export interface Health {
  ok: boolean
}

export type Quantize = null | 4 | 8
export type SeedMode = 'random' | 'fixed'

export interface Settings {
  textModel: string
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  seedMode: SeedMode
  seed: number
}

export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
}

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export interface SettingsOptions {
  textModels: string[]
  textModelsError?: string
  imageModels: ImageModelOption[]
  sizePresets: SizePreset[]
}

export class ApiError extends Error {
  readonly status: number
  readonly issues: string[]

  constructor(message: string, status: number, issues: string[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status, body.issues)
  }
  return res.json()
}

export const getHealth = () => request<Health>('/api/health')

export const getSettings = () => request<Settings>('/api/settings')

export const getSettingsOptions = () => request<SettingsOptions>('/api/settings/options')

export const saveSettings = (settings: Settings) =>
  request<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
