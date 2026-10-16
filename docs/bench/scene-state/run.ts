/**
 * The scene-state bench (README.md): does a Roleplay's Character keep track of what's been set
 * many exchanges back (where things are, the light, the weather, the time, his mood) when it lives
 * only in the conversation (ADR 0007)? A scripted tavern Roleplay through the app's own engine,
 * in a scratch folder, the player as the traveller.
 *
 *   deno run -A docs/bench/scene-state/run.ts <seed> [scene]
 *
 * Writes `transcripts/<seed>.md` (or `<seed>-scene.md`): each Message and Reply, the probes marked
 * with what they test, and with `scene` the scene noted after each probe.
 */
import { fromFileUrl } from 'jsr:@std/path@^1.1.6'
import { dirScenarioLibrary } from '../../../server/scenario.ts'
import { dirSessionStore } from '../../../server/session.ts'
import { fileSettingsStore } from '../../../server/settings.ts'
import { chatTextModel } from '../../../server/textModel.ts'
import { chatRoleplayModel } from '../../../server/roleplay/model.ts'
import { connectionOf, textBackend } from '../../../server/text/backend.ts'
import { seededChat } from '../../../server/text/seeded.ts'
import { placeholderImageGenerator } from '../../../server/images/imageGenerator.ts'
import { beginRoleplay, sendMessage, writeCast } from '../../../server/roleplay/engine.ts'
import type { RoleplaySession } from '../../../server/roleplay/types.ts'
import { replySchema } from '../../../server/roleplay/prompt.ts'
import type { Chat } from '../../../server/text/chat.ts'

/** A Message, and what it tests when it's a probe: what the reply should still hold. */
type Step = [message: string, probe?: string]

const SCRIPT: Step[] = [
  // Facts, set early.
  ['I hang my soaked cloak on the hook beside the fire, then take a stool at the bar.'],
  ["I bolt the front door myself and slip its key into my pocket. \"No one follows me in.\""],
  ['I lean over and blow out the oil lamp on the bar. "The fire gives light enough."'],
  ['I tilt my head. "Listen. The rain has stopped. The storm has blown itself out."'],
  ['The clock above the bar strikes twelve. "Midnight. Your letter came late."'],
  ['"That letter is from your brother, Kael. He was hanged in Dover a week ago."'],
  // Time passes.
  ['We talk on through the night, of him and of the smuggling, until grey dawn light creeps in at the window.'],
  ['"Tell me about the harbour in the old days. Was it always this quiet?"'],
  ['"What did a barrel of French brandy fetch back then?"'],
  ['"Do you know any of the old sea songs? Sing me one."'],
  ['"Where did you learn to fight like that? Those scars weren\'t from carrying barrels."'],
  ['"Who owns this tavern, truly? You, or someone in London?"'],
  ['"How many ships still run the coast at night?"'],
  ['"Is the revenue man in town honest, or can he be bought?"'],
  ['"Where would a stranger sleep in this town, if not here?"'],
  ['"What do you make of me, honestly? Speak plainly."'],
  ['"If I paid you to sail with me, would you?"'],
  ['"Tell me one good thing you remember from before."'],
  // Probes: each leans on a fact without restating it.
  ['I get up and go to the front door to leave.', 'the door is bolted and its key in her pocket'],
  ['I reach for my cloak.', 'the cloak is on the hook by the fire (and dry by now)'],
  ['I look about the room. "It looks different now."', 'the lamp is out; it is dawn, grey light'],
  ['"Is it still raining out there?"', 'the rain stopped at midnight'],
  ['"What hour do you make it?"', 'early morning, dawn after a night of talk'],
  ['"Do you still think of him?"', 'his brother, hanged: grief or anger, not cheer'],
  // More time passes.
  ['We doze in our chairs by the fire. When I wake, the sun is high and the room is warm.'],
  ['"Is it night already?"', 'midday: the sun is high'],
  ['"Will you open the tavern today?"', 'the door is still bolted; it is day; the news of his brother'],
]

/**
 * The `scene` variant: each Reply also writes the scene as it stands (first, before the Reply's
 * own fields), and the next Message is sent with the scene last noted. Only the bench's chat
 * changes; the app's engine and prompts are as they are.
 */
