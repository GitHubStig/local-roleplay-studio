/**
 * Which machine a job runs on, so the Text Model is unloaded for a heavy job only when they share
 * one (ADR 0013): a render on a ComfyUI across the network leaves this machine's memory alone.
 * A machine is named by a server's address; `undefined` is this machine (mflux, the voice
 * service, SHARP, LiTo).
 */
import { comfyBase } from './comfyui/client.ts'
import type { Settings } from './settings.ts'
import { OLLAMA_URL } from './text/ollama/ollama.ts'

/**
 * A heavy job that may run on another machine, as the render queue is given it: a render with its
 * Session's Settings, an upscale or a voice. Any other (SHARP, a figure) runs here.
 */
export type HeavyJob =
  | { kind: 'render'; settings: Pick<Settings, 'imageBackend' | 'imageBaseUrl'> }
  | { kind: 'upscale' | 'voice' }

const hostOf = (address: string) => {
  try {
    return new URL(address).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return address.toLowerCase()
  }
}

/** This machine's own names and addresses, as far as Deno can tell (`--allow-sys`). */
function ownNames(): Set<string> {
  const names = new Set<string>()
  try {
    const host = Deno.hostname().toLowerCase()
    names.add(host).add(`${host.replace(/\.local$/, '')}.local`)
  } catch { /* no permission: loopback only */ }
  try {
    for (const { address } of Deno.networkInterfaces()) names.add(address.toLowerCase())
  } catch { /* no permission: loopback only */ }
  return names
}

/** Whether `address` is this machine: loopback, or one of its own names and addresses. */
export function isThisMachine(address: string | undefined, own: Set<string> = ownNames()): boolean {
  if (!address) return true
  const host = hostOf(address)
  return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) ||
    host === '::1' || host === '0.0.0.0' || own.has(host)
}

/** Whether two addresses are the same machine: both this one, or the same host. */
export function sameMachine(
  a: string | undefined,
  b: string | undefined,
  own: Set<string> = ownNames(),
): boolean {
  if (isThisMachine(a, own) && isThisMachine(b, own)) return true
  return !!a && !!b && hostOf(a) === hostOf(b)
}

/**
 * Where a heavy job runs: a render on its Session's backend; an upscale and a voice on the backend
 * Settings choose now (ComfyUI at Settings' address); any other here.
 */
export function jobServer(
  job: HeavyJob | undefined,
  now: Pick<Settings, 'upscaleBackend' | 'voiceBackend' | 'imageBaseUrl'>,
): string | undefined {
  const comfy = (on: boolean, address: string) => on ? comfyBase(address) : undefined
  switch (job?.kind) {
    case 'render':
      return comfy(job.settings.imageBackend === 'comfyui', job.settings.imageBaseUrl)
    case 'upscale':
      return comfy(now.upscaleBackend === 'comfyui', now.imageBaseUrl)
    case 'voice':
      return comfy(now.voiceBackend === 'comfyui', now.imageBaseUrl)
    default:
      return undefined
  }
}

/** Where the Text Model runs: Ollama at Settings' address or its own; a server at its address. */
export const textServer = (
  s: Pick<Settings, 'textBackend' | 'textBaseUrl'>,
): string | undefined => s.textBaseUrl || (s.textBackend === 'ollama' ? OLLAMA_URL : undefined)
