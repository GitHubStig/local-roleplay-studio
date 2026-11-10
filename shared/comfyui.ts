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
