import { join } from '@std/path'
import type { Availabilities, Availability, Feature } from '../shared/features.ts'

/** What each Feature is called when saying it's off. */
export const FEATURE_NAMES: Record<Feature, string> = {
  images: 'Pictures',
  upscale: 'Upscale',
  edits: 'Edits',
  voices: 'Voices',
  scenes: 'SHARP',
  figures: 'TripoSplat',
  lito: 'LiTo',
  style: 'Style scores',
  video: 'Clips',
}

/** What `detectFeatures` looks at; the real machine by default, a fake one in tests. */
export interface Machine {
  os: typeof Deno.build.os
  arch: typeof Deno.build.arch
  /** Whether `command` can be run, i.e. is on the PATH. */
  has(command: string): Promise<boolean>
}

const yes: Availability = { available: true }
const no = (reason: string): Availability => ({ available: false, reason })

/**
 * Works out which Features this machine can run. mflux, mlx-audio and mlx-spatial (LiTo) are MLX,
 * so Apple Silicon only; SHARP and TripoSplat are PyTorch, so they want the Mac's GPU or an NVIDIA
 * one (CUDA). The Python ones are run by uv. `placeholderImages` stands in SVG cards for pictures.
 */
export async function detectFeatures(
  machine: Machine = thisMachine(),
  opts: { placeholderImages?: boolean } = {},
): Promise<Availabilities> {
  const appleSilicon = machine.os === 'darwin' && machine.arch === 'aarch64'
  const [mflux, uv, nvidia] = await Promise.all([
    machine.has('mflux-generate-flux2'),
    machine.has('uv'),
    machine.has('nvidia-smi'),
  ])
  const noUv = no("uv isn't installed: it runs the Python services (https://docs.astral.sh/uv/)")
  const mlxOnly = (what: string) => no(`${what} runs only on Apple Silicon Macs`)
  const gpu = (what: string) =>
    !uv
      ? noUv
      : appleSilicon || nvidia
      ? yes
      : no(`${what} needs an Apple Silicon Mac or an NVIDIA GPU`)
  const withMflux = opts.placeholderImages
    ? yes
    : !appleSilicon
    ? mlxOnly('mflux')
    : mflux
    ? yes
    : no("mflux isn't installed (uv tool install mflux; see the README)")
  return {
    // With mflux; Settings can choose ComfyUI instead.
    images: withMflux,
    // SeedVR2, through mflux.
    upscale: withMflux,
    // An edit model through mflux, or ComfyUI when Settings choose it.
    edits: withMflux,
    voices: !appleSilicon ? mlxOnly('The voice service (mlx-audio)') : uv ? yes : noUv,
    scenes: gpu('SHARP'),
    figures: gpu('TripoSplat'),
    lito: !appleSilicon ? mlxOnly('LiTo (through mlx-spatial)') : uv ? yes : noUv,
    // PyTorch, on the GPU where there is one; small enough to run on the CPU, only slower.
    style: uv ? yes : noUv,
    // LTX 2.5 runs only through a ComfyUI (`withBackends`).
    video: no('Clips are made on a ComfyUI with LTX 2.5'),
  }
}

/**
 * What can run now: as detected at startup, but with pictures, Upscale, edits, voices and clips
 * available wherever Settings list a ComfyUI, which a running server provides rather than this machine (ADR
 * 0022). One that isn't says one could be added.
 */
export function withBackends(
  detected: Availabilities,
  settings: { backends: readonly { kind: string }[] },
): Availabilities {
  const comfyui = settings.backends.some((b) => b.kind === 'comfyui')
  const viaComfyUI = (feature: 'images' | 'upscale' | 'edits' | 'voices' | 'video') =>
    comfyui ? yes : detected[feature].available ? detected[feature] : {
      available: false,
      reason: `${detected[feature].reason}; or add a ComfyUI in Settings, on the Machines tab`,
    }
  return {
    ...detected,
    images: viaComfyUI('images'),
    edits: viaComfyUI('edits'),
    upscale: viaComfyUI('upscale'),
    voices: viaComfyUI('voices'),
    video: viaComfyUI('video'),
  }
}

/** This machine: its platform, and the commands on its PATH (with Windows' `.exe` and the like). */
export function thisMachine(): Machine {
  const windows = Deno.build.os === 'windows'
  const dirs = (Deno.env.get('PATH') ?? '').split(windows ? ';' : ':').filter(Boolean)
  const exts = windows ? (Deno.env.get('PATHEXT') ?? '.EXE;.CMD;.BAT').split(';') : ['']
  return {
    os: Deno.build.os,
    arch: Deno.build.arch,
    async has(command) {
      for (const dir of dirs) {
        for (const ext of exts) {
          try {
            if ((await Deno.stat(join(dir, command + ext))).isFile) return true
          } catch {
            // Not here.
          }
        }
      }
      return false
    },
  }
}
