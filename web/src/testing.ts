import type { Availability, Feature, ImagePrompt, SettingsOptions } from './api'

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

/** Two mflux Image Models, as the Settings options list them. */
export const IMAGE_MODELS: SettingsOptions['imageModels'] = {
  mflux: [
    {
      id: 'qwen-image-2.1',
      label: 'Qwen-Image 2.1',
      defaultSteps: 25,
      stepCache: true,
      fastSteps: 6,
      quantize: true,
      float16: true,
    },
    {
      id: 'flux2-klein-4b',
      label: 'FLUX.2 Klein 4B',
      defaultSteps: 4,
      stepCache: false,
      quantize: true,
      float16: false,
    },
  ],
  comfyui: [],
}
