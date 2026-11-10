import { assertEquals, assertRejects } from '@std/assert'
import type { Chat } from './text/chat.ts'
import { chatTextModel } from './textModel.ts'
import { testScenario } from './testing.ts'

/** A Chat that streams `content` in small pieces, as a backend does. */
const streamingChat = (content: string): Chat => ({
  model: 'm',
  thinks: false,
  stream: (call) => {
    for (let i = 0; i < content.length; i += 50) call.onContent?.(content.slice(i, i + 50))
    return Promise.resolve({ content, thinking: '' })
  },
})

Deno.test('a Storyboard plan that runs on inside one part is stopped there', async () => {
  const beat = (line: string) => JSON.stringify({ beat: line, shown: [] })
  const start = `{"look": {"people": [], "style": "Ink."}, "beats": [${beat('One')}, `
  const req = { scenario: testScenario, frameCount: 2 }
  const signal = new AbortController().signal
  const beats: string[] = []
  const plan = await chatTextModel(streamingChat(`${start}${beat('Two')}]}`))
    .planStoryboard(req, signal, { beat: (i, b) => beats.push(`${i}: ${b.beat}`) })
  assertEquals(plan.beats.map((b) => b.beat), ['One', 'Two'])
  assertEquals(beats, ['0: One', '1: Two'])

  const runaway = `${start}{"beat": "a${' '.repeat(10_000)}`
  await assertRejects(
    () => chatTextModel(streamingChat(runaway)).planStoryboard(req, signal),
    Error,
    'ran on while writing Beat 2',
  )
})
