/**
 * Lets one image render at a time across every Session. Two renders at once would compete for
 * GPU memory (FLUX.2 Klein alone peaks near 18 GB), so later Turns wait their turn, in order.
 */
export class RenderQueue {
  #busy = false
  #waiting: (() => void)[] = []

  /**
   * Resolves with a release function once it's this caller's turn to render. Calls `onWait`
   * first if another render is in progress. Rejects if `signal` aborts while waiting.
   */
  async acquire(signal: AbortSignal, onWait?: () => void): Promise<() => void> {
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