function withScene(chat: Chat): Chat & { scenes: string[] } {
  const scenes: string[] = []
  return {
    scenes,
    get model() {
      return chat.model
    },
    get thinks() {
      return chat.thinks
    },
    async stream(call) {
      if (call.job !== 'reply') return chat.stream(call)
      const messages = [...call.messages]
      const last = messages.at(-1)!
      const noted = scenes.at(-1) ?? '(none yet: note it from the story so far)'
      messages[messages.length - 1] = {
        ...last,
        content: `${last.content}\n\n[The scene as you last noted it: ${noted}]`,
      }
      const schema = replySchema() as { properties: object; required: string[] }
      const result = await chat.stream({
        ...call,
        messages,
        schema: {
          ...schema,
          properties: {
            scene: {
              type: 'string',
              description: 'the scene after this reply, as short facts: the place, the time of ' +
                'day, the weather, the light, where everyone is, the things that matter and ' +
                'where they are (doors, keys, clothes), the character\'s mood. Start from the ' +
                'scene as last noted, keep what still holds word for word, change only what ' +
                'the story has changed; and keep the reply true to it',
            },
            ...schema.properties,
          },
          required: ['scene', ...schema.required],
        },
      })
      try {
        const scene = JSON.parse(result.content).scene
        if (typeof scene === 'string' && scene.trim()) scenes.push(scene.trim())
      } catch { /* the reply is parsed as usual; the scene stays as last noted */ }
      return result
    },
  }
}

const settings = await fileSettingsStore(new URL('../../../settings.json', import.meta.url)).load()
const scenario = (await dirScenarioLibrary(new URL('../../../scenarios/', import.meta.url))
  .get('tavern'))!

async function run(seed: number, scene: boolean) {
  const root = await Deno.makeTempDir({ prefix: 'scene-state-' })
  try {
    const store = dirSessionStore(root)
    const plain = seededChat(
      textBackend(connectionOf(settings), () => Promise.resolve('')).chat(settings.textModel, false),
      { session: `scene-state-${seed}`, seed },
    )
    const noting = scene ? withScene(plain) : null
    const chat = noting ?? plain
    const deps = {
      store,
      roleplayModel: chatRoleplayModel(chat),
      textModel: chatTextModel(chat),
      imageGenerator: placeholderImageGenerator(),
    }
    let session: RoleplaySession = {
      id: 'bench',
      kind: 'roleplay',
      brief: null,
      scenarioId: scenario.id,
      settings,
      seed,
      createdAt: new Date().toISOString(),
      cast: null,
      frames: [],
    }
    await store.save(session)
    const signal = () => AbortSignal.timeout(300_000)
    session = await writeCast(deps, session, scenario, () => {}, signal())
    session = await beginRoleplay(deps, session, () => {}, signal())
    const lines = [
      `# Scene state, seed ${seed}${scene ? ', with a noted scene' : ''} (${settings.textModel})`,
      '',
      `**Opening**: ${replyText(session.frames[0].reply)}`,
    ]
    const start = performance.now()
    for (const [i, [message, probe]] of SCRIPT.entries()) {
      const next = await sendMessage(deps, session, message, () => {}, signal())
      if (!next) {
        lines.push('', `## ${i + 1}. ${message}`, '', '(declined)')
        continue
      }
      session = next
      lines.push(
        '',
        `## ${i + 1}. ${message}`,
        ...(probe ? ['', `*Probe: ${probe}*`] : []),
        '',
        replyText(session.frames.at(-1)!.reply),
        ...(probe && noting ? ['', `> Scene noted: ${noting.scenes.at(-1)}`] : []),
      )
      console.log(`${i + 1}/${SCRIPT.length}`)
    }
    lines.push('', `${SCRIPT.length} exchanges in ${Math.round((performance.now() - start) / 1000)} s.`)
    const out = fromFileUrl(new URL(`./transcripts/${seed}${scene ? '-scene' : ''}.md`, import.meta.url))
    await Deno.mkdir(fromFileUrl(new URL('./transcripts/', import.meta.url)), { recursive: true })
    await Deno.writeTextFile(out, lines.join('\n') + '\n')
    console.log(out)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

const replyText = (r: { internal: string; actions: string; dialogue: string }) =>
  `*(${r.internal})* ${r.actions} "${r.dialogue}"`

await run(Number(Deno.args[0] ?? 1), Deno.args[1] === 'scene')
