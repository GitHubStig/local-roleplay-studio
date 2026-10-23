/**
 * The edit models (ADR 0021): each repaints a picture as told, in an area painted over it, whatever
 * model rendered the picture. mflux runs them; ComfyUI doesn't yet.
 */
export const EDIT_MODELS = [
  { id: 'qwen-image-2.1-edit', label: 'Qwen-Image 2.1 Edit' },
] as const
export type EditModel = (typeof EDIT_MODELS)[number]['id']
