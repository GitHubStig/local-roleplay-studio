/**
 * The SeedVR2 upscalers, whichever backend runs them: mflux takes the id as the model's name, and
 * ComfyUI has its own files for each (`comfyui/models.ts`).
 */
export const UPSCALERS = [
  { id: 'seedvr2-7b', label: 'SeedVR2 7B (sharper)' },
  { id: 'seedvr2-3b', label: 'SeedVR2 3B (a little faster)' },
] as const
export type Upscaler = (typeof UPSCALERS)[number]['id']
