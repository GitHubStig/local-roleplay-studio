/**
 * The other calls that include `shared/identity.md`, as the app sends them now, straight to Ollama
 * over seeds, for a reply ending in whitespace or cut off at its cap (AGENTS.md): a Storyboard's
 * plan from a Scenario, and the Art Agent's picture call for a Roleplay's Frame (whose newcomers'
 * identities follow it).
 *
 *   deno run -A calls.ts plan <scenario.md> <frames> <seeds, e.g. 1-8>
 *   deno run -A calls.ts frame <session folder> <frame index> <seeds>
 *
 * Settings' Text Model, Thinking off, as the app's defaults on this Mac.
 */
import { storyboardPlanMessages, storyboardPlanSchema } from '../../../../../server/storyboard/text.ts'
import { planTokens } from '../../../../../server/textModel.ts'
import { artFrameMessages, artFrameSchema } from '../../../../../server/roleplay/art.ts'
import { ollamaChat } from '../../../../../server/text/ollama/ollama.ts'
import { parseScenario } from '../../../../../server/scenario.ts'

const [kind, source, count, range] = Deno.args
const settings = JSON.parse(await Deno.readTextFile('settings.json'))
const [from, to] = range.split('-').map(Number)

for (let seed = from; seed <= to; seed++) {
  let messages, schema, maxTokens, model
  if (kind === 'plan') {
    const scenario = parseScenario('bench', await Deno.readTextFile(source))
    const m = await storyboardPlanMessages({ scenario, frameCount: Number(count) })
    messages = [{ role: 'system' as const, content: m.system }, { role: 'user' as const, content: m.user }]
    schema = storyboardPlanSchema(Number(count))
    maxTokens = planTokens(Number(count))
    model = settings.textModel
  } else {
    const session = JSON.parse(await Deno.readTextFile(`${source}/session.json`))
    messages = await artFrameMessages(session, Number(count))
    schema = artFrameSchema
    maxTokens = 1600 // MAX_TOKENS.art in server/roleplay/model.ts (not exported)
    model = session.settings.textModel
  }
  const start = performance.now()
  try {
    const { content } = await ollamaChat(model).stream({
      messages,
      schema,
      maxTokens,
      job: kind,
      seed,
      signal: AbortSignal.timeout(300_000),
    })
    const seconds = ((performance.now() - start) / 1000).toFixed(1)
    const parsed = JSON.parse(content)
    console.log(JSON.stringify({ seed, seconds, ws: /\s{20,}$/.test(content), identities: identities(parsed) }))
  } catch (err) {
    console.log(JSON.stringify({ seed, failed: (err as Error).message.slice(0, 160) }))
  }
}

/** Every identity anywhere in a reply (a plan's Look, a picture call's newcomers). */
function identities(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(identities)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([k, v]) => k === 'identity' && typeof v === 'string' ? [v] : identities(v))
}
