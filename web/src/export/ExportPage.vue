<script setup lang="ts">
import { useUrlSearchParams } from '@vueuse/core'
import { onMounted, ref, useTemplateRef } from 'vue'
import type { Comparison } from '../comparison'
import ComparisonTable from '../components/ComparisonTable.vue'
import { usePageKeys } from '../composables/usePageKeys'
import StyleScoresView from '../components/StyleScoresView.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import type { ExportedStyles } from '../styleScores'
import { loadPlot } from './plotGlobal'

/**
 * The exported comparison page: the Compare dialog's table alone, without its header, and the
 * app's theme toggle in a corner, remembered by the browser it's opened in. Each column has a
 * checkbox to hide it, moving it to the right end until the page is reloaded. Exported with a
 * `notice`, the table stays blurred and out of reach behind it until the visitor confirms they're
 * 18 or older, on every visit: nothing is remembered. Exported with its style scores, a switch
 * beside the theme toggle shows them instead of the table, and says so in the address
 * (`?view=scores`), so a link can open straight onto them.
 */
const props = defineProps<Comparison & { notice?: string; styles?: ExportedStyles }>()
const confirmed = ref(!props.notice)
/** The table's arrangement, kept here so it survives a visit to the style scores. */
const order = ref(props.models.map((_, i) => i))
const hidden = ref<number[]>([])
/**
 * The style scores in place of the table, once their charts' script (`plot.js`, beside the page)
 * has loaded: only then, so a visitor who never opens them never downloads it.
 */
const showScores = ref(false)
/** While the charts' script loads, or why it couldn't. */
const charts = ref<{ loading: true } | { error: string } | null>(null)
/** The address's query, kept in step with the view (replacing the entry, not adding one). */
const params = useUrlSearchParams('history')
async function show(scores: boolean) {
  if (!scores) {
    showScores.value = false
    delete params.view
    return
  }
  charts.value = { loading: true }
  try {
    await loadPlot()
    charts.value = null
    showScores.value = true
    params.view = 'scores'
  } catch (err) {
    charts.value = { error: (err as Error).message }
  }
}
onMounted(() => {
  if (props.styles && params.view === 'scores') show(true)
})
const labelOf = (model: string) => props.styles?.labels[model] ?? model
/** Page Up and Down scroll the style scores (the table sees to its own). */
const scoresBox = useTemplateRef<HTMLElement>('scoresBox')
usePageKeys(scoresBox, () => !confirmed.value)

/** Back where the visitor came from, or to an empty page if this was the first. */
function leave() {
  if (history.length > 1) history.back()
  else location.replace('about:blank')
}
</script>

<template>
  <div
    class="h-full"
    :class="{ 'pointer-events-none blur-2xl select-none': !confirmed }"
    :inert="!confirmed"
    data-export-table
  >
    <div
      v-if="showScores && styles"
      ref="scoresBox"
      class="h-full overflow-auto"
      data-export-scores
    >
      <div class="mx-auto w-full max-w-6xl p-4 pb-20">
        <StyleScoresView
          :scores="styles.scores"
          :label-of="labelOf"
          :frames="styles.frames"
          :one-style="styles.oneStyle"
        />
      </div>
    </div>
    <ComparisonTable v-else v-model:order="order" v-model:hidden="hidden" :models :rows hideable />
  </div>
  <div
    v-if="!confirmed"
    class="fixed inset-0 z-40 flex items-center justify-center bg-canvas/70 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="notice-title"
    data-age-notice
  >
    <div class="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-lg">
      <h1 id="notice-title" class="text-lg font-medium">18+ · Artistic nudity</h1>
      <p class="mt-3 whitespace-pre-wrap" data-notice-text>{{ notice }}</p>
      <p class="mt-3 text-muted">Continue only if you're 18 or older.</p>
      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-line px-4 py-2"
          data-leave
          @click="leave"
        >
          Leave
        </button>
        <button
          type="button"
          class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
          data-confirm-age
          @click="confirmed = true"
        >
          I'm 18 or older, continue
        </button>
      </div>
    </div>
  </div>
  <div class="fixed right-3 bottom-3 z-50 flex items-center gap-2">
    <div
      v-if="styles"
      class="flex rounded-lg bg-canvas/90 p-0.5 text-sm shadow-md"
      role="group"
      aria-label="Show"
      data-export-view
    >
      <button
        v-for="(label, i) in ['Pictures', 'Style scores']"
        :key="label"
        type="button"
        class="rounded-md px-2.5 py-1"
        :class="showScores === (i === 1) ? 'bg-fg text-canvas' : 'text-muted hover:text-fg'"
        :aria-pressed="showScores === (i === 1)"
        @click="show(i === 1)"
      >
        {{ label }}
      </button>
    </div>
    <span v-if="charts" class="rounded-lg bg-canvas/90 px-2 py-1 text-sm shadow-md" :class="'error' in charts ? 'text-danger' : 'text-muted'">
      {{ 'error' in charts ? charts.error : 'Loading the charts…' }}
    </span>
    <div class="rounded-lg bg-canvas/90 shadow-md" data-export-theme>
      <ThemeToggle />
    </div>
  </div>
</template>
