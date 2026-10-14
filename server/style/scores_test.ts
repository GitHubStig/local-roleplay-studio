import { assertAlmostEquals, assertEquals, assertThrows } from '@std/assert'
import type { ChainSession } from '../session.ts'
import { promptWith } from '../testing.ts'
import {
  captionOf,
  type StyleCache,
  StyleScoreError,
  styleScores,
  symmetricEigenvalues,
  unembedded,
  vendi,
  withEmbeddings,
} from './scores.ts'

/** A vector as the cache keeps it: unit length, base64 of float32. */
const encode = (v: number[]) => {
  const n = Math.hypot(...v)
  const bytes = new Uint8Array(new Float32Array(v.map((x) => x / n)).buffer)
  return btoa(String.fromCharCode(...bytes))
}

/** A Chain whose Frames each change the art style, pictured by `models`. */
function chain(captions: string[], models: string[]): ChainSession {
  return {
    id: 'style-test',
    kind: 'chain',
    brief: 'A tavern',
    scenarioId: null,
    settings: {} as ChainSession['settings'],
    seed: 1,
    createdAt: '2026-10-14T00:00:00.000Z',
    frames: captions.map((narration, index) => ({
      index,
      action: index ? narration : null,
      narration,
      outcome: 'done' as const,
      prompt: promptWith(`pose ${index}`),
      pictures: models.map((imageModel) => ({
        image: `frame-${index}-${imageModel}.png`,
        imageModel,
      })),
      createdAt: '2026-10-14T00:00:00.000Z',
    })),
  }
}

Deno.test('symmetricEigenvalues finds a small matrix’s eigenvalues', () => {
  const values = symmetricEigenvalues([[2, 1], [1, 2]]).sort()
  assertAlmostEquals(values[0], 1, 1e-9)
  assertAlmostEquals(values[1], 3, 1e-9)
})

Deno.test('vendi: alike pictures count as one style, unrelated ones as one each', () => {
  assertAlmostEquals(vendi([[1, 1, 1], [1, 1, 1], [1, 1, 1]]), 1, 1e-9)
  assertAlmostEquals(vendi([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 3, 1e-9)
})

Deno.test('styleScores: a model whose styles differ scores higher than one that keeps its own', () => {
  const session = chain(['A fresco', 'Pixel art', 'Ink wash'], ['varied', 'samey'])
  // The varied model's three pictures point three different ways; the samey model's nearly one.
  const csd: Record<string, string> = {
    'frame-0-varied.png': encode([1, 0, 0]),
    'frame-1-varied.png': encode([0, 1, 0]),
    'frame-2-varied.png': encode([0, 0, 1]),
    'frame-0-samey.png': encode([1, 0, 0]),
    'frame-1-samey.png': encode([1, 0.1, 0]),
    'frame-2-samey.png': encode([1, 0, 0.1]),
  }
  // CLIP puts each varied picture on its own caption; every samey one on the fresco's.
  const clip: Record<string, string> = {
    ...Object.fromEntries(Object.entries(csd).filter(([f]) => f.includes('varied'))),
    'frame-0-samey.png': encode([1, 0, 0]),
    'frame-1-samey.png': encode([1, 0, 0]),
    'frame-2-samey.png': encode([1, 0, 0]),
  }
  const texts = {
    'A fresco': encode([1, 0, 0]),
    'Pixel art': encode([0, 1, 0]),
    'Ink wash': encode([0, 0, 1]),
  }
  const scores = styleScores(session, { csd, clip, texts }, 0)
  const [varied, samey] = scores.models
  assertEquals(scores.frames, [0, 1, 2])
  assertEquals(varied.spread, 1)
  assertEquals(varied.fromBaseByFrame, [0, 1, 1])
  assertAlmostEquals(varied.styles, 3, 1e-3)
  assertEquals(varied.matches, { first: 1, topThree: 1 })
  assertEquals(samey.spread < 0.01, true)
  assertAlmostEquals(samey.styles, 1, 0.05)
  assertEquals(samey.captionRank, [1, 2, 2])
  assertEquals(samey.matches?.first, 0.333)
})

Deno.test('styleScores compares only the Frames every model pictured, and needs the base among them', () => {
  const session = chain(['A', 'B', 'C'], ['one', 'two'])
  session.frames[2].pictures = session.frames[2].pictures.slice(0, 1)
  const v = encode([1, 0])
  const pictures = Object.fromEntries(
    session.frames.flatMap((f) => f.pictures.map((p) => [p.image, v])),
  )
  const cache: StyleCache = { csd: pictures, clip: pictures, texts: {} }
  const scores = styleScores(session, cache, 1)
  assertEquals(scores.frames, [0, 1])
  // No captions embedded: nothing to match against.
  assertEquals(scores.models[0].matches, undefined)
  assertThrows(() => styleScores(session, cache, 2), StyleScoreError)
  assertEquals(styleScores(session, cache, 2, ['one']).frames, [0, 1, 2])
})

Deno.test('unembedded lists the pictures and captions the cache lacks, and withEmbeddings adds them by file name', () => {
  const session = chain(['A fresco', 'Pixel art'], ['m'])
  const todo = unembedded(session, null)
  assertEquals(todo, {
    images: ['frame-0-m.png', 'frame-1-m.png'],
    texts: ['A fresco', 'Pixel art'],
  })
  const v = encode([1])
  const cache = withEmbeddings(null, {
    images: { '/sessions/x/frame-0-m.png': { csd: v, clip: v } },
    texts: { 'A fresco': v },
  })
  assertEquals(unembedded(session, cache), { images: ['frame-1-m.png'], texts: ['Pixel art'] })
  assertEquals(captionOf(session, 1), 'Pixel art')
})
