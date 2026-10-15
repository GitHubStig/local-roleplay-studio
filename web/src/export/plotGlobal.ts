import type * as P from './plot'

/**
 * Stands in for `@observablehq/plot` in the exported page's build (`vite.export.config.ts`), so
 * the page carries none of it: each function calls through to `window.Plot`, which `plot.js` sets
 * once the style scores are opened (`loadPlot`). Only what the charts use is here, and in
 * `plot.ts`; using another fails the export's build.
 */
const plot = () => (globalThis as unknown as { Plot: typeof P }).Plot
const through = <K extends keyof typeof P>(name: K) =>
  ((...args: unknown[]) => (plot()[name] as (...a: unknown[]) => unknown)(...args)) as (typeof P)[K]

export const barX = through('barX')
export const cell = through('cell')
export const dot = through('dot')
export const gridX = through('gridX')
export const gridY = through('gridY')
export const lineY = through('lineY')
const plotFn = through('plot')
export { plotFn as plot }
export const pointer = through('pointer')
export const pointerY = through('pointerY')
export const ruleX = through('ruleX')
export const text = through('text')

/** Loads `plot.js` from beside the page, once; resolves when `window.Plot` is there. */
let loading: Promise<void> | undefined
export function loadPlot(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    if ('Plot' in globalThis) return resolve()
    const script = document.createElement('script')
    script.src = 'plot.js'
    script.onload = () => resolve()
    script.onerror = () => {
      loading = undefined
      reject(new Error("The charts couldn't load (plot.js, beside the page)"))
    }
    document.head.append(script)
  })
  return loading
}
