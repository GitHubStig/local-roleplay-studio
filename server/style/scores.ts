/**
 * How varied each Image Model's art style is across a Session's Frames, for the Compare dialog: from
 * the pictures' embeddings (`embedder.ts`), kept in the Session's `style.json` so each picture is
 * embedded once. Measured on the Frames every compared model pictured, against a base Frame the
 * player picks (the one without a style of its own, often the first or the last).
 * docs/research/style-scores.md says how the measures were chosen.
 */
import { frameName } from '../frames.ts'
import { join } from '@std/path'
import type { Session } from '../session.ts'
import { pickedVersion } from '../pictures.ts'
import { decodeVector, type Embeddings } from './embedder.ts'

/** A Session's embeddings so far: each picture's by file name, each caption's by its text. */
export interface StyleCache {
  csd: Record<string, string>
  clip: Record<string, string>
  texts: Record<string, string>
}

export const STYLE_FILE = 'style.json'

export async function loadStyleCache(dir: string): Promise<StyleCache | null> {
  try {
    return JSON.parse(await Deno.readTextFile(join(dir, STYLE_FILE)))
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null
    throw err
  }
}

/** Saves the cache with only what the Session still has: a picture made again drops the old. */
export async function saveStyleCache(dir: string, session: Session, cache: StyleCache) {
  const files = new Set(picturesOf(session).map((p) => p.image))
  const texts = new Set(session.frames.map((f) => captionOf(session, f.index)))
  const keep = (from: Record<string, string>, wanted: Set<string | undefined>) =>
    Object.fromEntries(Object.entries(from).filter(([k]) => wanted.has(k)))
  const kept: StyleCache = {
    csd: keep(cache.csd, files),
    clip: keep(cache.clip, files),
    texts: keep(cache.texts, texts),
  }
  const path = join(dir, STYLE_FILE)
  await Deno.writeTextFile(`${path}.tmp`, JSON.stringify(kept))
  await Deno.rename(`${path}.tmp`, path)
}

/** Adds new embeddings, by the file names the paths end in. */
export function withEmbeddings(cache: StyleCache | null, add: Embeddings): StyleCache {
  const next: StyleCache = {
    csd: { ...cache?.csd },
    clip: { ...cache?.clip },
    texts: { ...cache?.texts, ...add.texts },
  }
  for (const [path, { csd, clip }] of Object.entries(add.images)) {
    const file = path.split(/[\\/]/).at(-1)!
    next.csd[file] = csd
    next.clip[file] = clip
  }
  return next
}

/**
 * What a Frame shows, as its picture's caption in the Compare dialog: a Chain Frame's Narration, a
 * Storyboard Frame's Beat, a Roleplay Reply's actions.
 */
export function captionOf(session: Session, index: number): string | undefined {
  const frame = session.frames[index]
  if (!frame) return undefined
  const text = session.kind === 'chain'
    ? session.frames[index].narration
    : session.kind === 'storyboard'
    ? session.frames[index].beat
    : session.frames[index].reply.actions
  return text?.trim() || undefined
}

/** Every picture in the Session, by Frame and Image Model (each model's first, if it made two). */
export function picturesOf(session: Session) {
  return session.frames.flatMap((f) =>
    [...new Set(f.pictures.map((p) => p.imageModel))].map((model) => ({
      frame: f.index,
      model,
      // The version it shows (ADR 0021): an edit is scored as the picture it now is.
      image: pickedVersion(f.pictures.find((p) => p.imageModel === model)!).image,
    }))
  )
}

/** What's left to embed: pictures and captions the cache hasn't got. */
export function unembedded(session: Session, cache: StyleCache | null) {
  const images = picturesOf(session).map((p) => p.image).filter((f) => !cache?.csd[f])
  const texts = [
    ...new Set(
      session.frames.map((f) => captionOf(session, f.index)).filter((t) => t !== undefined),
    ),
  ].filter((t) => !cache?.texts[t])
  return { images, texts }
}

/** One Image Model's scores. Distances are 1 − cosine similarity: 0 for the same, up to 2. */
export interface ModelStyleScores {
  model: string
  /** The average distance between any two of its pictures: how far apart its styles are. */
  spread: number
  /** The average distance of its pictures from its picture of the base Frame. */
  fromBase: number
  /**
   * How many distinct styles its pictures amount to (the Vendi score): 1 if they're all alike, up
   * to the number of Frames if every one is its own.
   */
  styles: number
  /**
   * How often a picture is nearer its own Frame's caption than any other compared Frame's (CLIP),
   * and how often among the nearest three; absent when the Frames have no captions to tell apart.
   */
  matches?: { first: number; topThree: number }
  /** Per compared Frame: its picture's distance from the base Frame's (0 for the base). */
  fromBaseByFrame: number[]
  /** Per compared Frame: where its own caption ranks among the Frames' (1 is nearest). */
  captionRank?: number[]
}

