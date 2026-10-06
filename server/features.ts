import { join } from '@std/path'

/**
 * The extras beyond the Text Model, each needing its own backend: pictures (mflux), voices (the
 * mlx-audio service), and 3D (SHARP, TripoSplat, LiTo). Which of them this machine can run is worked
 * out once at startup (`detectFeatures`); Settings can switch off any that can.
 */
export const FEATURES = ['images', 'voices', 'scenes', 'figures', 'lito'] as const
export type Feature = (typeof FEATURES)[number]

/** What each Feature is called when saying it's off. */
export const FEATURE_NAMES: Record<Feature, string> = {
  images: 'Pictures',
  voices: 'Voices',
  scenes: 'SHARP',
  figures: 'TripoSplat',
  lito: 'LiTo',
}

/** Whether a Feature can run here, and if not, why not (for Settings to say). */
export interface Availability {
  available: boolean
  reason?: string
}
export type Availabilities = Record<Feature, Availability>

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
  return {
    images: opts.placeholderImages
      ? yes
      : !appleSilicon
      ? mlxOnly('mflux, the image backend,')
      : mflux
      ? yes
      : no("mflux isn't installed (uv tool install mflux; see the README)"),
    voices: !appleSilicon ? mlxOnly('The voice service (mlx-audio)') : uv ? yes : noUv,
    scenes: gpu('SHARP'),
    figures: gpu('TripoSplat'),
    lito: !appleSilicon ? mlxOnly('LiTo (through mlx-spatial)') : uv ? yes : noUv,
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
