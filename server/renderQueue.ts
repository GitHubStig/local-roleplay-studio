export interface RenderQueueOptions {
  /**
   * Frees memory for a heavy job once it's that job's go: unloads the Text Model, which Ollama
   * would otherwise keep loaded for 5 minutes and push a big render into swap. A failure is logged,
   * and the job runs anyway.
   */
  freeMemory?: () => Promise<void>
}

/**
 * Lets one image render at a time across every Session. Two renders at once would compete for
 * GPU memory (FLUX.2 Klein alone peaks near 18 GB), so later Frames wait their frame, in order.
 */
export class RenderQueue {
  #busy = false
  #waiting: (() => void)[] = []
  #freeMemory?: () => Promise<void>

  constructor(opts: RenderQueueOptions = {}) {
    this.#freeMemory = opts.freeMemory
  }

  /**
   * Resolves with a release function once it's this caller's go to render, after freeing memory
   * for it unless it's `light` (a spoken line, small and frequent). Calls `onWait` first if another
   * render is in progress. Rejects if `signal` aborts while waiting.
   */
  async acquire(
    signal: AbortSignal,
    onWait?: () => void,
    { light = false }: { light?: boolean } = {},
  ): Promise<() => void> {
    signal.throwIfAborted()
    if (this.#busy) {
      onWait?.()
      await new Promise<void>((resolve, reject) => {
        const go = () => {
          signal.removeEventListener('abort', leave)
          resolve()
        }
        const leave = () => {
          this.#waiting = this.#waiting.filter((w) => w !== go)
          reject(signal.reason)
        }
        this.#waiting.push(go)
        signal.addEventListener('abort', leave, { once: true })
      })
    }
    this.#busy = true
    if (!light && this.#freeMemory) {
      await this.#freeMemory().catch((err) => console.warn('Could not free memory:', err.message))
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.#waiting.shift()
      if (next) next()
      else this.#busy = false
    }
  }
}
