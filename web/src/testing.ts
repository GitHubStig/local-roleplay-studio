import type { Availability, Feature, ImagePrompt } from './api'

/** An Image Prompt for Frame `index` that differs from the others only in its pose. */
export const promptFor = (index: number): ImagePrompt =>
  `A man, pose ${index}, calm, eye level, a wool coat, in a tavern, lamplight, oil painting.`

/** Every Feature switched on in Settings, as by default. */
export const ALL_ON: Record<Feature, boolean> = {
  images: true,
  upscale: true,
  voices: true,
  scenes: true,
  figures: true,
  lito: true,
}

/** Every Feature available on this "machine", as on an Apple Silicon Mac with everything set up. */
export const ALL_AVAILABLE: Record<Feature, Availability> = {
  images: { available: true },
  upscale: { available: true },
  voices: { available: true },
  scenes: { available: true },
  figures: { available: true },
  lito: { available: true },
}
