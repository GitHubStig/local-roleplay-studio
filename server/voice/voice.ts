/**
 * Voices for Roleplay Characters, from the voice service (`python/voice/serve.py`): a voice designed once
 * from a description, then each line spoken by cloning it. The service is a Python process the
 * server starts the first time a voice is needed and keeps until it stops.
 */
import { pythonScript, SHIPPED_PYTHON } from '../pythonTools.ts'
import type { Backend } from '../../shared/backends.ts'
import { track } from '../children.ts'
import type { Delivery } from '../../shared/voice.ts'
import { higgsText, maxFrames, secondsOf } from './higgs.ts'

export interface DesignRequest {
  /** The voice, in words: age, pitch, texture, manner. */
  description: string
  /** What the reference clip says. */
  text: string
  seed: number
  /** Where to write the WAV file. */
  out: string
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
  /** The most frames Higgs may take for it (`maxFrames` in `higgs.ts`): one that takes them ran on. */
  maxFrames: number
}

/** How a line came out. */
export interface Spoken {
  /** It took every frame it was allowed: Higgs looped, in buzz or silence, rather than end it. */
  ranOn: boolean
}

/** Called with true when a model starts downloading (its first use), and false when it's done. */
export type OnDownload = (downloading: boolean) => void

/** How an engine's audio is kept, and what it needs. */
export interface VoiceProfile {
  /** The reference clip's file type: lossless, as every line is cloned from it. */
  ref: 'wav' | 'flac'
  /** A spoken line's. */
  speech: 'mp3' | 'flac'
  /** It needs the Text Model out of memory first, as a render does (a 12 GB card). */
  heavy: boolean
}

export interface VoiceEngine {
  /** The engine Settings choose now: its file types, and whether it's heavy. */
  profile(): Promise<VoiceProfile>
  /** Speaks `text` in a new voice built from `description`. */
  design(req: DesignRequest, signal: AbortSignal, onDownload?: OnDownload): Promise<void>
  /** Speaks `text` in the voice of the reference clip. */
  speak(req: SpeakRequest, signal: AbortSignal, onDownload?: OnDownload): Promise<Spoken>
}

export interface VoiceServiceOptions {
  /** The only folder it reads voices from and writes them to: the Sessions'. */
  root: string
  port?: number
  /** How long the service may take to start; its first start installs its Python packages. */
  startLimitMs?: number
  /** How often it asks the service, while a call runs, whether it's downloading a model. */
  checkEveryMs?: number
  /** The command that starts it, given the port; `uv run python/voice/serve.py` unless a test says. */
  command?: (port: number) => string[]
  /** The folder the Python tools run from (`pythonTools.ts`); the shipped one unless given. */
  python?: string
}

