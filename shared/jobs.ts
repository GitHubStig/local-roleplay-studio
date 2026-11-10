/** A job in the queue, as it's kept and as the browser is sent it, with what it left on a ComfyUI and the models it kept. Shared by the server and the web app: types and plain values only. */
import type { ClipOrder } from './clips.ts'
import type { ComfyTraces } from './comfyui.ts'
import type { EditModel, ImageBackendKind } from './images.ts'
import type { JobKind } from './jobKinds.ts'
import type { Phase } from './session.ts'
import type { SessionSettings } from './settings.ts'

/**
 * What an `edit` is told: what to paint, which model to use, and the area painted over the picture
 * to repaint (a mask file in the Session's folder, saved when the edit is queued; white repainted),
 * or none for the whole picture. A retry makes the newest edit again, as told now, with a new seed,
 * in its place.
 */
export interface EditOrder {
  instruction: string
  model?: EditModel
  /** The kind of backend it would rather run on, picked in the Edit dialog; else Settings'. */
  backend?: ImageBackendKind
  mask?: string
  retry?: boolean
}

/** The Session settings that say which Text Model writes, and whether it thinks. */
export type TextChoiceKept = Pick<SessionSettings, 'textModel' | 'thinking'>

/** The Session settings that say which Image Model renders, and where it would rather. */
export type ImageChoice = Pick<SessionSettings, 'imageModel' | 'steps' | 'imageBackend'>

export interface Job {
  id: string
  kind: JobKind
  frameIndex: number
  /** Failed and done jobs stay listed, a failed one with its error, until dismissed. */
  status: 'queued' | 'running' | 'failed' | 'done'
  /**
   * While running: writing (text), waiting for another render (queued), rendering (image),
   * speaking (audio), or downloading a model the first time it's used (download).
   */
  phase?: Phase
  progress?: { step: number; total: number }
  error?: string
  createdAt: string
  /** When it last started, and ended (done or failed), for how long it waited and took. */
  startedAt?: string
  endedAt?: string
  /** The machine it runs on (`machineKey`): jobs on different machines run side by side. */
  machine: string
  /**
   * A render's Image Model, as its Session had it when queued: the render uses it whatever the
   * Session switches to meanwhile, so it runs where it was queued to (`machine`). A clip's, the
   * Image Model of the picture it's made from, as the Frame showed it when queued.
   */
  image?: ImageChoice
  /**
   * A job that asks the Text Model (`TEXT_JOBS`): its Text Model and Thinking, as its Session had
   * them when queued, so it runs by them where it was queued to (`machine`), whatever the Session
   * switches to meanwhile (ADR 0037).
   */
  text?: TextChoiceKept
  /**
   * The kind of backend its render runs on, once it starts: for the page, "by Krea 2 · mflux", and
   * whether there's a picture forming to show (ComfyUI's previews).
   */
  imageBackend?: ImageBackendKind
  /** An edit's order. Its painted area is left out of the list the page is sent (`list`). */
  edit?: EditOrder
  /** A clip's order. */
  clip?: ClipOrder
  /**
   * While it runs: what it has left on a ComfyUI, which it cleans up itself as it ends, and a
   * restart cleans up after it if it can't (`restore`).
   */
  comfy?: ComfyTraces
  /**
   * What a job of a kind that can be picked up (`RESUMED`) left on a ComfyUI when a server restart
   * cut it off: run again, it picks up the result there, or cleans up and starts anew.
   */
  resume?: ComfyTraces
}
