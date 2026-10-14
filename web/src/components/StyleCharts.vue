<script setup lang="ts">
import * as Plot from '@observablehq/plot'
import { useElementSize, useMutationObserver } from '@vueuse/core'
import { computed, ref, useTemplateRef, watchEffect } from 'vue'
import { STYLE_MEASURES, type StyleScores } from '../styleScores'

/**
 * The style scores as charts (Observable Plot), each under what it measures: a ranked bar chart per
 * measure, each model's distance from the base Frame Frame by Frame, and which pictures match
 * their Frame's caption. One hue throughout (the app's `--info`), so nine models need no palette:
 * the models are named on the axis, not told apart by colour. Loaded only when the scores show.
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

const ROW = 28
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
    .map((m) => ({ model: props.labelOf(m.model), value: measure.value(m) }))
    .filter((d): d is { model: string; value: number } => d.value !== undefined)
    .sort((a, b) => b.value - a.value)
  const max = Math.max(...data.map((d) => d.value))
  return Plot.plot({
    width: width.value,
    height: data.length * ROW + 30,
    marginLeft: 140,
    marginRight: 48,
    style: style.value,
    x: { domain: [0, id === 'matches' ? 1 : max * 1.05], grid: true, label: null, tickFormat: id === 'matches' ? '%' : undefined },
    y: { domain: data.map((d) => d.model), label: null, tickSize: 0 },
    marks: [
      Plot.gridX({ stroke: colors.value.line, strokeOpacity: 1 }),
      Plot.barX(data, {
        x: 'value',
        y: 'model',
        fill: colors.value.data,
        insetTop: 5,
        insetBottom: 5,
        rx2: 4,
        title: (d) => `${d.model}: ${measure.format(d.value)}`,
      }),
      Plot.text(data, {
        x: 'value',
        y: 'model',
        text: (d) => measure.format(d.value),
        dx: 6,
        textAnchor: 'start',
        fill: colors.value.muted,
      }),
      Plot.ruleX([0], { stroke: colors.value.muted }),
    ],
  })
}

/** Each model's distance from the base Frame, Frame by Frame: a small chart per model. */
function byFrame() {
  const { frames, base } = props.scores
  const data = props.scores.models.flatMap((m) =>
    m.fromBaseByFrame.map((d, i) => ({ model: props.labelOf(m.model), frame: frames[i], d }))
  )
  return Plot.plot({
    width: width.value,
    height: props.scores.models.length * 64 + 40,
    marginLeft: 140,
    marginRight: 36,
    style: style.value,
    x: { label: 'Frame', ticks: Math.min(frames.length, 16), tickFormat: 'd' },
    y: { label: null, ticks: 2, axis: 'right' },
    fy: { label: null, axis: 'left', domain: props.scores.models.map((m) => props.labelOf(m.model)) },
    facet: { data, y: 'model', marginLeft: 140 },
    marks: [
      Plot.gridY({ stroke: colors.value.line, strokeOpacity: 1, ticks: 2 }),
      Plot.ruleX([base], { stroke: colors.value.muted, strokeDasharray: '3,3' }),
      Plot.lineY(data, { x: 'frame', y: 'd', stroke: colors.value.data, strokeWidth: 2 }),
      Plot.dot(data, {
        x: 'frame',
        y: 'd',
        r: 3,
        fill: colors.value.data,
        stroke: colors.value.surface,
        strokeWidth: 1,
        title: (p) => `${p.model}, ${props.frameName(p.frame)}: ${p.d.toFixed(2)} from the base`,
      }),
    ],
  })
}

/** Where each picture's own caption ranks among the Frames': darker is nearer, 1 the nearest. */
function ranks() {
  const { frames } = props.scores
  const data = props.scores.models.flatMap((m) =>
    (m.captionRank ?? []).map((rank, i) => ({ model: props.labelOf(m.model), frame: frames[i], rank }))
  )
  return Plot.plot({
    width: width.value,
    height: props.scores.models.length * 22 + 60,
    marginLeft: 140,
    style: style.value,
    padding: 0.08,
    x: { label: 'Frame', type: 'band', tickFormat: (f: number) => (frames.length > 20 && f % 5 ? '' : `${f}`) },
    y: { label: null, domain: props.scores.models.map((m) => props.labelOf(m.model)), tickSize: 0 },
    color: {
      type: 'linear',
      domain: [1, 4],
      range: [colors.value.data, colors.value.surface],
      clamp: true,
      legend: true,
      label: 'Rank of its own caption (1 is nearest; 4 or worse fades out)',
      ticks: [1, 2, 3, 4],
      tickFormat: (r: number) => (r === 4 ? '4+' : `${r}`),
    },
    marks: [
      Plot.cell(data, {
        x: 'frame',
        y: 'model',
        fill: 'rank',
        rx: 2,
        title: (c) => `${c.model}, ${props.frameName(c.frame)}: its caption ranks ${c.rank} of ${frames.length}`,
      }),
    ],
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
