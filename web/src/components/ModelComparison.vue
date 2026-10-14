<script setup lang="ts" generic="F extends PicturedFrame">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { exportComparison, imageUrl, type PicturedFrame } from '../api'
import type { ComparisonModel } from '../comparison'
import { useStoredString } from '../composables/storage'
import { useStoredFlag } from '../composables/useStoredFlag'
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
    frames: readonly F[]
    /** The Session's Image Model, marked in its column. */
    imageModel: string
    /** What a Frame is called in its row. */
    name?: (index: number) => string
    /** What happens in a Frame, under its picture in the viewer (`ComparisonRow.caption`). */
    caption?: (frame: F) => string | undefined
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
      caption: props.caption?.(f) || undefined,
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

/**
 * The columns as arranged in the table (indexes into `models`), and those hidden: kept while the
 * Session is open, and what Export writes, in that order and without the hidden ones.
 */
const order = ref<number[]>()
const hidden = ref<number[]>([])
const exportedColumns = computed(() =>
  (order.value ?? models.value.map((_, i) => i)).filter((i) => !hidden.value.includes(i))
)

const open = ref(false)
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(open, (now) => {
  if (now) dialog.value?.showModal()
  else if (dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

/** The notice an exported page shows first, unless the player writes their own. */
const NOTICE = 'Some of these pictures show nude figures, as in classical painting.'
/**
 * Export first asks whether the page should ask its visitors to confirm they're 18 or older, and
 * under what text; both remembered per Session in this browser, for its next export.
 */
const asking = useTemplateRef<HTMLDialogElement>('asking')
const adultsOnly = useStoredFlag(`export-adults-only:${props.sessionId}`)
const storedNotice = useStoredString(`export-notice:${props.sessionId}`)
const notice = computed({
  get: () => storedNotice.value ?? NOTICE,
  set: (text) => (storedNotice.value = text === NOTICE ? null : text),
})

/** Where the last export went, or why it failed; null while exporting. */
const exported = ref<{ folder?: string; error?: string } | null | undefined>()
async function exportPage() {
  asking.value?.close()
  exported.value = null
  try {
    const { folder } = await exportComparison(props.sessionId, {
      ...(adultsOnly.value ? { notice: notice.value.trim() || NOTICE } : {}),
      models: exportedColumns.value.map((i) => ({ label: models.value[i].label })),
      rows: pictured.value.map((row) => ({
        ...row,
        pictures: exportedColumns.value.map((i) => row.pictures[i]).map((p) =>
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
    <ComparisonTable
      v-if="open"
      v-model:order="order"
      v-model:hidden="hidden"
      title="Compare Image Models"
      :models
      :rows
      hideable
    >
      <template #actions>
        <span v-if="exported?.folder" class="text-ok" data-export-done>
          Exported to {{ exported.folder }}
        </span>
        <span v-else-if="exported?.error" class="text-danger">{{ exported.error }}</span>
        <button
          type="button"
          class="rounded border border-line px-2 py-0.5 text-muted hover:text-fg disabled:opacity-50"
          title="Write this as a page of its own, its pictures as WebP, to open or host anywhere"
          :disabled="exported === null || !exportedColumns.length"
          data-export
          @click="asking?.showModal()"
        >
          {{ exported === null ? 'Exporting…' : 'Export' }}
        </button>
        <button type="button" class="text-muted hover:text-fg" @click="open = false">
          Close ✕
        </button>
      </template>
    </ComparisonTable>
    <dialog
      ref="asking"
      class="m-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 text-fg backdrop:bg-black/60"
      data-export-options
    >
      <form method="dialog" class="flex flex-col gap-4" @submit.prevent="exportPage">
        <h3 class="text-lg font-medium">Export as a page</h3>
        <label class="flex items-start gap-2">
          <input v-model="adultsOnly" type="checkbox" class="mt-1" data-adults-only />
          <span class="flex flex-col gap-0.5">
            <span>Ask visitors to confirm they're 18 or older</span>
            <span class="text-sm text-muted">
              The page opens blurred behind this notice, on every visit, until they confirm.
            </span>
          </span>
        </label>
        <label v-if="adultsOnly" class="flex flex-col gap-1">
          <span class="text-sm text-muted">Notice</span>
          <textarea
            v-model="notice"
            rows="3"
            maxlength="500"
            class="rounded-lg border border-line bg-canvas px-3 py-2"
            :placeholder="NOTICE"
            data-notice
          />
          <span class="text-sm text-muted">Followed by "Continue only if you're 18 or older."</span>
        </label>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-lg border border-line px-4 py-2"
            @click="asking?.close()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
            data-export-now
          >
            Export
          </button>
        </div>
      </form>
    </dialog>
  </dialog>
</template>
