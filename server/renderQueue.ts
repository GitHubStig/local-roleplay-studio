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

/**
 * Who goes first among those waiting on a machine: the Text Model's calls, then heavy jobs, then
 * clips (which are made from pictures, and take minutes), each in the order they came.
 */
const LANES = ['text', 'heavy', 'clip'] as const
type Lane = (typeof LANES)[number]

/** A Text Model call, as the queue page shows it: for which Session, what for, since when. */
export interface TextCall {
  session?: string
  /** What it's for, as the call log names it (`reply`, `cast`…). */
  job: string
  /** When it asked for its turn. */
  since: string
}

/** A Text Model call on a machine, running or waiting its turn (`textCalls`). */
export interface MachineTextCall extends TextCall {
  machine: string
  status: 'running' | 'waiting'
}

interface Waiter {
  lane: Lane
  go: () => void
  /** A text call's. */
  call?: TextCall
}

/** One machine's turn-taking: a heavy job that has it, the text calls running, and who waits. */
interface Turns {
  busy: boolean
  texts: Set<TextCall>
  waiting: Waiter[]
}

/**
 * Lets one heavy job (an image render, an upscale, a voice, 3D, a clip) run at a time on each
 * machine, across every Session. Two renders at once would compete for GPU memory (FLUX.2 Klein
 * alone peaks near 18 GB), so later ones wait their turn; a render on a ComfyUI across the network
 * doesn't hold up one here. The Text Model's calls take turns with them too, on its machine: a
 * Reply asked for mid-render loaded the Text Model beside the image model and pushed the render
 * into swap (seen in play, 2026-11-02). So text calls wait for the heavy job running, then go
 * ahead of those waiting, all at once, and the next heavy job starts once the last has ended (and
 * unloads the Text Model).
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
   * it may be another machine. Calls `onWait` first if it has to wait. Rejects if `signal` aborts
   * while waiting.
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
    const turns = this.#turns(machine)
    if (turns.busy || turns.texts.size || turns.waiting.length) {
      onWait?.()
      await this.#wait(turns, job?.kind === 'video' || job?.kind === 'music' ? 'clip' : 'heavy', signal)
    } else turns.busy = true
    if (!light && this.#freeMemory) {
      await this.#freeMemory(job).catch((err) =>
        console.warn('Could not free memory:', err.message)
      )
    }
    return this.#once(() => {
      turns.busy = false
      this.#handOn(turns)
    })
  }

  /**
   * Resolves with a release function once a Text Model call may run on `machine`: at once unless
   * a heavy job runs there, else once it ends, ahead of the heavy jobs waiting. Text calls run side
   * by side. `about` says which Session's call it is, and what for, for the queue page. Calls
   * `onWait` first if it has to wait; rejects if `signal` aborts while waiting.
   */
  async textTurn(
    machine: string,
    signal: AbortSignal,
    about: Omit<TextCall, 'since'> = { job: 'text' },
    onWait?: () => void,
  ): Promise<() => void> {
    signal.throwIfAborted()
    const call: TextCall = { ...about, since: new Date().toISOString() }
    const turns = this.#turns(machine)
    if (turns.busy) {
      onWait?.()
      await this.#wait(turns, 'text', signal, call)
    } else turns.texts.add(call)
    return this.#once(() => {
      turns.texts.delete(call)
      if (!turns.texts.size) this.#handOn(turns)
    })
  }

  /** Every Text Model call running or waiting its turn, by machine, in the order they go. */
  textCalls(): MachineTextCall[] {
    return [...this.#machines].flatMap(([machine, turns]) => [
      ...[...turns.texts].map((call) => ({ ...call, machine, status: 'running' as const })),
      ...turns.waiting.flatMap((w) =>
        w.call ? [{ ...w.call, machine, status: 'waiting' as const }] : []
      ),
    ])
  }

  #turns(machine: string): Turns {
    const turns = this.#machines.get(machine) ?? { busy: false, texts: new Set(), waiting: [] }
    this.#machines.set(machine, turns)
    return turns
  }

  /** Waits in `lane`, behind those waiting in it and the lanes before it. */
  #wait(turns: Turns, lane: Lane, signal: AbortSignal, call?: TextCall): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        lane,
        ...(call && { call }),
        go: () => {
          signal.removeEventListener('abort', leave)
          resolve()
        },
      }
      const leave = () => {
        turns.waiting = turns.waiting.filter((w) => w !== waiter)
        reject(signal.reason)
      }
      const behind = turns.waiting.findIndex((w) => LANES.indexOf(w.lane) > LANES.indexOf(lane))
      turns.waiting.splice(behind < 0 ? turns.waiting.length : behind, 0, waiter)
      signal.addEventListener('abort', leave, { once: true })
    })
  }

  /** The machine is free: every text call waiting goes, else the next heavy job. */
  #handOn(turns: Turns) {
    const texts = turns.waiting.filter((w) => w.lane === 'text')
    if (texts.length) {
      turns.waiting = turns.waiting.filter((w) => w.lane !== 'text')
      for (const w of texts) {
        turns.texts.add(w.call!)
        w.go()
      }
      return
    }
    const next = turns.waiting.shift()
    if (!next) return
    turns.busy = true
    next.go()
  }

  /** `release`, harmless to call twice. */
  #once(release: () => void): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      release()
    }
  }
}
