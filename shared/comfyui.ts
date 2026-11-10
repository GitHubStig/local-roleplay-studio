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

/** A file ComfyUI wrote (an output node's `ui`), as `/view` serves it. */
export interface ComfyFile {
  filename: string
  subfolder: string
  type: string
}

/**
 * What a piece of work has left on a ComfyUI that it would clean up itself as it ends: the prompts
 * it queued (in its history, and their outputs) and the files it uploaded. Kept with a job while it
 * runs (`Job.comfy`), so a job cut off by a server restart can be cleaned up after
 * (`clearTraces`, `files.ts`).
 */
export interface ComfyTraces {
  prompts: { base: string; promptId: string }[]
  uploads: { base: string; file: ComfyFile }[]
}
