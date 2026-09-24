import { IMAGE_MODELS } from './imageModels.ts'
import { SIZE_PRESETS, type SettingsStore, validateSettings } from './settings.ts'

export interface AppDeps {
  settings: SettingsStore
  listTextModels: () => Promise<string[]>
}

export function createHandler(deps: AppDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    const { pathname } = new URL(req.url)
    const route = `${req.method} ${pathname}`

    switch (route) {
      case 'GET /api/health':
        return Response.json({ ok: true })

      case 'GET /api/settings':
        return Response.json(await deps.settings.load())

      case 'PUT /api/settings': {
        let body: unknown
        try {
          body = await req.json()
        } catch {
          return Response.json({ error: 'Body must be JSON' }, { status: 400 })
        }
        const result = validateSettings(body)
        if (!result.ok) {
          return Response.json({ error: 'Invalid settings', issues: result.issues }, {
            status: 400,
          })
        }
        await deps.settings.save(result.settings)
        return Response.json(result.settings)
      }

      case 'GET /api/settings/options': {
        let textModels: string[] = []
        let textModelsError: string | undefined
        try {
          textModels = await deps.listTextModels()
        } catch (err) {
          textModelsError = `Could not reach Ollama: ${(err as Error).message}`
        }
        return Response.json({
          textModels,
          textModelsError,
          imageModels: IMAGE_MODELS.map(({ id, label, defaultSteps }) => ({
            id,
            label,
            defaultSteps,
          })),
          sizePresets: SIZE_PRESETS,
        })
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
