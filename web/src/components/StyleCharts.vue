<script setup lang="ts">
import * as Plot from '@observablehq/plot'
import { useElementSize, useMutationObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef, watchEffect } from 'vue'
import { STYLE_MEASURES, type StyleScores } from '../styleScores'

/**
 * The style scores as charts (Observable Plot), each under what it measures: a ranked bar chart per
 * measure, each model's distance from the base Frame Frame by Frame, and which pictures match
 * their Frame's caption. One hue throughout (the app's `--info`), so nine models need no palette:
 * the models are named on the axis, not told apart by colour. On a phone upright, the names go
 * above the bars and the heatmap turns on its side. Loaded only when the scores show.
 */
const props = defineProps<{
  scores: StyleScores
  /** An Image Model's name, by its id. */
  labelOf: (model: string) => string
  /** What a Frame is called, by its index. */
  frameName: (index: number) => string
}>()

const root = useTemplateRef<HTMLElement>('root')
const { width } = useElementSize(root)

/** The theme's colours, read again when it changes (the `dark` class on <html>). */
const theme = ref(0)
useMutationObserver(document.documentElement, () => theme.value++, { attributeFilter: ['class'] })
const colors = computed(() => {
  void theme.value
  const get = (name: string) => rgbOf(`var(${name})`)
  return {
    data: get('--info'),
    fg: get('--fg'),
    muted: get('--muted'),
    line: get('--line'),
    surface: get('--surface'),
  }
})

/**
 * A CSS colour as `rgb()`, which Plot can blend between: the dark theme's are Tailwind's `oklch()`,
 * behind variables. Painted on a pixel and read back, as the browser alone resolves both.
 */
function rgbOf(color: string): string {
  const probe = document.createElement('span')
  probe.style.color = color
  document.body.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return resolved
  ctx.fillStyle = resolved
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

const measures = computed(() =>
  STYLE_MEASURES.filter((m) => props.scores.models.some((s) => m.value(s) !== undefined))
)
const hasRanks = computed(() => props.scores.models.some((m) => m.captionRank))

/**
 * The models' names as the charts show them: without a trailing "(4-bit)" and the like, unless
 * two would then read the same. The full name is in each mark's tooltip.
 */
const names = computed(() => {
  const full = props.scores.models.map((m) => props.labelOf(m.model))
  const short = full.map((n) => n.replace(/\s*\([^)]*\)\s*$/, '') || n)
  return new Map(
    props.scores.models.map((m, i) => [
      m.model,
      short.filter((n) => n === short[i]).length > 1 ? full[i] : short[i],
    ]),
  )
})
const nameOf = (model: string) => names.value.get(model) ?? props.labelOf(model)

/** The widest model name in the charts' type, so the names take only the room they need. */
const nameWidth = computed(() => {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx || !root.value) return 140
  ctx.font = `12px ${getComputedStyle(root.value).fontFamily}`
  return Math.ceil(Math.max(...[...names.value.values()].map((n) => ctx.measureText(n).width))) + 10
})
/** A phone upright: names go above the bars, and the heatmap turns on its side. */
const narrow = computed(() => width.value < 560)

const style = computed(() => ({
  background: 'transparent',
  color: colors.value.fg,
  fontSize: '12px',
  fontFamily: 'inherit',
}))

