<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { imageUrl, type PicturedFrame } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import ImageViewer from './ImageViewer.vue'

/**
 * A Session's pictures side by side, a row per Frame and a column per Image Model that rendered
 * any, opened by its Compare button (shown once two models have). A picture opens in the viewer,
 * where ← and → step through that Frame's pictures by the other models, and ↑ and ↓ through the
 * Frames that model rendered.
 */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly PicturedFrame[]
    /** The Session's Image Model, marked in its column. */
    imageModel: string
    /** What a Frame is called in its row. */
    name?: (index: number) => string
  }>(),
  { name: (index: number) => `Frame ${index}` },
)
const { labelOf } = useImageModels()

/** Every Image Model with a picture here, in the order they first rendered. */
const models = computed(() => [
  ...new Set(props.frames.flatMap((f) => f.pictures.map((p) => p.imageModel))),
])
/** The Frames with any picture, each with its picture by each model (or none). */
const rows = computed(() =>
  props.frames
    .filter((f) => f.pictures.length)
    .map((f) => ({
      index: f.index,
      pictures: models.value.map((m) => f.pictures.find((p) => p.imageModel === m)),
    }))
)

const open = ref(false)
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(open, (now) => {
  if (now) dialog.value?.showModal()
  else if (dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

/** The picture open in the viewer: its Frame's row, and its model's column. */
const viewing = ref<{ row: number; column: number } | null>(null)
const viewed = computed(() => {
  const v = viewing.value
  const row = v && rows.value[v.row]
  const picture = v && row?.pictures[v.column]
  if (!v || !row || !picture) return null
  const model = labelOf(models.value[v.column])
  return {
    src: imageUrl(props.sessionId, picture.upscaled ?? picture.image),
    alt: `${props.name(row.index)} by ${model}`,
    label: `${props.name(row.index)} · ${model} · ↑↓ Frames`,
  }
})
/** The column of the nearest picture `by` columns along in the open row, if any. */
function along(by: number): number | null {
  const v = viewing.value
  if (!v) return null
  const pictures = rows.value[v.row].pictures
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
  for (let r = v.row + by; r >= 0 && r < rows.value.length; r += by) {
    if (rows.value[r].pictures[v.column]) return r
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
  <button
    v-if="models.length > 1"
    type="button"
    class="rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
    title="This Session's pictures side by side, a column per Image Model"
    data-compare-models
    @click="open = true"
  >
    Compare
  </button>

  <dialog
    v-if="models.length > 1"
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-canvas p-0 text-fg backdrop:bg-black/60"
    data-model-comparison
    @close="open = false"
  >
    <div v-if="open" class="flex h-full flex-col">
      <div class="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
        <h2 class="font-medium">Compare Image Models</h2>
        <span class="text-muted">
          {{ rows.length }} {{ rows.length === 1 ? 'Frame' : 'Frames' }} · {{ models.length }} models
        </span>
        <button type="button" class="ml-auto text-muted hover:text-fg" @click="open = false">
          Close ✕
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <table class="border-separate border-spacing-2 text-sm">
          <thead>
            <tr>
              <th class="sticky left-0 top-0 z-20 bg-canvas" />
              <th
                v-for="m in models"
                :key="m"
                class="sticky top-0 z-10 bg-canvas px-1 py-1 text-left font-medium"
                data-model-column
              >
                {{ labelOf(m) }}
                <span v-if="m === imageModel" class="font-normal text-muted">· current</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in rows" :key="row.index" data-compare-row>
              <th
                class="sticky left-0 z-10 bg-canvas pr-2 text-left align-top font-normal whitespace-nowrap text-muted"
              >
                {{ name(row.index) }}
              </th>
              <td v-for="(picture, c) in row.pictures" :key="models[c]" class="align-top">
                <button
                  v-if="picture"
                  type="button"
                  class="block"
                  :title="picture.stale ? 'Its Image Prompt changed since it was rendered' : undefined"
                  @click="viewing = { row: r, column: c }"
                >
                  <img
                    :src="imageUrl(sessionId, picture.image)"
                    :alt="`${name(row.index)} by ${labelOf(models[c])}`"
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
  </dialog>
</template>
