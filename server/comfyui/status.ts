import { comfyBase, getJson } from './client.ts'
import { modelFiles } from './files.ts'
import { type ComfyModel, findComfyModel, findComfyUpscaler } from '../images/comfyui/models.ts'
import { VOICE_NODES } from '../voice/comfyui/comfyui.ts'
import { findComfyVideoModel } from '../video/comfyui/models.ts'
import { ACE_STEP } from '../music/comfyui/comfyui.ts'
import type { ComfyUses } from '../../shared/comfyui.ts'

/**
 * Whether ComfyUI answers at an address, and can run what Settings send it: for Settings. What's
 * missing is by what it's missing for, so each tab shows only its own.
 */
export type ComfyStatus =
  | {
    up: true
    version: string
    device: string
    missing: { [use in keyof ComfyUses]?: string }
  }
  | { up: false; error: string }

/**
 * Asks the ComfyUI at `baseUrl` ('' for its default) what it is (`GET /system_stats`), and whether it
 * has what will run there: the Image Model's, the upscaler's, the video model's and music's files (any
 * may be left out), and for voices the custom nodes they need. Never throws: what's wrong is in the answer.
 */
export async function comfyuiStatus(
  baseUrl: string,
  uses: ComfyUses,
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
  const missing: { [use in keyof ComfyUses]?: string } = {}
  const check = async (
    use: 'imageModel' | 'upscaler' | 'videoModel',
    find: (id: string) => Pick<ComfyModel, 'label' | 'files'> | undefined,
    what: string,
  ) => {
    const id = uses[use]
    if (id === undefined) return
    const model = find(id)
    if (!model) return missing[use] = `ComfyUI has no ${what} "${id}" here`
    await modelFiles(base, model, signal).catch((err) => missing[use] = (err as Error).message)
  }
  await check('imageModel', findComfyModel, 'Image Model')
  await check('upscaler', findComfyUpscaler, 'upscaler')
  await check('videoModel', findComfyVideoModel, 'video model')
  if (uses.music) {
    await modelFiles(base, ACE_STEP, signal).catch((err) => missing.music = (err as Error).message)
  }
  if (uses.voices) {
    const absent = []
    for (const node of VOICE_NODES) {
      const info = await getJson(base, `/object_info/${node}`, signal).catch(() => ({}))
      if (!info[node]) absent.push(node)
    }
    if (absent.length) {
      missing.voices =
        `ComfyUI doesn't have the TTS Audio Suite nodes voices need (${absent.join(', ')}): ` +
        'install TTS Audio Suite through its Manager'
    }
  }
  return { ...up, missing }
}