/** A measure's models, highest first, as a horizontal bar chart. */
function bars(id: (typeof STYLE_MEASURES)[number]['id']) {
  const measure = STYLE_MEASURES.find((m) => m.id === id)!
  const data = props.scores.models
    .map((m) => ({ model: nameOf(m.model), full: props.labelOf(m.model), value: measure.value(m) }))
    .filter((d): d is { model: string; full: string; value: number } => d.value !== undefined)
    .sort((a, b) => b.value - a.value)
  const max = Math.max(...data.map((d) => d.value))
  const above = narrow.value
  return Plot.plot({
    width: width.value,
    height: data.length * (above ? 40 : 28) + 30,
    marginLeft: above ? 8 : nameWidth.value,
    marginRight: 40,
    style: style.value,
    x: {
      domain: [0, id === 'matches' ? 1 : max * 1.05],
      label: null,
      ticks: Math.max(2, Math.floor(width.value / 80)),
      tickFormat: id === 'matches' ? '%' : undefined,
    },
    y: { domain: data.map((d) => d.model), label: null, tickSize: 0, axis: above ? null : 'left' },
    marks: [
      Plot.gridX({ stroke: colors.value.line, strokeOpacity: 1, ticks: Math.max(2, Math.floor(width.value / 80)) }),
      Plot.barX(data, {
        x: 'value',
        y: 'model',
        fill: colors.value.data,
        insetTop: above ? 20 : 5,
        insetBottom: above ? 4 : 5,
        rx2: 4,
        title: (d) => `${d.full}: ${measure.format(d.value)}`,
      }),
      above
        ? Plot.text(data, {
          y: 'model',
          text: 'model',
          frameAnchor: 'left',
          textAnchor: 'start',
          dy: -8,
          fill: colors.value.fg,
        })
        : null,
      Plot.text(data, {
        x: 'value',
        y: 'model',
        text: (d) => measure.format(d.value),
        dx: 6,
        dy: above ? 8 : 0,
        textAnchor: 'start',
        fill: colors.value.muted,
      }),
      Plot.ruleX([0], { stroke: colors.value.muted }),
    ],
  })
}

/**
 * Each model's distance from the base Frame, Frame by Frame: a small chart per model, its name
 * inside it at the top, so the lines have the whole width.
 */
function byFrame() {
  const { frames, base } = props.scores
  const data = props.scores.models.flatMap((m) =>
    m.fromBaseByFrame.map((d, i) => ({ model: nameOf(m.model), full: props.labelOf(m.model), frame: frames[i], d }))
  )
  const models = props.scores.models.map((m) => nameOf(m.model))
  return Plot.plot({
    width: width.value,
    height: models.length * 80 + 40,
    marginLeft: 4,
    marginRight: 32,
    style: style.value,
    x: {
      label: 'Frame',
      ticks: Math.min(frames.length, Math.floor(width.value / 36)),
      tickFormat: 'd',
    },
    y: { label: null, ticks: 2, axis: 'right', insetTop: 18 },
    fy: { label: null, axis: null, domain: models, padding: 0.15 },
    facet: { data, y: 'model' },
    marks: [
      Plot.gridY({ stroke: colors.value.line, strokeOpacity: 1, ticks: 2 }),
      Plot.ruleX([base], { stroke: colors.value.muted, strokeDasharray: '3,3' }),
      Plot.text(models.map((model) => ({ model })), {
        fy: 'model',
        text: 'model',
        frameAnchor: 'top-left',
        dy: 2,
        fill: colors.value.fg,
        fontWeight: 500,
      }),
      Plot.lineY(data, { x: 'frame', y: 'd', stroke: colors.value.data, strokeWidth: 2 }),
      Plot.dot(data, {
        x: 'frame',
        y: 'd',
        r: 3,
        fill: colors.value.data,
        stroke: colors.value.surface,
        strokeWidth: 1,
        title: (p) => `${p.full}, ${props.frameName(p.frame)}: ${p.d.toFixed(2)} from the base`,
      }),
    ],
  })
}

/**
 * Where each picture's own caption ranks among the Frames': darker is nearer, 1 the nearest. A row
 * per model with near-square cells, or on a phone, a row per Frame and a column per model.
 */