export interface StyleScores {
  base: number
  /** The Frames compared: those every compared model pictured, in order. */
  frames: number[]
  models: ModelStyleScores[]
  /** Pictures and captions not embedded yet: scoring again would take them in. */
  unembedded: number
}

export class StyleScoreError extends Error {}

/**
 * The scores for `models` (every Image Model with a picture if left out) against Frame `base`, on
 * the Frames all of them pictured. Throws a StyleScoreError when there's nothing to compare.
 */
export function styleScores(
  session: Session,
  cache: StyleCache,
  base: number,
  models?: readonly string[],
): StyleScores {
  const pictures = picturesOf(session).filter((p) => cache.csd[p.image] && cache.clip[p.image])
  const compared = models ?? [...new Set(pictures.map((p) => p.model))]
  const pictureOf = (frame: number, model: string) =>
    pictures.find((p) => p.frame === frame && p.model === model)
  const frames = session.frames.map((f) => f.index).filter((i) =>
    compared.every((m) => pictureOf(i, m))
  )
  if (!compared.length) throw new StyleScoreError('No pictures have been scored yet')
  if (frames.length < 2) {
    throw new StyleScoreError('Fewer than two Frames have a scored picture by every model')
  }
  if (!frames.includes(base)) {
    throw new StyleScoreError(`${frameName(base)} hasn't a scored picture by every model`)
  }
  const captions = frames.map((i) => captionOf(session, i))
  const captionVectors = captions.every((c) => c && cache.texts[c]) &&
      new Set(captions).size > 1
    ? captions.map((c) => decodeVector(cache.texts[c!]))
    : null
  const b = frames.indexOf(base)
  return {
    base,
    frames,
    models: compared.map((model) => {
      const files = frames.map((i) => pictureOf(i, model)!.image)
      const csd = files.map((f) => decodeVector(cache.csd[f]))
      const similar = csd.map((x) => csd.map((y) => dot(x, y)))
      const fromBaseByFrame = similar[b].map((s) => round(1 - s))
      const scores: ModelStyleScores = {
        model,
        spread: round(mean(pairs(frames.length).map(([i, j]) => 1 - similar[i][j]))),
        fromBase: round(mean(fromBaseByFrame.filter((_, i) => i !== b))),
        styles: round(vendi(similar)),
        fromBaseByFrame,
      }
      if (captionVectors) {
        const clip = files.map((f) => decodeVector(cache.clip[f]))
        const captionRank = clip.map((x, i) => {
          const own = dot(x, captionVectors[i])
          return 1 + captionVectors.filter((c, j) => j !== i && dot(x, c) > own).length
        })
        scores.matches = {
          first: round(mean(captionRank.map((r) => r === 1 ? 1 : 0))),
          topThree: round(mean(captionRank.map((r) => r <= 3 ? 1 : 0))),
        }
        scores.captionRank = captionRank
      }
      return scores
    }),
    unembedded: 0,
  }
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const round = (x: number) => Math.round(x * 1000) / 1000
const pairs = (n: number) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + k + 1]))
    .flat()

/**
 * The Vendi score of a similarity matrix (Friedman and Dieng, 2023): the exponential of the
 * entropy of its eigenvalues, scaled to sum to 1. The effective number of distinct items.
 */
export function vendi(similar: number[][]): number {
  const n = similar.length
  const eigen = symmetricEigenvalues(similar.map((row) => row.map((s) => s / n)))
  return Math.exp(-eigen.filter((l) => l > 1e-12).reduce((s, l) => s + l * Math.log(l), 0))
}

/** The eigenvalues of a small symmetric matrix, by Jacobi rotations. */
export function symmetricEigenvalues(matrix: number[][]): number[] {
  const a = matrix.map((row) => [...row])
  const n = a.length
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2
    if (off < 1e-20) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const [akp, akq] = [a[k][p], a[k][q]]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const [apk, aqk] = [a[p][k], a[q][k]]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
      }
    }
  }
  return a.map((row, i) => row[i])
}
