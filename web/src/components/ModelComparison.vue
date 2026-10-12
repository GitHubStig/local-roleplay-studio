<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { exportComparison, imageUrl, type PicturedFrame } from '../api'
import type { ComparisonModel } from '../comparison'
import { useImageModels } from '../composables/useSettingsOptions'
import ComparisonTable from './ComparisonTable.vue'

/**
 * A Session's pictures side by side (ComparisonTable), a row per Frame and a column per Image
 * Model that rendered any, opened by its Compare button (shown once two models have). Export
 * writes the same as a page of its own, on the server.
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
const modelIds = computed(() => [
  ...new Set(props.frames.flatMap((f) => f.pictures.map((p) => p.imageModel))),
])
const models = computed<ComparisonModel[]>(() =>
  modelIds.value.map((m) => ({ label: labelOf(m), current: m === props.imageModel }))
)
/** The Frames with any picture, each with its picture by each model (or none). */
const pictured = computed(() =>
  props.frames
    .filter((f) => f.pictures.length)
    .map((f) => ({
      name: props.name(f.index),
      prompt: f.prompt,
      pictures: modelIds.value.map((m) => f.pictures.find((p) => p.imageModel === m) ?? null),
    }))
)
const rows = computed(() =>
  pictured.value.map((row) => ({
    ...row,
    pictures: row.pictures.map((p) =>
      p && {
        thumb: imageUrl(props.sessionId, p.image),
        full: imageUrl(props.sessionId, p.upscaled ?? p.image),
        stale: p.stale,
      }
    ),
  }))
)

const open = ref(false)
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(open, (now) => {
  if (now) dialog.value?.showModal()
  else if (dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

/** Where the last export went, or why it failed; null while exporting. */
const exported = ref<{ folder?: string; error?: string } | null | undefined>()
async function exportPage() {
  exported.value = null
  try {
    const { folder } = await exportComparison(props.sessionId, {
      models: models.value.map(({ label }) => ({ label })),
      rows: pictured.value.map((row) => ({
        ...row,
        pictures: row.pictures.map((p) =>
          p && { image: p.image, upscaled: p.upscaled, stale: p.stale }
        ),
      })),
    })
    exported.value = { folder }
  } catch (e) {
    exported.value = { error: e instanceof Error ? e.message : String(e) }
  }
}
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
    <ComparisonTable v-if="open" title="Compare Image Models" :models :rows>
      <template #actions>
        <span v-if="exported?.folder" class="text-ok" data-export-done>
          Exported to {{ exported.folder }}
        </span>
        <span v-else-if="exported?.error" class="text-danger">{{ exported.error }}</span>
        <button
          type="button"
          class="rounded border border-line px-2 py-0.5 text-muted hover:text-fg disabled:opacity-50"
          title="Write this as a page of its own, its pictures as WebP, to open or host anywhere"
          :disabled="exported === null"
          data-export
          @click="exportPage"
        >
          {{ exported === null ? 'Exporting…' : 'Export' }}
        </button>
        <button type="button" class="text-muted hover:text-fg" @click="open = false">
          Close ✕
        </button>
      </template>
    </ComparisonTable>
  </dialog>
</template>
