/**
 * Saved quantized copies of Image Models. mflux's `--quantize` converts the full weights at every
 * render, after loading them, so the peak memory is the same as full precision (and each render
 * is slower); a copy saved once with `mflux-save --quantize` and rendered from loads the smaller
 * weights directly: about 8 GB less on FLUX.2 Klein 9B and Qwen-Image 2.1 (docs/models.md).
 *
 * A copy is made the first time a render needs it, inside the render queue, and kept until it's
 * deleted (Settings lists them) or made by an older mflux, when the next render replaces it. Each
 * lives in its own folder, `<model>-<bits>bit-mflux<version>`, marked finished by a `copy.json`,
 * so one interrupted halfway is never used. This is mflux's own route for quantized weights,
 * not a new one: docs/models.md explains its two loading paths, and why copies are made here
 * rather than downloaded.
 */
import { join } from '@std/path'
import type { MfluxModel } from './models.ts'

export interface QuantizedCopy {
  /** The folder's name, which identifies the copy. */
  name: string
  modelId: string
  bits: number
  /** The mflux version that made it. */
  mflux: string
  bytes: number
  createdAt: string
}

export interface QuantizedStore {
  /**
   * The folder of `model`'s copy at `bits`, saving it first if there's none from this mflux;
   * `onDownload` if saving has to download the model first.
   */
  ensure(
    model: MfluxModel,
    bits: number,
    signal: AbortSignal,
    onDownload?: () => void,
  ): Promise<string>
  list(): Promise<QuantizedCopy[]>
  /** Deletes a copy; false if there's no such copy. */
  remove(name: string): Promise<boolean>
}

export interface QuantizedStoreOptions {
  /** The mflux version that would make a copy now. */
  mfluxVersion(): Promise<string>
  /** Saves `model` quantized to `bits` into `path` (`mflux-save`). */
  save(
    model: MfluxModel,
    bits: number,
    path: string,
    signal: AbortSignal,
    onDownload?: () => void,
  ): Promise<void>
}

const MARKER = 'copy.json'
const NAME = /^[a-z0-9.-]+-\d+bit-mflux[0-9a-z.+-]+$/

async function sizeOf(path: string): Promise<number> {
  let bytes = 0
  for await (const entry of Deno.readDir(path)) {
    const full = join(path, entry.name)
    if (entry.isDirectory) bytes += await sizeOf(full)
    else if (entry.isFile) bytes += (await Deno.stat(full)).size
  }
  return bytes
}

export function quantizedStore(root: string, opts: QuantizedStoreOptions): QuantizedStore {
  async function read(name: string): Promise<QuantizedCopy | null> {
    try {
      const marker = JSON.parse(await Deno.readTextFile(join(root, name, MARKER)))
      return { name, ...marker, bytes: await sizeOf(join(root, name)) }
    } catch {
      return null
    }
  }

  async function list(): Promise<QuantizedCopy[]> {
    const copies: QuantizedCopy[] = []
    try {
      for await (const entry of Deno.readDir(root)) {
        if (!entry.isDirectory || !NAME.test(entry.name)) continue
        const copy = await read(entry.name)
        if (copy) copies.push(copy)
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err
    }
    return copies.sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    list,

    async ensure(model, bits, signal, onDownload) {
      const mflux = await opts.mfluxVersion()
      const name = `${model.id}-${bits}bit-mflux${mflux}`
      const path = join(root, name)
      if (await read(name)) return path
      // Copies of this model and setting from another mflux: replaced by this one.
      for (const old of await list()) {
        if (old.modelId === model.id && old.bits === bits) {
          await Deno.remove(join(root, old.name), { recursive: true })
        }
      }
      const partial = `${path}.partial`
      await Deno.remove(partial, { recursive: true }).catch(() => {})
      await Deno.mkdir(root, { recursive: true })
      try {
        await opts.save(model, bits, partial, signal, onDownload)
        signal.throwIfAborted()
        await Deno.remove(path, { recursive: true }).catch(() => {})
        await Deno.rename(partial, path)
        const marker = { modelId: model.id, bits, mflux, createdAt: new Date().toISOString() }
        await Deno.writeTextFile(join(path, MARKER), JSON.stringify(marker, null, 1))
        return path
      } catch (err) {
        await Deno.remove(partial, { recursive: true }).catch(() => {})
        throw err
      }
    },

    async remove(name) {
      if (!NAME.test(name) || !(await read(name))) return false
      await Deno.remove(join(root, name), { recursive: true })
      return true
    },
  }
}
