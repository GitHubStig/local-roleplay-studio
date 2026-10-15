/**
 * Observable Plot on its own, for the exported page: built as `plot.js` (a classic script setting
 * `window.Plot`, `vite.export-plot.config.ts`), written beside the page only when it carries style
 * scores, and loaded only when they're shown. A classic script loads from disk (file://) too,
 * where a module can't. Only what the charts use, so the rest of Plot is left out; `plotGlobal.ts`
 * calls the same, and the type check fails if it asks for one not here.
 */
export {
  barX,
  cell,
  dot,
  gridX,
  gridY,
  lineY,
  plot,
  pointer,
  pointerY,
  ruleX,
  text,
} from '@observablehq/plot'
