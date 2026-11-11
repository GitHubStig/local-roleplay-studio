/**
 * What Frame `index` is called on every screen, the same in every kind of Session: numbered from 1,
 * so index 0 (a Chain's or a Roleplay's Opening) is Frame 1. As the server names it in its messages.
 */
export const frameName = (index: number) => `Frame ${index + 1}`

/** Frames `from` to `to` in a sentence: "Frame 3", or "Frames 3–5". */
export const framesName = (from: number, to: number) =>
  from === to ? frameName(from) : `Frames ${from + 1}–${to + 1}`
