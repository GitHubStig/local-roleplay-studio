import type { HeavyJob } from './machine.ts'

export interface RenderQueueOptions {
  /**
   * Frees memory for a heavy job once it's that job's go: unloads the Text Model, which Ollama
   * would otherwise keep loaded for 5 minutes and push a big render into swap, if the job runs on
   * its machine (`job`, undefined for one that runs here: machine.ts). A failure is logged, and
   * the job runs anyway.
   */
  freeMemory?: (job: HeavyJob | undefined) => Promise<void>
  /**
   * Which machine `job` runs on (`machineKey`), undefined for one that runs here. Left out, every
   * job runs here.
   */
  machineOf?: (job: HeavyJob | undefined) => Promise<string>
}

/** One machine's turn-taking: whether a job has it, and who waits. */
interface Turns {
  busy: boolean
  waiting: (() => void)[]
}

/**
 * Lets one image render at a time on each machine, across every Session. Two renders at once would
 * compete for GPU memory (FLUX.2 Klein alone peaks near 18 GB), so later Frames wait their turn, in
 * order; a render on a ComfyUI across the network doesn't hold up one here.
 */
export class RenderQueue {
  #machines = new Map<string, Turns>()
  #freeMemory?: (job: HeavyJob | undefined) => Promise<void>
  #machineOf?: (job: HeavyJob | undefined) => Promise<string>

  constructor(opts: RenderQueueOptions = {}) {
    this.#freeMemory = opts.freeMemory
    this.#machineOf = opts.machineOf
  }

  /**
   * Resolves with a release function once it's this caller's go to render, after freeing memory
   * for it unless it's `light` (a spoken line, small and frequent). `job` says where it runs, if
   * it may be another machine. Calls `onWait` first if another render is in progress. Rejects if
   * `signal` aborts while waiting.
   */
  async acquire(
    signal: AbortSignal,
    onWait?: () => void,
    { light = false, job }: { light?: boolean; job?: HeavyJob } = {},
  ): Promise<() => void> {
    signal.throwIfAborted()
    // Only awaited when asked, so callers on one machine queue in the order they came.
    const machine = this.#machineOf ? await this.#machineOf(job) : 'here'
    signal.throwIfAborted()
    const turns = this.#machines.get(machine) ?? { busy: false, waiting: [] }
    this.#machines.set(machine, turns)
    if (turns.busy) {
      onWait?.()
      await new Promise<void>((resolve, reject) => {
        const go = () => {
          signal.removeEventListener('abort', leave)
          resolve()
        }
        const leave = () => {
          turns.waiting = turns.waiting.filter((w) => w !== go)
          reject(signal.reason)
        }
        turns.waiting.push(go)
        signal.addEventListener('abort', leave, { once: true })
      })
    }
    turns.busy = true
    if (!light && this.#freeMemory) {
      await this.#freeMemory(job).catch((err) =>
        console.warn('Could not free memory:', err.message)
      )
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const next = turns.waiting.shift()
      if (next) next()
      else turns.busy = false
    }
  }
}
