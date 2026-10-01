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

export interface SpeakRequest {
  text: string
  /** The voice to clone: a reference clip from `design`, and what it says. */
  ref: string
  refText: string
  seed: number
  out: string
}

export interface VoiceEngine {
  /** Speaks `text` in a new voice built from `description`. */
  design(req: DesignRequest, signal: AbortSignal): Promise<void>
  /** Speaks `text` in the voice of the reference clip. */
  speak(req: SpeakRequest, signal: AbortSignal): Promise<void>
}

export interface VoiceServiceOptions {
  port?: number
  /** Block Hugging Face downloads, as for mflux: fetch the models once with `--download`. */
  offline?: boolean
  /** How long the service may take to start; its first start installs its Python packages. */
  startLimitMs?: number
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
    const child = track(
      new Deno.Command('uv', {
        args: ['run', '--quiet', SCRIPT.pathname, '--port', String(port)],
        env: opts.offline ?? true ? { HF_HUB_OFFLINE: '1' } : {},
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

  async function call(path: string, body: object, signal: AbortSignal): Promise<void> {
    starting ??= start().catch((err) => {
      starting = null
      throw err
    })
    await starting
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    })
    const reply = await res.json().catch(() => ({}))
    if (!res.ok) {
      // A service that died since it started is started again next time.
      if (!(await healthy())) starting = null
      throw new Error(`Voice: ${reply.error ?? res.status}`)
    }
  }

  return {
    design: (req, signal) => call('/design', req, signal),
    speak: (req, signal) => call('/speak', req, signal),
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
