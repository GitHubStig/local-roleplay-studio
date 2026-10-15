<script setup lang="ts" generic="F extends PicturedFrame">
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  deleteModelPictures,
  exportComparison,
  getStyleScores,
  imageUrl,
  type PicturedFrame,
} from '../api'
import type { ComparisonModel } from '../comparison'
import { useStoredString } from '../composables/storage'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStyleBase } from '../composables/useStyleBase'
import type { ExportedStyles } from '../styleScores'
import { useImageModels } from '../composables/useSettingsOptions'
import ComparisonTable from './ComparisonTable.vue'
import StyleScoresPanel from './StyleScoresPanel.vue'

/**
 * A Session's pictures side by side (ComparisonTable), a row per Frame and a column per Image
 * Model that rendered any, opened by its Compare button (shown once two models have). Export
 * writes the same as a page of its own, on the server. Style scores shows, in place of the table,
 * how varied each shown model's art style is (StyleScoresPanel). A hidden column can have all its
 * model's pictures deleted, but the Session's own model's; `changed` says so.
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
/** The Session changed here (a model's pictures were deleted): its screen loads it again. */
const emit = defineEmits<{ changed: [] }>()
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
 * The columns as arranged in the table (indexes into `models`), kept while the Session is open,
 * and those hidden, remembered per Session in this browser by their models: what Export and the
 * style scores take, in that order and without the hidden ones.
 */
const order = ref<number[]>()
const hiddenIds = useStoredString(`compare-hidden:${props.sessionId}`)
const hidden = computed<number[]>({
  get: () => {
    let ids: unknown
    try {
      ids = JSON.parse(hiddenIds.value ?? '[]')
    } catch {
      ids = []
    }
    return (Array.isArray(ids) ? ids : []).map((id) => modelIds.value.indexOf(id)).filter((i) =>
      i >= 0
    )
  },
  set: (indexes) => {
    const ids = indexes.map((i) => modelIds.value[i]).filter(Boolean)
    hiddenIds.value = ids.length ? JSON.stringify(ids) : null
  },
})
const exportedColumns = computed(() =>
  (order.value ?? models.value.map((_, i) => i)).filter((i) => !hidden.value.includes(i))
)

/** The shown columns' Image Models (ids), in order, for the style scores. */
const shownModels = computed(() => exportedColumns.value.map((i) => modelIds.value[i]))
const pictureFrames = computed(() =>
  props.frames.filter((f) => f.pictures.length).map((f) => ({
    index: f.index,
    name: props.name(f.index),
    caption: props.caption?.(f) || undefined,
  }))
)
/** The style scores in place of the table. */
const showScores = ref(false)

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

/**
 * The style scores an export can carry, for the exported columns against the base Frame picked
 * for them: looked up when the export is asked for; null when the Session hasn't been scored (or
 * fewer than two columns are exported). Included unless the player unticks it (remembered).
 */
const styleBase = useStyleBase(props.sessionId, () => pictureFrames.value.map((f) => f.index))
const exportStyles = useStoredFlag(`export-style-scores:${props.sessionId}`, true)
const styles = ref<ExportedStyles | null>(null)
async function askToExport() {
  styles.value = null
  asking.value?.showModal()
  const ids = exportedColumns.value.map((i) => modelIds.value[i])
  if (ids.length < 2) return
  const scores = await getStyleScores(props.sessionId, styleBase.value, ids).catch(() => null)
  if (!scores) return
  styles.value = {
    scores,
    labels: Object.fromEntries(ids.map((id) => [id, labelOf(id)])),
    frames: pictureFrames.value.filter((f) => scores.frames.includes(f.index)),
  }
}
const styleBaseName = computed(() =>
  pictureFrames.value.find((f) => f.index === styles.value?.scores.base)?.name
)

/**
 * A hidden model whose pictures are about to be deleted, asked first: how many pictures go, and
 * how many of them have an upscale or 3D made from them, which go too.
 */
const deleting = useTemplateRef<HTMLDialogElement>('deleting')
const doomed = ref<
  { model: string; label: string; pictures: number; extras: number; problem?: string; busy?: true }
  | null
>(null)
function askToDelete(index: number) {
  const model = modelIds.value[index]
  const pictures = props.frames.flatMap((f) => f.pictures.filter((p) => p.imageModel === model))
  doomed.value = {
    model,
    label: models.value[index].label,
    pictures: pictures.length,
    extras: pictures.filter((p) => p.upscaled || p.scene || p.figure || p.lito).length,
  }
  deleting.value?.showModal()
}
async function deleteNow() {
  const asked = doomed.value
  if (!asked) return
  doomed.value = { ...asked, busy: true, problem: undefined }
  try {
    await deleteModelPictures(props.sessionId, asked.model)
    deleting.value?.close()
    doomed.value = null
    emit('changed')
  } catch (err) {
    doomed.value = { ...asked, problem: (err as Error).message }
  }
}

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
      ...(styles.value && exportStyles.value ? { styles: styles.value } : {}),
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
      <template #hidden="{ index }">
        <button
          v-if="!models[index].current"
          type="button"
          class="mt-1 text-xs text-danger hover:underline"
          :title="`Delete every picture ${models[index].label} made in this Session`"
          data-delete-model-pictures
          @click="askToDelete(index)"
        >
          Delete pictures…
        </button>
      </template>
      <template v-if="showScores" #instead>
        <StyleScoresPanel
          :session-id="sessionId"
          :models="shownModels"
          :frames="pictureFrames"
          :label-of="labelOf"
        />
      </template>
      <template #actions>
        <button
          type="button"
          class="rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
          :aria-pressed="showScores"
          title="How much each shown model's art style varies across the Frames"
          data-show-style-scores
          @click="showScores = !showScores"
        >
          {{ showScores ? 'Pictures' : 'Style scores' }}
        </button>
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
          @click="askToExport"
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
        <label v-if="styles" class="flex items-start gap-2">
          <input v-model="exportStyles" type="checkbox" class="mt-1" data-export-styles />
          <span class="flex flex-col gap-0.5">
            <span>Include the style scores</span>
            <span class="text-sm text-muted">
              Their charts, as a tab of the page, against {{ styleBaseName }}.
            </span>
          </span>
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
    <dialog
      ref="deleting"
      class="m-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 text-fg backdrop:bg-black/60"
      data-delete-model-dialog
      @close="doomed = null"
    >
      <form v-if="doomed" method="dialog" class="flex flex-col gap-4" @submit.prevent="deleteNow">
        <h3 class="text-lg font-medium">Delete {{ doomed.label }}'s pictures?</h3>
        <p>
          All {{ doomed.pictures }} {{ doomed.pictures === 1 ? 'picture' : 'pictures' }}
          {{ doomed.label }} made in this Session<template v-if="doomed.extras">, with the upscales
          and 3D made from {{ doomed.extras }} of them</template>, from every Frame. This can't be
          undone.
        </p>
        <p v-if="doomed.problem" class="text-danger" data-delete-problem>{{ doomed.problem }}</p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-lg border border-line px-4 py-2"
            @click="deleting?.close()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-danger px-4 py-2 font-medium text-canvas disabled:opacity-50"
            :disabled="doomed.busy"
            data-delete-now
          >
            {{ doomed.busy ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </form>
    </dialog>
  </dialog>
</template>
