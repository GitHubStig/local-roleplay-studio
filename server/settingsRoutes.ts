/** Settings' routes: reading and saving them, and what they can choose from. */
import { error, json, readJson, type Route } from './http.ts'
import { imageModelsOf } from './images/imageModels.ts'
import { EDIT_MODELS, IMAGE_BACKENDS, UPSCALERS } from '../shared/images.ts'
import type { ComfyUses } from '../shared/comfyui.ts'
import { COMFYUI_VIDEO_MODELS } from './video/comfyui/models.ts'
import { imageKindOf } from './backends.ts'
import { type Backend, BACKEND_NAMES, BACKEND_WORK, type BackendKind } from '../shared/backends.ts'
import type { TextModelInfo } from './text/backend.ts'
import { SIZE_PRESETS, validateSettings } from './settings.ts'
import type { Settings } from '../shared/settings.ts'
import { editModelsHere } from './images/editModels.ts'
import { backendOf, editJob } from './machine.ts'
import type { AppContext } from './appContext.ts'

export function settingsRoutes(ctx: AppContext): Route[] {
  const { deps, detected, availability, imageBackends } = ctx

  /** Settings as the browser sees them: which Backends have an API key, never the keys. */
  const shownSettings = async (settings: Settings) => ({
    ...settings,
    apiKeysSet: (await Promise.all(
      settings.backends.map(async (b) => (await deps.settings.loadApiKey(b.id)) ? [b.id] : []),
    )).flat(),
  })

  /** A text Backend's models for Settings to offer, or why it couldn't list them. */
  async function textModelOptions(backend: Backend | undefined, apiKey?: string) {
    let models: TextModelInfo[] = []
    let textModelsError: string | undefined
    try {
      if (!backend) throw new Error('none is listed, on the Machines tab')
      models = await deps.listTextModels(backend, apiKey)
    } catch (err) {
      const name = backend ? BACKEND_NAMES[backend.kind] : 'a text Backend'
      textModelsError = `Could not reach ${name}: ${(err as Error).message}`
    }
    return {
      textModels: models.map((m) => m.name),
      thinkingModels: models.filter((m) => m.thinking).map((m) => m.name),
      textModelsError,
    }
  }

  return [
    [
      'GET',
      new URLPattern({ pathname: '/api/settings' }),
      async () => json(await shownSettings(await deps.settings.load())),
    ],

    // `apiKeys` maps a Backend's id to a key that replaces its saved one ('' removes it); one left
    // out is kept, while the Backend is.
    ['PUT', new URLPattern({ pathname: '/api/settings' }), async (req) => {
      const body = await readJson(req)
      if (body === undefined) return error('Body must be JSON', 400)
      const result = validateSettings(body)
      if (!result.ok) return error('Invalid settings', 400, { issues: result.issues })
      // The Session folder is moved from its own tab, which also moves the Sessions in use.
      const { sessionsFolder } = await deps.settings.load()
      result.settings.sessionsFolder = sessionsFolder
      await deps.settings.save(result.settings)
      const { apiKeys } = body as { apiKeys?: unknown }
      if (typeof apiKeys === 'object' && apiKeys !== null) {
        for (const [id, key] of Object.entries(apiKeys)) {
          const listed = result.settings.backends.some((b) => b.id === id)
          if (listed && typeof key === 'string') await deps.settings.saveApiKey(id, key.trim())
        }
      }
      return json(await shownSettings(result.settings))
    }],

    // Whether a ComfyUI is up at an address not saved yet, and can run what Settings would send
    // it: the Image Model's files, the upscaler's, and voices' nodes.
    ['POST', new URLPattern({ pathname: '/api/settings/comfyui' }), async (req) => {
      const body = await readJson(req) as
        | {
          address?: unknown
          imageModel?: unknown
          upscaler?: unknown
          voices?: unknown
          videoModel?: unknown
          music?: unknown
        }
        | undefined
      const optional = (v: unknown) => v === undefined || typeof v === 'string'
      if (
        typeof body?.address !== 'string' || !optional(body.imageModel) ||
        !optional(body.upscaler) || !optional(body.videoModel) ||
        (body.voices !== undefined && typeof body.voices !== 'boolean') ||
        (body.music !== undefined && typeof body.music !== 'boolean')
      ) {
        return error(
          'Give an address, and an imageModel, an upscaler, voices, a videoModel or music to check',
          400,
        )
      }
      if (!deps.comfyuiStatus) return error("ComfyUI isn't set up on this server", 409)
      const { imageModel, upscaler, voices, videoModel, music } = body as ComfyUses
      return json(
        await deps.comfyuiStatus(body.address.trim(), {
          imageModel,
          upscaler,
          voices,
          videoModel,
          music,
        }),
      )
    }],

    // The models on a text Backend not saved yet, for Settings to offer as it's changed: with
    // `apiKey`, or the saved key of the Backend with that `id`.
    ['POST', new URLPattern({ pathname: '/api/settings/text-models' }), async (req) => {
      const body = await readJson(req) as Record<string, unknown> | undefined
      const kind = body?.kind as BackendKind
      if (!BACKEND_WORK[kind]?.includes('text') || typeof body?.address !== 'string') {
        return error('Give the kind of a text Backend, and its address', 400)
      }
      const id = typeof body.id === 'string' ? body.id : ''
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined
      return json(await textModelOptions({ id, kind, address: body.address.trim() }, apiKey))
    }],

    ['GET', new URLPattern({ pathname: '/api/settings/options' }), async () => {
      const now = await deps.settings.load()
      return json({
        ...await textModelOptions(now.backends.find((b) => b.id === now.runOn.text)),
        // Every backend's, so Settings can switch between them.
        imageModels: Object.fromEntries(IMAGE_BACKENDS.map((b) => [b, imageModelsOf(b)])),
        imageBackends: await imageBackends(),
        // Where each Image Model's renders go now, for the Session's picker to say (ADR 0022).
        imageModelsOn: Object.fromEntries(
          IMAGE_BACKENDS.flatMap((kind) => imageModelsOf(kind).map((m) => m.id))
            .map((id) => [id, backendOf({ kind: 'render', model: id }, now, detected)] as const)
            .flatMap(([id, backend]) => {
              const kind = backend && imageKindOf(backend)
              return kind ? [[id, kind]] : []
            }),
        ),
        sizePresets: SIZE_PRESETS,
        upscalers: UPSCALERS,
        videoModels: COMFYUI_VIDEO_MODELS.map(({ id, label, sound, size, longest }) => ({
          id,
          label,
          sound,
          size,
          longest,
        })),
        editModels: editModelsHere(await imageBackends()),
        // Where each edit model's edits go now, for the Edit dialog to say.
        editModelsOn: Object.fromEntries(
          EDIT_MODELS.flatMap((m) => {
            const backend = backendOf(editJob(m.id), now, detected)
            const kind = backend && imageKindOf(backend)
            return kind ? [[m.id, kind]] : []
          }),
        ),
        features: await availability(),
        // What this machine's own Backend runs, whatever else is listed.
        here: detected,
      })
    }],
  ]
}
