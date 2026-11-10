/**
 * Pictures' style scores. Shared by the server and the web app: types and plain values only.
 */

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