function ranks() {
  const { frames } = props.scores
  const data = props.scores.models.flatMap((m) =>
    (m.captionRank ?? []).map((rank, i) => ({
      model: nameOf(m.model),
      full: props.labelOf(m.model),
      frame: frames[i],
      rank,
    }))
  )
  const models = props.scores.models.map((m) => nameOf(m.model))
  /** Every Frame's number, or every fifth's when there are more than `n`. */
  const ticks = (n: number) => frames.length > n ? frames.filter((f) => f % 5 === 0) : frames
  const cell = Plot.cell(data, {
    x: narrow.value ? 'model' : 'frame',
    y: narrow.value ? 'frame' : 'model',
    fill: 'rank',
    inset: 1,
    rx: 2,
    title: (c) =>
      `${c.full}, ${props.frameName(c.frame)}: its caption ranks ${c.rank} of ${frames.length}`,
  })
  const color = {
    type: 'linear' as const,
    domain: [1, 4],
    range: [colors.value.data, colors.value.surface],
    clamp: true,
    legend: true,
    label: 'Caption rank (1 is nearest)',
    ticks: [1, 2, 3, 4],
    tickFormat: (r: number) => (r === 4 ? '4+' : `${r}`),
  }
  if (narrow.value) {
    return Plot.plot({
      width: width.value,
      height: frames.length * 18 + nameWidth.value + 30,
      marginTop: nameWidth.value,
      marginLeft: 28,
      style: style.value,
      x: { label: null, domain: models, axis: 'top', tickRotate: -90, tickSize: 0 },
      y: { label: 'Frame', type: 'band', ticks: ticks(20) },
      color,
      marks: [cell],
    })
  }
  const side = Math.min(28, Math.max(14, (width.value - nameWidth.value) / frames.length))
  return Plot.plot({
    width: width.value,
    height: models.length * side + 50,
    marginLeft: nameWidth.value,
    style: style.value,
    x: { label: 'Frame', type: 'band', ticks: ticks(40) },
    y: { label: null, domain: models, tickSize: 0 },
    color,
    marks: [cell],
  })
}

/** Each chart's element, drawn again when the scores, width or theme change. */
const charts = computed(() =>
  width.value
    ? {
      bars: measures.value.map((m) => ({ measure: m, svg: bars(m.id) })),
      byFrame: byFrame(),
      ranks: hasRanks.value ? ranks() : null,
    }
    : null
)
const slots = ref<Record<string, HTMLElement | null>>({})
watchEffect(() => {
  const drawn = charts.value
  if (!drawn) return
  const put = (key: string, el: Element) => slots.value[key]?.replaceChildren(el)
  drawn.bars.forEach((b) => put(b.measure.id, b.svg))
  put('byFrame', drawn.byFrame)
  if (drawn.ranks) put('ranks', drawn.ranks)
}, { flush: 'post' })
</script>

<template>
  <div ref="root" class="flex flex-col gap-8" data-style-charts>
    <section v-for="m in measures" :key="m.id" class="flex flex-col gap-1" :data-chart="m.id">
      <h3 class="font-medium">{{ m.name }}</h3>
      <p class="max-w-prose text-sm text-muted">{{ m.description }}</p>
      <div :ref="(el) => (slots[m.id] = el as HTMLElement | null)" />
    </section>
    <section class="flex flex-col gap-1" data-chart="from-base-by-frame">
      <h3 class="font-medium">Away from the base Frame, Frame by Frame</h3>
      <p class="max-w-prose text-sm text-muted">
        Each model's picture of every Frame, by how far its style moved from its picture of
        {{ frameName(scores.base) }} (the dashed line). A flat line near 0: the model kept one look
        whatever the Frame asked for.
      </p>
      <div :ref="(el) => (slots.byFrame = el as HTMLElement | null)" />
    </section>
    <section v-if="hasRanks" class="flex flex-col gap-1" data-chart="caption-ranks">
      <h3 class="font-medium">Which pictures match their Frame</h3>
      <p class="max-w-prose text-sm text-muted">
        Each picture, by where its own Frame's caption ranks among all the Frames' captions (CLIP).
        A faded column: a style no model drew; a faded row: a model that seldom drew what was asked.
      </p>
      <div :ref="(el) => (slots.ranks = el as HTMLElement | null)" />
    </section>
  </div>
</template>
