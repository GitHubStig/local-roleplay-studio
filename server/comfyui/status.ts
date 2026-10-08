import { comfyBase, getJson } from './client.ts'
import { modelFiles } from '../images/comfyui/comfyui.ts'
import { type ComfyModel, findComfyModel, findComfyUpscaler } from '../images/comfyui/models.ts'
import { VOICE_NODES } from '../voice/comfyui/comfyui.ts'

/** Whether ComfyUI answers at an address, and can run what Settings send it: for Settings. */
export type ComfyStatus =
  | { up: true; version: string; device: string; ready: boolean; missing?: string }
  | { up: false; error: string }

/**
 * Asks the ComfyUI at `baseUrl` ('' for its default) what it is (`GET /system_stats`), and whether it
 * has what will run there: the Image Model's and the upscaler's files (either may be left out), and
 * for voices the custom nodes they need. Never throws: what's wrong is in the answer.
 */
export async function comfyuiStatus(
  baseUrl: string,
  uses: { imageModel?: string; upscaler?: string; voices?: boolean },
): Promise<ComfyStatus> {
  const base = comfyBase(baseUrl)
  const signal = AbortSignal.timeout(5000)
  let stats: { system?: { comfyui_version?: string }; devices?: { name?: string }[] }
  try {
    stats = await getJson(base, '/system_stats', signal)
  } catch (err) {
    return { up: false, error: (err as Error).message }
  }
  const up = {
    up: true as const,
    version: stats.system?.comfyui_version ?? '?',
    device: stats.devices?.[0]?.name ?? '?',
  }
  const missing: string[] = []
  const check = async (
    id: string | undefined,
    find: (id: string) => Pick<ComfyModel, 'label' | 'files'> | undefined,
    what: string,
  ) => {
    if (id === undefined) return
    const model = find(id)
    if (!model) return missing.push(`ComfyUI has no ${what} "${id}" here`)
    await modelFiles(base, model, signal).catch((err) => missing.push((err as Error).message))
  }
  await check(uses.imageModel, findComfyModel, 'Image Model')
  await check(uses.upscaler, findComfyUpscaler, 'upscaler')
  if (uses.voices) {
    const absent = []
    for (const node of VOICE_NODES) {
      const info = await getJson(base, `/object_info/${node}`, signal).catch(() => ({}))
      if (!info[node]) absent.push(node)
    }
    if (absent.length) {
      missing.push(
        `ComfyUI doesn't have the TTS Audio Suite nodes voices need (${absent.join(', ')}): ` +
          'install TTS Audio Suite through its Manager',
      )
    }
  }
  return missing.length
    ? { ...up, ready: false, missing: missing.join('; ') }
    : { ...up, ready: true }
}
