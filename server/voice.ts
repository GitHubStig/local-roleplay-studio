/**
 * Voices for Roleplay Characters, from the voice service (`voice/serve.py`): a voice designed once
 * from a description, then each line spoken by cloning it. The service is a Python process the
 * server starts the first time a voice is needed and keeps until it stops.
 */
import { track } from './children.ts'

export interface DesignRequest {
  /** The voice, in words: age, pitch, texture, manner. */
  description: string
  /** What the reference clip says. */
  text: string
  seed: number
  /** Where to write the WAV file. */
  out: string
}

/** How a line is delivered, beyond its words: a pace, and a sound just before it. */
export interface Delivery {
  pace: 'normal' | 'slow' | 'fast'
  sound: 'none' | 'sigh' | 'laughter' | 'cough'
}

export interface SpeakRequest extends Partial<Delivery> {
  text: string
  /** Hushed and breathy, still in the voice: how a Character's thought is spoken. */
  whisper?: boolean
  /** The voice to clone: a reference clip from `design`, and what it says. */
  ref: string
  refText: string
  seed: number
  out: string
}

/** Called with true when a model starts downloading (its first use), and false when it's done. */
export type OnDownload = (downloading: boolean) => void

export interface VoiceEngine {
  /** Speaks `text` in a new voice built from `description`. */
  design(req: DesignRequest, signal: AbortSignal, onDownload?: OnDownload): Promise<void>
  /** Speaks `text` in the voice of the reference clip. */
  speak(req: SpeakRequest, signal: AbortSignal, onDownload?: OnDownload): Promise<void>
}

export interface VoiceServiceOptions {
  port?: number
  /** How long the service may take to start; its first start installs its Python packages. */
  startLimitMs?: number
  /** The command that starts it, given the port; `uv run voice/serve.py` unless a test says. */
  command?: (port: number) => string[]
}

const SCRIPT = new URL('../voice/serve.py', import.meta.url)

/** The voice service, started on first use. */
export function voiceService(opts: VoiceServiceOptions = {}): VoiceEngine {
  const port = opts.port ?? 8791
  const base = `http://127.0.0.1:${port}`
  let starting: Promise<void> | null = null

  const healthy = () =>
    fetch(`${base}/health`).then((r) => (r.body?.cancel(), r.ok)).catch(() => false)

  async function start(): Promise<void> {
    if (await healthy()) return
    const [cmd, ...args] = opts.command?.(port) ??
      ['uv', 'run', '--quiet', SCRIPT.pathname, '--port', String(port)]
    const child = track(
      new Deno.Command(cmd, {
        args,
        stdout: 'null',
        stderr: 'piped',
      }).spawn(),
    )
    let stderr = ''
    ;(async () => {
      for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
        stderr = (stderr + chunk).slice(-4000)
      }
    })()
    const deadline = Date.now() + (opts.startLimitMs ?? 5 * 60_000)
    let exited = false
    child.status.then(() => (exited = true))
    while (Date.now() < deadline && !exited) {
      if (await healthy()) return
      await new Promise((r) => setTimeout(r, 500))
    }
    const why = stderr.trim().split('\n').at(-1) ?? 'no output'
    throw new Error(`The voice service didn't start (needs uv and its models; see README): ${why}`)
  }

  const ready = () =>
    starting ??= start().catch((err) => {
      starting = null
      throw err
    })
  const post = (path: string, body: object, signal: AbortSignal) =>
    fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body), signal })

  /** Asks the service every second, until `done`, whether it's downloading a model. */
  async function watchDownloads(done: Promise<unknown>, onDownload: OnDownload) {
    let finished = false
    done.finally(() => (finished = true)).catch(() => {})
    let downloading = false
    while (!finished) {
      await Promise.race([done.catch(() => {}), new Promise((r) => setTimeout(r, 1000))])
      if (finished) break
      const health = await fetch(`${base}/health`).then((r) => r.json()).catch(() => ({}))
      if (!!health.downloading !== downloading && !finished) {
        downloading = !downloading
        onDownload(downloading)
      }
    }
  }

  async function call(
    path: string,
    body: object,
    signal: AbortSignal,
    onDownload?: OnDownload,
  ): Promise<void> {
    await ready()
    const send = () => {
      const sent = post(path, body, signal)
      if (onDownload) watchDownloads(sent, onDownload)
      return sent
    }
    let res: Response
    try {
      res = await send()
    } catch (err) {
      if (signal.aborted) throw err
      // Gone since it started (it crashed, ran out of memory, or was stopped): start it again.
      starting = null
      await ready()
      res = await send()
    }
    const reply = await res.json().catch(() => ({}))
    if (!res.ok) {
      // A service that died since it started is started again next time.
      if (!(await healthy())) starting = null
      throw new Error(`Voice: ${reply.error ?? res.status}`)
    }
  }

  return {
    design: (req, signal, onDownload) => call('/design', req, signal, onDownload),
    speak: (req, signal, onDownload) => call('/speak', req, signal, onDownload),
  }
}

/** Stands in for the voice service in tests: writes a tiny WAV naming what it would say. */
export function fakeVoiceEngine(opts: { fail?: string } = {}): VoiceEngine & {
  calls: { kind: 'design' | 'speak'; req: DesignRequest | SpeakRequest }[]
} {
  const calls: { kind: 'design' | 'speak'; req: DesignRequest | SpeakRequest }[] = []
  const write = async (
    kind: 'design' | 'speak',
    req: DesignRequest | SpeakRequest,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted()
    calls.push({ kind, req })
    if (opts.fail) throw new Error(opts.fail)
    await Deno.writeTextFile(req.out, `RIFF fake ${kind}: ${req.text}`)
  }
  return {
    calls,
    design: (req, signal) => write('design', req, signal),
    speak: (req, signal) => write('speak', req, signal),
  }
}
