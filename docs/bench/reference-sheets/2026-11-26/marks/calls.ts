/**
 * The Art Agent's picture call (`artFrameMessages`), as the app sends it, straight to Ollama over
 * seeds, printing each reply's expression and clothing sentences, and whether it ended in
 * whitespace or failed (AGENTS.md): run once with `shared/each-person.md` as it was and once as
 * changed, to see where marks on a face are written.
 *
 *   deno run -A calls.ts <session folder> <frame index> <seeds, e.g. 1-8>
 *
 * The Session's own Text Model (MODEL, if set, in its place), Thinking off.
 */
import { artFrameMessages, artFrameSchema } from '../../../../../server/roleplay/art.ts'
import { ollamaChat } from '../../../../../server/text/ollama/ollama.ts'

const [source, index, range] = Deno.args
const [from, to] = range.split('-').map(Number)
const session = JSON.parse(await Deno.readTextFile(`${source}/session.json`))
const messages = await artFrameMessages(session, Number(index))

for (let seed = from; seed <= to; seed++) {
  const start = performance.now()
  try {
    const { content } = await ollamaChat(Deno.env.get('MODEL') ?? session.settings.textModel).stream({
      messages,
      schema: artFrameSchema,
      maxTokens: 1600, // MAX_TOKENS.art in server/roleplay/model.ts (not exported)
      job: 'picture',
      seed,
      signal: AbortSignal.timeout(300_000),
    })
    const seconds = ((performance.now() - start) / 1000).toFixed(1)
    const reply = JSON.parse(content)
    console.log(JSON.stringify({
      seed,
      seconds,
      ws: /\s{20,}$/.test(content),
      expression: reply.expression,
      clothing: reply.clothing,
    }))
  } catch (err) {
    console.log(JSON.stringify({ seed, failed: (err as Error).message.slice(0, 160) }))
  }
}
