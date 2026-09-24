import type { ImagePrompt } from './api'

/** An Image Prompt for Turn `index` that differs from the others only in its pose. */
export const promptFor = (index: number): ImagePrompt => ({
  subject: 'a woman',
  pose: `pose ${index}`,
  expression: 'calm',
  camera: 'eye level',
  clothing: 'running gear',
  environment: 'a studio',
  lighting: 'softbox',
  color: 'neutral',
  style: 'photo',
})
