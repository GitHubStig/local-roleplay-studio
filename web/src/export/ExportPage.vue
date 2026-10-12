<script setup lang="ts">
import { ref } from 'vue'
import type { Comparison } from '../comparison'
import ComparisonTable from '../components/ComparisonTable.vue'
import ThemeToggle from '../components/ThemeToggle.vue'

/**
 * The exported comparison page: the Compare dialog's table alone, without its header, and the
 * app's theme toggle in a corner, remembered by the browser it's opened in. Exported with a
 * `notice`, the table stays blurred and out of reach behind it until the visitor confirms they're
 * 18 or older, on every visit: nothing is remembered.
 */
const props = defineProps<Comparison & { notice?: string }>()
const confirmed = ref(!props.notice)

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
    <ComparisonTable :models :rows />
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
  <div class="fixed right-3 bottom-3 z-50 rounded-lg bg-canvas/90 shadow-md" data-export-theme>
    <ThemeToggle />
  </div>
</template>
