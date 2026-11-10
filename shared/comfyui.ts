/**
 * What a ComfyUI is checked for. Shared by the server and the web app: types and plain values
 * only.
 */

/** What Settings would send a ComfyUI: the models and whether voices or music, any left out. */
export interface ComfyUses {
  imageModel?: string
  upscaler?: string
  voices?: boolean
  videoModel?: string
  music?: boolean
}

/**
 * Whether ComfyUI answers at an address, and can run what Settings send it: for Settings. What's
 * missing is by what it's missing for, so each tab shows only its own.
 */
export type ComfyStatus =
  | {
    up: true
    version: string
    device: string
    missing: { [use in keyof ComfyUses]?: string }
  }
  | { up: false; error: string }
