<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import type { Comparison } from '../comparison'
import ImageViewer from './ImageViewer.vue'

/**
 * Pictures side by side, a row per Frame headed by its Image Prompt and a column per Image Model:
 * the Compare dialog's (under a header, given a `title`), and the whole of its exported page. A
 * picture opens in the viewer, where ← and → step through that Frame's pictures by the other
 * models, and ↑ and ↓ through the Frames that model rendered.
 */
const props = defineProps<Comparison & { title?: string }>()

/**
 * Whether the first column shows the prompts or only the Frames' names: shown on a wide screen,
 * folded away on a phone's (where they'd crowd out the pictures), either way until toggled.
 */
const narrow = useMediaQuery('(max-width: 639px)')
const promptsShown = ref(!narrow.value)
watch(narrow, (now) => (promptsShown.value = !now))
const anyPrompt = computed(() => props.rows.some((r) => r.prompt))

/** The picture open in the viewer: its Frame's row, and its model's column. */
const viewing = ref<{ row: number; column: number } | null>(null)
const viewed = computed(() => {
  const v = viewing.value
  const row = v && props.rows[v.row]
  const picture = v && row?.pictures[v.column]
  if (!v || !row || !picture) return null
  const model = props.models[v.column].label
  return {
    src: picture.full,
    alt: `${row.name} by ${model}`,
    label: `${row.name} · ${model} · ↑↓ Frames`,
  }
})
/** The column of the nearest picture `by` columns along in the open row, if any. */
function along(by: number): number | null {
  const v = viewing.value
  if (!v) return null
  const pictures = props.rows[v.row].pictures
  for (let c = v.column + by; c >= 0 && c < pictures.length; c += by) {
    if (pictures[c]) return c
  }
  return null
}
function step(by: number) {
  const column = along(by)
  if (column !== null) viewing.value = { ...viewing.value!, column }
}
/** The row of the nearest Frame `by` rows along with a picture by the open model, if any. */
function across(by: number): number | null {
  const v = viewing.value
  if (!v) return null
  for (let r = v.row + by; r >= 0 && r < props.rows.length; r += by) {
    if (props.rows[r].pictures[v.column]) return r
  }
  return null
}
// ↑ and ↓ while a picture is open (← and → are the viewer's own).
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (!viewing.value || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  const row = across(e.key === 'ArrowUp' ? -1 : 1)
  if (row !== null) viewing.value = { ...viewing.value, row }
})
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="title" class="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <h2 class="font-medium">{{ title }}</h2>
      <span class="text-muted">
        {{ rows.length }} {{ rows.length === 1 ? 'Frame' : 'Frames' }} · {{ models.length }} models
      </span>
      <div class="ml-auto flex items-center gap-3">
        <slot name="actions" />
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <table class="border-separate border-spacing-2 text-sm">
        <thead>
          <tr>
            <th class="sticky left-0 top-0 z-20 bg-canvas text-left font-normal">
              <button
                v-if="anyPrompt"
                type="button"
                class="text-xs whitespace-nowrap text-muted hover:text-fg"
                :aria-expanded="promptsShown"
                data-toggle-prompts
                @click="promptsShown = !promptsShown"
              >
                {{ promptsShown ? '‹ Hide prompts' : 'Prompts ›' }}
              </button>
            </th>
            <th
              v-for="m in models"
              :key="m.label"
              class="sticky top-0 z-10 bg-canvas px-1 py-1 text-left font-medium"
              data-model-column
            >
              {{ m.label }}
              <span v-if="m.current" class="font-normal text-muted">· current</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in rows" :key="row.name" data-compare-row>
            <th
              class="sticky left-0 z-10 bg-canvas pr-2 text-left align-top font-normal"
              :class="promptsShown ? 'w-72 min-w-72' : 'whitespace-nowrap'"
            >
              <div class="text-muted">{{ row.name }}</div>
              <p
                v-if="row.prompt && promptsShown"
                class="mt-1 max-h-56 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap"
                data-compare-prompt
              >
                {{ row.prompt }}
              </p>
            </th>
            <td v-for="(picture, c) in row.pictures" :key="models[c].label" class="align-top">
              <button
                v-if="picture"
                type="button"
                class="block"
                :title="picture.stale ? 'Its Image Prompt changed since it was rendered' : undefined"
                @click="viewing = { row: r, column: c }"
              >
                <img
                  :src="picture.thumb"
                  :alt="`${row.name} by ${models[c].label}`"
                  loading="lazy"
                  class="h-64 w-auto max-w-none rounded"
                  :class="{ 'opacity-50': picture.stale }"
                />
              </button>
              <div
                v-else
                class="flex h-64 w-48 items-center justify-center rounded border border-dashed border-line text-muted"
              >
                Not rendered
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ImageViewer
      :src="viewed?.src ?? null"
      :alt="viewed?.alt"
      :label="viewed?.label"
      :has-previous="along(-1) !== null"
      :has-next="along(1) !== null"
      @previous="step(-1)"
      @next="step(1)"
      @close="viewing = null"
    />
  </div>
</template>
