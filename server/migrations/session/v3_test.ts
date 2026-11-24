import { assertEquals } from '@std/assert'
import type { V2 } from './v2.ts'
import { v3 } from './v3.ts'

const chain = (extra: Partial<V2> = {}): V2 => ({
  id: 's1',
  kind: 'chain',
  brief: null,
  scenarioId: 'tavern',
  settings: {
    textModel: 'gemma',
    thinking: false,
    imageModel: 'qwen',
    steps: 8,
    musicBehaviour: 'story',
    musicTaste: '',
  },
  seed: 1,
  createdAt: '2026-11-24T00:00:00.000Z',
  frames: [],
  ...extra,
} as V2)

const scenario = {
  id: 'tavern',
  title: 'The Rain-Soaked Tavern',
  description: '',
  opening: '',
  place: '',
  time: '',
  style: '',
  music: '',
  truths: [],
  people: [],
}

Deno.test("v3 titles a Session from a Scenario with the Scenario's title", () => {
  assertEquals(v3(chain({ scenario })).title, 'The Rain-Soaked Tavern')
})

Deno.test('v3 titles a Session from a Brief with its start, as the app showed it', () => {
  assertEquals(v3(chain({ scenarioId: null, brief: 'A storm at sea.' })).title, 'A storm at sea.')
  const long = 'A lighthouse keeper in a winter storm; I wash up at her door, half drowned.'
  assertEquals(
    v3(chain({ scenarioId: null, brief: long })).title,
    'A lighthouse keeper in a winter storm; I wash up at her d…',
  )
})

Deno.test("v3 falls back to the Scenario's id when it kept no copy", () => {
  assertEquals(v3(chain()).title, 'tavern')
})

Deno.test('v3 leaves the rest of the Session as it was', () => {
  const { title, ...rest } = v3(chain({ scenario }))
  assertEquals(title, 'The Rain-Soaked Tavern')
  assertEquals(rest, chain({ scenario }))
})
