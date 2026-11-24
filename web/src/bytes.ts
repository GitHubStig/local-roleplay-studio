const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const

/** A size on disk as people read it: "640 MB", "2.3 GB", in thousands, as Finder and Explorer's own. */
export function bytes(n: number): string {
  let size = n
  let unit = 0
  while (size >= 1000 && unit < UNITS.length - 1) {
    size /= 1000
    unit++
  }
  if (unit === 0) return `${n} ${n === 1 ? 'byte' : 'bytes'}`
  // One decimal below 10, so "2.3 GB" and "640 MB"; rounding up to 1000 goes to the next unit.
  const shown = size < 9.95 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size))
  if (shown === '1000' && unit < UNITS.length - 1) return `1 ${UNITS[unit + 1]}`
  return `${shown} ${UNITS[unit]}`
}