/** The voice service, started on first use. */
export function voiceService(
  opts: VoiceServiceOptions,
): VoiceEngine & { moveTo(root: string): Promise<void> } {
  let root = opts.root
  let child: Deno.ChildProcess | undefined
  const port = opts.port ?? 8791
  const checkEveryMs = opts.checkEveryMs ?? 1000
  const base = `http://127.0.0.1:${port}`
  let starting: Promise<void> | null = null

  const healthy = () =>
    fetch(`${base}/health`).then((r) => (r.body?.cancel(), r.ok)).catch(() => false)

  async function start(): Promise<void> {
    if (await healthy()) return
    const [cmd, ...args] = opts.command?.(port) ??
      [
        'uv',
        'run',
        '--quiet',
        pythonScript(opts.python ?? SHIPPED_PYTHON, 'voice', 'serve.py'),
        '--port',
        String(port),
        '--root',
        root,
      ]
    const started = child = track(
      new Deno.Command(cmd, {
        args,
        stdout: 'null',
        stderr: 'piped',
      }).spawn(),
    )
    let stderr = ''
    ;(async () => {
      for await (const chunk of started.stderr.pipeThrough(new TextDecoderStream())) {
        stderr = (stderr + chunk).slice(-4000)
      }
    })()
    const deadline = Date.now() + (opts.startLimitMs ?? 5 * 60_000)
    let exited = false
    started.status.then(() => (exited = true))
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
    fetch(`${base}${path}`, {
      method: 'POST',
      // The service takes only JSON (`serve.py`).
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

  /** Asks the service every `checkEveryMs`, until `done`, whether it's downloading a model. */
  async function watchDownloads(done: Promise<unknown>, onDownload: OnDownload) {
    let finished = false
    done.finally(() => (finished = true)).catch(() => {})
    let downloading = false
    while (!finished) {
      await Promise.race([done.catch(() => {}), new Promise((r) => setTimeout(r, checkEveryMs))])
      if (finished) break
      const health = await fetch(`${base}/health`).then((r) => r.json()).catch(() => ({}))
      if (!!health.downloading !== downloading && !finished) {
        downloading = !downloading
        onDownload(downloading)
      }
    }
  }

  /**
   * Stops what a cancelled call left the service making. It can't stop part-way, so it quits
   * (`cancel` in `serve.py`), and is started again on next use; waits until it's gone, so that use
   * doesn't find it still answering.
   */
  async function stopWork() {
    const res = await post('/cancel', {}, AbortSignal.timeout(5000)).catch(() => undefined)
    const { cancelled } = await res?.json().catch(() => ({})) ?? {}
    if (!cancelled) return
    starting = null
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && await healthy()) await new Promise((r) => setTimeout(r, 50))
  }

  async function call(
    path: string,
    body: object,
    signal: AbortSignal,
    onDownload?: OnDownload,
  ): Promise<{ ranOn?: boolean }> {
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
      if (signal.aborted) {
        await stopWork()
        throw err
      }
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
    return reply
  }

  return {
    // The service reads and writes only under its root, so it is stopped and starts again, with
    // the new one, on next use.
    async moveTo(next) {
      root = next
      const old = child
      child = undefined
      starting = null
      if (old) {
        try {
          old.kill()
        } catch { /* already gone */ }
        await old.status.catch(() => {})
      }
      // `uv run` may leave its Python child answering on the port, still on the old root.
      if (await healthy()) {
        throw new Error('The voice service is still running on the old folder: stop it and retry')
      }
    },
    // Lines as MP3 (96 kbps, a quarter of the WAV); light enough to run beside the Text Model.
    profile: () => Promise.resolve({ ref: 'wav', speech: 'mp3', heavy: false }),
    design: async (req, signal, onDownload) => void await call('/design', req, signal, onDownload),
    // The service speaks the text as it comes, tags and all, and counts the frames it took.
    speak: async ({ ref, refText, seed, out, maxFrames, ...line }, signal, onDownload) => {
      const body = { text: higgsText(line), ref, refText, seed, out, maxFrames }
      const { ranOn } = await call('/speak', body, signal, onDownload)
      return { ranOn: ranOn === true }
    },
  }
}

/**
 * Speaks a line to its end. Now and then Higgs doesn't end a line: it loops, in a buzz or in
 * silence, until it's stopped (docs/research/voices.md). So a line may take only so many frames, by
 * its length (`maxFrames`), and one that takes them all is spoken again, once, at a seed of its own:
 * a line's seed is fixed by its Frame, so a retry at a fixed seed would loop the same way every time
 * the player asked again. Fails, with why, if that one runs on too.
 */
export async function speakToEnd(
  voice: VoiceEngine,
  req: Omit<SpeakRequest, 'maxFrames'>,
  signal: AbortSignal,
  onDownload?: OnDownload,
): Promise<void> {
  const most = maxFrames(req.text)
  for (const seed of [req.seed, crypto.getRandomValues(new Uint32Array(1))[0]]) {
    const { ranOn } = await voice.speak({ ...req, seed, maxFrames: most }, signal, onDownload)
    if (!ranOn) return
    signal.throwIfAborted()
  }
  throw new Error(
    `The voice didn't finish the line, twice: it ran on past ${secondsOf(most)} s. Try again`,
  )
}

/**
 * Makes voices on the Backend Settings send them to now (ADR 0022): this machine's voice service
 * where it's installed (a Mac), or a ComfyUI at its address.
 */
export function voiceBackends(backends: {
  mlx?: VoiceEngine
  /** A ComfyUI at `address` ('' for its usual one here). */
  comfyui: (address: string) => VoiceEngine
  /** The Backend voices go to now; none when no Backend can make them. */
  backend: () => Promise<Backend | undefined>
}): VoiceEngine {
  const pick = async () => {
    const backend = await backends.backend()
    if (backend?.kind === 'comfyui') return backends.comfyui(backend.address)
    if (backend?.kind === 'here' && backends.mlx) return backends.mlx
    throw new Error('No Backend can make voices: add a ComfyUI in Settings, on the Machines tab')
  }
  return {
    profile: async () => (await pick()).profile(),
    design: async (req, signal, onDownload) => (await pick()).design(req, signal, onDownload),
    speak: async (req, signal, onDownload) => await (await pick()).speak(req, signal, onDownload),
  }
}
