/**
 * The Music tab's strip of Cues in rows of whole Cues, as few as give each Cue `minCuePx` of the
 * `width`, about as many Cues on each: all on one row when they fit (or the width isn't known yet).
 */
export function cueRows<T>(cues: T[], width: number, minCuePx: number): T[][] {
  const rows = width ? Math.max(1, Math.ceil((cues.length * minCuePx) / width)) : 1
  const each = Math.ceil(cues.length / rows)
  return Array.from(
    { length: Math.ceil(cues.length / each) },
    (_, i) => cues.slice(i * each, (i + 1) * each),
  )
}
