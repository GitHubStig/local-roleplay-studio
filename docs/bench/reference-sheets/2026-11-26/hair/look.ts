/**
 * The Roleplay's Look call (`artLookMessages`, the app's own messages and Ollama client), sent
 * straight to Ollama over seeds, with the identity wording as it is (`shared/identity.md`) or with
 * another one in its place: does the Look's writer fix how each person's hair is worn when the
 * Scenario leaves it vague, and does any reply end in whitespace (AGENTS.md)?
 *
 *   deno run -A look.ts <session folder> <old|new|facts> <seeds, e.g. 1-8> [--print|--hair]
 *
 * `new` swaps in `identity-new.md`; `facts` does, and adds the Scenario's Truths and facts
 * (`withNotes`), as a Storyboard's plan has them.
 *
 * It uses the Session's own Text Model and Thinking, as the app would. Prints, per seed, whether
 * the reply ended in whitespace or was cut off at its cap, and who it names; with --print, each
 * identity too, with --hair only the clause naming each one's hair (only for public Scenarios: a
 * private one's text stays out of the repo).
 */
import { artLookMessages, parseRoleplayLook, roleplayLookSchema } from '../../../../../server/roleplay/art.ts'
import { ollamaChat } from '../../../../../server/text/ollama/ollama.ts'
import { loadPrompt } from '../../../../../server/promptFiles.ts'
import { withNotes } from '../../../../../server/promptParts.ts'

/** The wording tried in place of `shared/identity.md`'s. */
export const NEW_IDENTITY = await Deno.readTextFile(new URL('./identity-new.md', import.meta.url))
  .then((t) => t.replace(/<!--[\s\S]*?-->/g, '').trim())

const [folder, variant, range, flag] = Deno.args
const session = JSON.parse(await Deno.readTextFile(`${folder}/session.json`))
const [from, to] = range.split('-').map(Number)
const old = (await loadPrompt('shared/identity')).trim()
const chat = ollamaChat(session.settings.textModel, { think: session.settings.thinking })

for (let seed = from; seed <= to; seed++) {
  const messages = await artLookMessages(session, session.scenario)
  if (variant !== 'old') {
    if (!messages[0].content.includes(old)) throw new Error("The identity wording isn't in the prompt")
    messages[0].content = messages[0].content.replace(old, NEW_IDENTITY)
  }
  // `facts`: and the Scenario's Truths and what it states (its People's Looks among them), as a
  // Storyboard's plan is given them (`withNotes`).
  if (variant === 'facts') messages[0].content = await withNotes(messages[0].content, session.scenario, true)
  const start = performance.now()
  let reply: { content: string }
  try {
    reply = await chat.stream({
      messages,
      schema: roleplayLookSchema,
      job: 'look',
      // The Look's cap, `MAX_TOKENS.art` in server/roleplay/model.ts (not exported).
      maxTokens: 1600,
      seed,
      signal: AbortSignal.timeout(300_000),
    })
  } catch (err) {
    // A reply cut off at its cap: how a runaway of whitespace shows.
    console.log(JSON.stringify({ seed, failed: (err as Error).message.slice(0, 120) }))
    continue
  }
  const seconds = ((performance.now() - start) / 1000).toFixed(1)
  const ws = /\s{20,}$/.test(reply.content)
  let people: { name: string; identity: string }[] = []
  try {
    people = parseRoleplayLook(JSON.parse(reply.content)).subjects
  } catch (err) {
    console.log(`seed ${seed}: unparsed (${(err as Error).message}), ${seconds} s`)
    continue
  }
  console.log(JSON.stringify({ seed, seconds, ws, people: flag === '--print' ? people : people.map((p) => p.name) }))
  if (flag === '--hair') {
    for (const p of people) console.log(`  ${p.name}: ${hairOf(p.identity)}`)
  }
}

/** The hair phrase of an identity: the clause naming hair, for counting how it's worn. */
function hairOf(identity: string): string {
  const clause = identity.split(/,|;| and (?=[a-z]+ )/).find((c) => /hair|bald|braid|bun|plait|ponytail/i.test(c))
  return clause?.trim() ?? '(no hair named)'
}
