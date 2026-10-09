/**
 * The picture forming: the latest preview of each Session's render in progress, a small JPEG
 * ComfyUI sends at every step (mflux sends none). Kept in memory only, never in the Session's
 * folder, and dropped when the render ends; the browser fetches it as the step count moves.
 */
export class Previews {
  #latest = new Map<string, Uint8Array<ArrayBuffer>>()

  set(sessionId: string, jpeg: Uint8Array<ArrayBuffer>) {
    this.#latest.set(sessionId, jpeg)
  }

  get(sessionId: string): Uint8Array<ArrayBuffer> | undefined {
    return this.#latest.get(sessionId)
  }

  clear(sessionId: string) {
    this.#latest.delete(sessionId)
  }
}
