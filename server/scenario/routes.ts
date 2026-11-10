/** The Scenario page's routes: the player's Scenario files, Expand and Suggest. */
import { error, json, readJson, type Route } from '../http.ts'
import { crossedLimit } from '../limits.ts'
import {
  parseScenario,
  personId,
  type Scenario,
  SCENARIO_ID,
  scenarioMarkdown,
  scenarioText,
  summarise,
} from '../scenario.ts'
import type { TextModel } from '../textModel.ts'
import { partOf } from './suggest.ts'
import { withRetry } from '../frames.ts'
import type { AppContext } from '../appContext.ts'
import { briefRefused, sentScenario } from '../sessionRoutes.ts'

export function scenarioRoutes(ctx: AppContext): Route[] {
  const { deps, randomSeed } = ctx

  /**
   * The Text Model as the Scenario page uses it, before there's a Session: Settings' model and
   * Thinking, seeded from Settings' seed (or a new one), its repeats counted under one key.
   */
  async function scenarioPageModel(): Promise<TextModel | Response> {
    const settings = await deps.settings.load()
    if (!settings.textModel) return error('Choose a Text Model in Settings first', 400)
    return deps.textModel({
      model: settings.textModel,
      thinking: settings.thinking,
      seeding: {
        session: 'scenario-page',
        seed: settings.seedMode === 'fixed' ? settings.seed : randomSeed(),
      },
    })
  }

  /**
   * Writes a Scenario's file in the player's `scenarios/`, once it reads back as valid (the
   * Limits too), and answers with it as read back; or why it's refused.
   */
  async function saveScenario(id: string, sent: Scenario, status = 200): Promise<Response> {
    if (!deps.ownScenarios) return error("This server can't save Scenarios", 501)
    if (!SCENARIO_ID.test(id)) return error(`"${id}" isn't a Scenario id`, 400)
    const markdown = scenarioMarkdown(sent)
    let scenario: Scenario
    try {
      scenario = parseScenario(id, markdown)
    } catch (err) {
      return error(`The Scenario can't be saved: ${(err as Error).message}`, 400)
    }
    const limit = crossedLimit(scenarioText(scenario))?.message
    if (limit) return error(`The Scenario crosses a limit: ${limit}`, 422)
    await deps.ownScenarios.save(id, markdown)
    return json(scenario, status)
  }

  return [
    ['GET', new URLPattern({ pathname: '/api/scenarios' }), async () => {
      const { scenarios, errors } = await deps.scenarios.list()
      const own = new Set((await deps.ownScenarios?.list())?.scenarios.map((s) => s.id))
      return json({ scenarios: scenarios.map((s) => summarise(s, own.has(s.id))), errors })
    }],

    // Saves the Scenario page's Scenario over its file in the player's `scenarios/`.
    ['PUT', new URLPattern({ pathname: '/api/scenarios/:id' }), async (req, p) => {
      const scenario = sentScenario((await readJson(req) as { scenario?: unknown })?.scenario)
      if (scenario instanceof Response) return scenario
      // Made when the file was; changed now.
      const created = SCENARIO_ID.test(p.id!)
        ? (await deps.ownScenarios?.get(p.id!))?.created
        : undefined
      const now = new Date().toISOString()
      return await saveScenario(p.id!, { ...scenario, created: created ?? now, modified: now })
    }],

    // A new Scenario of the player's: the page's under a new id (from its title), or an imported
    // file's text (its id from the file name). Never in place of another.
    ['POST', new URLPattern({ pathname: '/api/scenarios' }), async (req) => {
      const body = await readJson(req) as
        | { scenario?: unknown; markdown?: unknown; name?: unknown }
        | undefined
      const now = new Date().toISOString()
      let scenario: Scenario
      let name: string
      if (typeof body?.markdown === 'string') {
        // An imported file keeps the dates it has.
        try {
          scenario = parseScenario('imported', body.markdown)
        } catch (err) {
          return error(`The Scenario can't be imported: ${(err as Error).message}`, 400)
        }
        scenario = {
          ...scenario,
          created: scenario.created ?? now,
          modified: scenario.modified ?? now,
        }
        name = typeof body.name === 'string' ? body.name.replace(/\.md$/i, '') : 'imported'
      } else {
        const sent = sentScenario(body?.scenario)
        if (sent instanceof Response) return sent
        scenario = { ...sent, created: now, modified: now }
        name = scenario.title
      }
      const base = personId(name).slice(0, 70) || 'scenario'
      const taken = new Set((await deps.scenarios.list()).scenarios.map((s) => s.id))
      let id = base
      for (let n = 2; taken.has(id) || await deps.ownScenarios?.has(id); n++) id = `${base}-${n}`
      return await saveScenario(id, scenario, 201)
    }],

    // Deletes one of the player's Scenarios.
    ['DELETE', new URLPattern({ pathname: '/api/scenarios/:id' }), async (_req, p) => {
      const own = deps.ownScenarios
      if (!own || !SCENARIO_ID.test(p.id!) || !(await own.has(p.id!))) {
        return error('Scenario not found', 404)
      }
      await own.remove(p.id!)
      return new Response(null, { status: 204 })
    }],

    ['GET', new URLPattern({ pathname: '/api/scenarios/:id' }), async (_req, p) => {
      const scenario = await deps.scenarios.get(p.id!)
      return scenario ? json(scenario) : error('Scenario not found', 404)
    }],

    // Expand, as the Scenario page opens (scenario/expand.ts): nothing is saved.
    ['POST', new URLPattern({ pathname: '/api/scenarios/expand' }), async (req) => {
      // A Scenario as it stands on the page (a Retry keeps its edits), its file, or a Brief.
      const body = await readJson(req) as
        | { scenario?: unknown; scenarioId?: unknown; brief?: unknown }
        | undefined
      const scenarioId = typeof body?.scenarioId === 'string' ? body.scenarioId : null
      const brief = typeof body?.brief === 'string' && body.brief.trim() ? body.brief.trim() : null
      let scenario: Scenario | undefined
      if (body?.scenario !== undefined) {
        const sent = sentScenario(body.scenario)
        if (sent instanceof Response) return sent
        scenario = sent
      } else {
        if (!scenarioId === !brief) return error('Give a scenario, a scenarioId or a brief', 400)
        const refused = brief && briefRefused(brief)
        if (refused) return refused
        scenario = scenarioId ? await deps.scenarios.get(scenarioId) : undefined
        if (scenarioId && !scenario) return error('Scenario not found', 404)
      }
      const model = await scenarioPageModel()
      if (model instanceof Response) return model
      try {
        // Retried once with a new seed, as a reply can still run away; the wording in
        // expand-request.md took the whitespace loops from 2 seeds in 8 to none in 32 (2026-11-03).
        const from = scenario ? { scenario } : { brief: brief! }
        return json(
          await withRetry(() => model.expandScenario(from, req.signal), req.signal, () => {}),
        )
      } catch (err) {
        return error(`Expand failed: ${(err as Error).message}`, 502)
      }
    }],

    // Suggest, on the Scenario page (scenario/suggest.ts): one suggestion for one blank part.
    ['POST', new URLPattern({ pathname: '/api/scenarios/suggest' }), async (req) => {
      const body = await readJson(req) as
        | { scenario?: unknown; field?: unknown; notes?: unknown }
        | undefined
      const scenario = sentScenario(body?.scenario)
      if (scenario instanceof Response) return scenario
      const field = typeof body?.field === 'string' ? body.field : ''
      if (!partOf(scenario, field)) return error('field must name a part of the Scenario', 400)
      const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
      const limit = notes && crossedLimit(notes)?.message
      if (limit) return error(`The notes cross a limit: ${limit}`, 422)
      const model = await scenarioPageModel()
      if (model instanceof Response) return model
      try {
        const text = await model.suggestForScenario({ scenario, field, notes }, req.signal)
        const crossed = crossedLimit(text)?.message
        if (crossed) return error(`The suggestion crossed a limit (${crossed}); ask again`, 422)
        return json({ text })
      } catch (err) {
        return error(`Suggest failed: ${(err as Error).message}`, 502)
      }
    }],
  ]
}
