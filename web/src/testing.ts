import type { ImagePrompt } from './api'

/** An Image Prompt for Frame `index` that differs from the others only in its pose. */
export const promptFor = (index: number): ImagePrompt =>
  `A woman, pose ${index}, calm, eye level, running gear, in a studio, softbox light, photo.`
