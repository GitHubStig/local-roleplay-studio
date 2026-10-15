<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { STYLE_MEASURES, type StyleScores } from '../styleScores'

/** The charts, with Observable Plot: loaded only when there are scores to show. */
const StyleCharts = defineAsyncComponent(() => import('./StyleCharts.vue'))

/**
 * Style scores as shown: what they're measured against, the charts, and the numbers in a table.
 * The Compare dialog's (StyleScoresPanel, under its base Frame's list) and an exported page's.
 */
const props = defineProps<{
  scores: StyleScores
  labelOf: (model: string) => string
  frames: readonly { index: number; name: string; caption?: string }[]
}>()

const baseName = computed(() =>
  props.frames.find((f) => f.index === props.scores.base)?.name ?? `Frame ${props.scores.base}`
)
</script>

<template>
  <div class="flex flex-col gap-6" data-style-scores-view>
    <p class="max-w-prose text-sm text-muted" data-style-intro>
      Against {{ baseName }}, on the {{ scores.frames.length }} Frames every model here pictured.
      Style is measured with CSD, a model trained to tell art styles apart whatever a picture
      shows.
    </p>
    <StyleCharts :scores :label-of="labelOf" :frames />
    <details class="text-sm">
      <summary class="text-muted">The numbers</summary>
      <table class="mt-2 border-separate border-spacing-x-3 border-spacing-y-1" data-style-table>
        <thead>
          <tr>
            <th class="text-left font-medium">Image Model</th>
            <th v-for="m in STYLE_MEASURES" :key="m.id" class="text-right font-medium">
              {{ m.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in scores.models" :key="s.model">
            <td>{{ labelOf(s.model) }}</td>
            <td v-for="m in STYLE_MEASURES" :key="m.id" class="text-right tabular-nums">
              {{ m.value(s) === undefined ? '–' : m.format(m.value(s)!) }}
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>
