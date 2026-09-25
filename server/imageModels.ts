/** An mflux Image Model the player can choose, and how to invoke it. */
export interface ImageModel {
  id: string
  label: string
  /** The `mflux-generate-*` executable. */
  command: string
  /** Value passed to `--model`: a built-in name or a Hugging Face repo. */
  model: string
  /** Value passed to `--base-model` when `model` is a repo mflux can't classify by name. */
  baseModel?: string
  /** Weights already quantized, so `--quantize` must not be passed. */
  preQuantized?: boolean
  /** Steps to use when the model is picked: mflux's own default, unless fewer look as good. */
  defaultSteps: number
}

export const IMAGE_MODELS: readonly ImageModel[] = [
  {
    id: 'flux2-klein-4b',
    label: 'FLUX.2 Klein 4B',
    command: 'mflux-generate-flux2',
    model: 'flux2-klein-4b',
    defaultSteps: 4,
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo (4-bit)',
    command: 'mflux-generate-z-image-turbo',
    model: 'filipstrand/Z-Image-Turbo-mflux-4bit',
    baseModel: 'z-image-turbo',
    preQuantized: true,
    defaultSteps: 9,
  },
  {
    id: 'krea-2',
    label: 'Krea 2',
    command: 'mflux-generate-krea2',
    model: 'krea-2',
    defaultSteps: 8,
  },
  {
    id: 'ernie-image-turbo',
    label: 'ERNIE-Image Turbo',
    command: 'mflux-generate-ernie-image-turbo',
    model: 'ernie-image-turbo',
    defaultSteps: 8,
  },
  {
    id: 'boogu-image-turbo',
    label: 'Boogu Image Turbo',
    command: 'mflux-generate-boogu',
    model: 'boogu-image-turbo',
    defaultSteps: 4,
  },
  {
    id: 'qwen-image-2.1',
    label: 'Qwen-Image 2.1',
    command: 'mflux-generate-qwen-2.1',
    model: 'qwen-image-2.1',
    // mflux defaults to 40; 25 looks just as good at 512 px and is much faster.
    defaultSteps: 25,
  },
]

export function findImageModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id)
}
