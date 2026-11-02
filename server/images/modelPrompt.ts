import { limitsEnabled } from '../limits.ts'
import { loadPrompt } from '../promptFiles.ts'

/**
 * What an Image Model is told: the Image Prompt as it is, or, while the Limits are off, its own
 * prompt for that (`prompts/images/<limitsOffPrompt>.md`, filled with the Image Prompt), as Anima
 * Aesthetic's safety tags. The same on mflux and ComfyUI.
 */
export const modelPrompt = (limitsOffPrompt: string | undefined, prompt: string): Promise<string> =>
  limitsOffPrompt && !limitsEnabled()
    ? loadPrompt(`images/${limitsOffPrompt}`, { prompt })
    : Promise.resolve(prompt)
