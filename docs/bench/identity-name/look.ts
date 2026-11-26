/**
 * The Roleplay's Look call as the app sends it (`artLookMessages`, the app's own Ollama client),
 * straight to Ollama over seeds, with `shared/identity.md` asking for the identity without the
 * name: does the model still write the name in (which `parseLook` takes off), and does any reply
 * end in whitespace or run to its cap (AGENTS.md)?
 *
 *   deno run -A look.ts <session folder> <seeds, e.g. 1-8> [text model]
 *
 * The Session's own Text Model and Thinking, unless a Text Model is given. Prints counts only:
 * the Sessions are private (AGENTS.md).
 */
import { artLookMessages, parseRoleplayLook, roleplayLookSchema } from '../../../server/roleplay/art.ts'
import { ollamaChat } from '../../../server/text/ollama/ollama.ts'
import { composePrompt } from '../../../server/look.ts'

const [folder, range, model] = Deno.args
const session = JSON.parse(await Deno.readTextFile(`${folder}/session.json`))
const [from, to] = range.split('-').map(Number)
const textModel = model ?? session.settings.textModel
const chat = ollamaChat(textModel, { think: session.settings.thinking })
const startsWith = (name: string, text: string) => text.trim().toLowerCase().startsWith(name.toLowerCase())

for (let seed = from; seed <= to; seed++) {
  const messages = await artLookMessages(session, session.scenario)
  const start = performance.now()
  let content: string
  try {
    // The Look's cap, `MAX_TOKENS.art` in server/roleplay/model.ts (not exported).
    content = (await chat.stream({ messages, schema: roleplayLookSchema, job: 'look', maxTokens: 1600, seed, signal: AbortSignal.timeout(300_000) })).content
  } catch (err) {
    console.log(JSON.stringify({ seed, failed: (err as Error).message.slice(0, 120) }))
    continue
  }
  const seconds = Number(((performance.now() - start) / 1000).toFixed(1))
  const raw = JSON.parse(content).people as { name: string; identity: string }[]
  const look = parseRoleplayLook(JSON.parse(content))
  const named = (p: { name: string; identity: string }) => startsWith(p.name, p.identity)
  console.log(JSON.stringify({
    seed,
    seconds,
    ws: /\s{20,}$/.test(content),
    people: look.subjects.length,
    nameWritten: raw.filter(named).length,
    // Each identity in a picture of everyone: starts with its name, every time.
    namedInPrompt: look.subjects.filter((p) =>
      composePrompt(look, 'x', [p.name]).startsWith(`${p.name.charAt(0).toUpperCase()}${p.name.slice(1)}, `)
    ).length,
  }))
}
