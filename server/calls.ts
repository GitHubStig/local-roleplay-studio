/**
 * The call log: with Settings' `callLog` on, every call to the Text Model and the Image Model
 * (renders and upscales) is written to the Session's folder as it's made, for studying what the
 * models were sent and what came back. One file per Frame (`calls/frame-3.json`, numbered as the
 * app shows them), and `calls/setup.json` for what isn't one Frame's (a Cast, a Storyboard's
 * plan); each a JSON array, oldest call first, that an editor can fold.
 *
 * Which Session and Frame a call is for comes from where it's made: a piece of work runs inside
 * `logCalls`, and every call under it, however deep, is logged there.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { join } from '@std/path'
import type { Chat, ChatCall } from './text/chat.ts'
import type { ImageGenerator } from './images/imageGenerator.ts'
import { RENDER_SETTINGS } from './settings.ts'

/** Where the calls of a piece of work are logged. */
interface CallScope {
  /** The Session's folder. */
  dir: string
  /** The Frame's index; null for the Session's setup. */
  frame: number | null
}

const scope = new AsyncLocalStorage<CallScope | null>()

/**
 * Runs `work`, logging its calls in the Session folder `dir` under Frame `frame` (null: setup);
 * when `on` is false, inside it nothing is logged.
 */
export function logCalls<T>(
  on: boolean,
  dir: string,
  frame: number | null,
  work: () => Promise<T>,
): Promise<T> {
  return scope.run(on ? { dir, frame } : null, work)
}

/** Runs `work` with its calls logged under Frame `frame` instead, if they're logged at all. */
export function logCallsUnder<T>(frame: number, work: () => Promise<T>): Promise<T> {
  const current = scope.getStore()
  return current ? scope.run({ ...current, frame }, work) : work()
}

/** One logged call. */
export interface CallRecord {
  /** When it started. */
  at: string
  /** Which job it was: `reply`, `cast`, `render`… */
  job: string
  model: string
  /** How long it took, in seconds. */
  seconds: number
  request: Record<string, unknown>
  /** What came back; absent when it failed. */
  response?: Record<string, unknown>
  error?: string
}

/** Each file's writes, one after another, so two calls never write it at once. */
const writing = new Map<string, Promise<void>>()

/** The tail every log file ends with, overwritten by the next call's record. */
const END = '\n]\n'
const encoder = new TextEncoder()

/** The file a Frame's calls (or the setup's, `null`) go in. */
export const callFile = (dir: string, frame: number | null) =>
  join(dir, 'calls', frame === null ? 'setup.json' : `frame-${frame + 1}.json`)

/**
 * Adds `record` to the end of `path`'s array without rewriting it: over its closing `]`. A file
 * that doesn't end as this writes it (edited by hand) is read and written whole.
 */
async function append(path: string, record: CallRecord): Promise<void> {
  const entry = JSON.stringify(record, null, 2).replace(/^/gm, '  ')
  let file: Deno.FsFile
  try {
    file = await Deno.open(path, { read: true, write: true, createNew: true })
    try {
      await file.write(encoder.encode(`[\n${entry}${END}`))
    } finally {
      file.close()
    }
    return
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err
  }
  file = await Deno.open(path, { read: true, write: true })
  try {
    const size = (await file.stat()).size
    const tail = new Uint8Array(END.length)
    await file.seek(size - END.length, Deno.SeekMode.Start)
    await file.read(tail)
    if (new TextDecoder().decode(tail) === END) {
      await file.seek(size - END.length, Deno.SeekMode.Start)
      await file.write(encoder.encode(`,\n${entry}${END}`))
      return
    }
  } finally {
    file.close()
  }
  const calls = JSON.parse(await Deno.readTextFile(path)) as unknown[]
  calls.push(record)
  await Deno.writeTextFile(path, JSON.stringify(calls, null, 2) + '\n')
}

/**
 * Logs `record` where the current piece of work logs its calls, if anywhere. Never fails the call:
 * a log that can't be written is only warned about. A Session removed meanwhile gets no log (its
 * folder isn't made again).
 */
async function logCall(record: CallRecord): Promise<void> {
  const where = scope.getStore()
  if (!where) return
  const path = callFile(where.dir, where.frame)
  const previous = writing.get(path) ?? Promise.resolve()
  const done = previous.then(async () => {
    try {
      await Deno.mkdir(join(where.dir, 'calls'))
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return
      if (!(err instanceof Deno.errors.AlreadyExists)) throw err
    }
    await append(path, record)
  }).catch((err) => console.warn(`Couldn't log a call in ${path}: ${(err as Error).message}`))
  writing.set(path, done)
  await done
  if (writing.get(path) === done) writing.delete(path)
}

/** Times `call`, and logs it with `request` and what `respond` makes of its result. */
async function logged<T>(
  job: string,
  model: string,
  request: Record<string, unknown>,
  call: () => Promise<T>,
  respond: (result: T) => Record<string, unknown>,
): Promise<T> {
  if (!scope.getStore()) return call()
  const at = new Date().toISOString()
  const start = performance.now()
  const seconds = () => Math.round(performance.now() - start) / 1000
  try {
    const result = await call()
    await logCall({ at, job, model, seconds: seconds(), request, response: respond(result) })
    return result
  } catch (err) {
    await logCall({ at, job, model, seconds: seconds(), request, error: (err as Error).message })
    throw err
  }
}

/** A structured reply as the JSON it is, so it folds with the rest; plain text as it came. */
function replyOf(content: string, schema?: object): unknown {
  if (!schema) return content
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

/** `chat`, with each call logged (`logCalls`). */
export function loggedChat(chat: Chat): Chat {
  return {
    get model() {
      return chat.model
    },
    get thinks() {
      return chat.thinks
    },
    stream(call: ChatCall) {
      const { signal: _, onThinking: _t, onContent: _c, job, ...sent } = call
      return logged(
        job ?? 'text',
        chat.model,
        { thinking: chat.thinks && !call.noThinking, ...sent },
        () => chat.stream(call),
        ({ content, thinking }) => ({
          ...(thinking && { thinking }),
          reply: replyOf(content, call.schema),
        }),
      )
    },
  }
}

/** `images`, with each render and upscale logged (`logCalls`). */
export function loggedImages(images: ImageGenerator): ImageGenerator {
  return {
    generate(req, signal, onProgress, onDownload, onPreview) {
      const { settings } = req
      return logged(
        'render',
        settings.imageModel,
        {
          prompt: req.prompt,
          seed: req.seed,
          imageBackend: settings.imageBackend,
          steps: settings.steps,
          ...Object.fromEntries(
            RENDER_SETTINGS.filter((key) => key !== 'imageBaseUrl').map((key) => [
              key,
              settings[key],
            ]),
          ),
        },
        () => images.generate(req, signal, onProgress, onDownload, onPreview),
        (image) => ({ image }),
      )
    },
    upscale(req, signal, onProgress, onDownload) {
      return logged(
        'upscale',
        req.model,
        { image: req.image, seed: req.seed },
        () => images.upscale(req, signal, onProgress, onDownload),
        (image) => ({ image }),
      )
    },
  }
}
