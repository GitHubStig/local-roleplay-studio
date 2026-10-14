/**
 * How varied each Image Model's art style is across a Session's Frames, as the server measures it
 * (`server/style/scores.ts`): shown as charts in the Compare dialog, each under a description of
 * what it measures. docs/research/style-scores.md says how the measures were chosen.
 */

/** One Image Model's scores. Distances are 1 − cosine similarity: 0 for the same, up to 2. */
export interface ModelStyleScores {
  /** The Image Model's id. */
  model: string
  spread: number
  fromBase: number
  styles: number
  matches?: { first: number; topThree: number }
  /** Per compared Frame: its picture's distance from the base Frame's (0 for the base). */
  fromBaseByFrame: number[]
  /** Per compared Frame: where its own caption ranks among the Frames' (1 is nearest). */
  captionRank?: number[]
}

export interface StyleScores {
  /** The base Frame's index. */
  base: number
  /** The Frames compared (indexes): those every compared model pictured. */
  frames: number[]
  models: ModelStyleScores[]
  /** Pictures and captions not embedded yet: scoring again would take them in. */
  unembedded: number
}

/** A measure as the charts show it: its name, what it means, and its value for a model. */
export interface StyleMeasure {
  id: 'spread' | 'fromBase' | 'styles' | 'matches'
  name: string
  description: string
  value: (m: ModelStyleScores) => number | undefined
  /** How a value is written. */
  format: (v: number) => string
}

const decimal = (v: number) => v.toFixed(2)
const percent = (v: number) => `${Math.round(v * 100)}%`

export const STYLE_MEASURES: readonly StyleMeasure[] = [
  {
    id: 'spread',
    name: 'Spread',
    description:
      "The average difference in style between any two of a model's pictures, from 0 (all alike). Higher: its styles vary more from Frame to Frame.",
    value: (m) => m.spread,
    format: decimal,
  },
  {
    id: 'fromBase',
    name: 'Away from the base Frame',
    description:
      "How far, on average, a model's pictures moved in style from its picture of the base Frame. Low: it keeps drifting back to the base's look.",
    value: (m) => m.fromBase,
    format: decimal,
  },
  {
    id: 'styles',
    name: 'Distinct styles',
    description:
      "How many really different styles a model's pictures amount to (the Vendi score): 1 if they all look alike, up to one per Frame.",
    value: (m) => m.styles,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'matches',
    name: 'Matches its Frame',
    description:
      "How often a picture is among the three nearest to its own Frame's caption, of all the Frames' captions (CLIP). Checks that the variety is the style asked for, not noise.",
    value: (m) => m.matches?.topThree,
    format: percent,
  },
]
