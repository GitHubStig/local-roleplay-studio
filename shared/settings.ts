/**
 * Settings' small types. Shared by the server and the web app: types and plain values only.
 */

export type SeedMode = 'random' | 'fixed'

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const QUANTIZE_OPTIONS = [null, 4, 8] as const

export type Quantize = (typeof QUANTIZE_OPTIONS)[number]
