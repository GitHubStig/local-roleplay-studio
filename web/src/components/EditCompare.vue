<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { editLine, imageUrl, type Picture } from '../api'
import { unzoomed, type ZoomView } from '../composables/usePinchZoom'
import { useCloseOnLeave } from '../composables/useCloseOnLeave'
import { useSettingsOptions } from '../composables/useSettingsOptions'
import FrameImage from './FrameImage.vue'
import PaintLayer from './PaintLayer.vue'

/**
 * A picture's edits side by side, one per edit model (ADR 0021): the Original, then each edit
 * model's newest edit, with what it was told, as each model is told in its own way. They zoom and
 * pan together, as an edit is often a small area; the painted areas can be shown over them, to see
 * whether a model kept to its area; and any of them can be picked as the picture from here.
 */
const props = defineProps<{
  sessionId: string
  /** The picture whose edits to compare; null keeps the dialog closed. */
  picture: Picture | null
  /** What the Frame is called, for the title. */
  name?: string
}>()
const emit = defineEmits<{
  close: []
  /** Pick version `version` (0, the Original) as the picture. */
  pick: [version: number]
}>()

const options = useSettingsOptions()
const labelOf = (id: string) => options.value?.editModels.find((m) => m.id === id)?.label ?? id

interface Column {
  /** The version: 0 for the Original. */
  version: number
  title: string
  /** Which of its model's edits it is, or how it was made. */
  detail: string
  /** What its model was told. */
  told?: string
  file: string
  mask?: string
}
/** The Original, then each edit model's newest edit, in the order the models were first used. */
const columns = computed<Column[]>(() => {
  const p = props.picture
  if (!p) return []
  const edits = p.edits ?? []
  const models = [...new Set(edits.map((e) => e.editModel))]
  return [
    { version: 0, title: 'Original', detail: 'As rendered', file: p.file },
    ...models.map((m): Column => {
      const line = editLine(p, m)
      const newest = line.at(-1)!
      return {
        version: edits.indexOf(newest) + 1,
        title: labelOf(m),
        detail: `Edit ${line.length}`,
        told: newest.instructions.join('; '),
        file: newest.file,
        mask: newest.mask,
      }
    }),
  ]
})

/** One zoom for every picture, so each shows the same part. */
const zoom = ref<ZoomView>(unzoomed())
const showAreas = ref(false)

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
useCloseOnLeave(dialog)
watch(() => !!props.picture, (open) => {
  const el = dialog.value
  if (!el) return
  if (open && !el.open) {
    zoom.value = unzoomed()
    el.showModal()
  } else if (!open && el.open) el.close()
}, { flush: 'post' })
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-charcoal p-0 backdrop:bg-charcoal"
    data-edit-compare
    @close="emit('close')"
  >
    <div v-if="picture" class="flex h-full w-full flex-col gap-3 p-4 text-sm text-white/80 sm:p-8">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span class="text-white">Compare edits<template v-if="name"> · {{ name }}</template></span>
        <label class="flex items-center gap-1.5">
          <input v-model="showAreas" type="checkbox" data-show-areas />
          Show painted areas
        </label>
        <span class="hidden text-white/50 sm:inline">Zoom with the wheel or a pinch: they all follow. Double-click to reset.</span>
        <button type="button" class="ml-auto hover:text-white" aria-label="Close" @click="dialog?.close()">
          Close ✕
        </button>
      </div>
      <!-- As many across as the window's width has room for at 28rem or more each, however many
           there are; one above another on a phone. -->
      <div
        class="grid min-h-0 flex-1 auto-rows-[minmax(16rem,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] gap-3 overflow-y-auto"
      >
        <figure
          v-for="c in columns"
          :key="c.version"
          class="flex min-h-0 min-w-0 flex-col gap-1.5"
          :data-compared-edit="c.version"
        >
          <div class="flex min-h-0 flex-1">
            <FrameImage
              v-model:zoom="zoom"
              :src="imageUrl(sessionId, c.file)"
              :alt="`${c.title}, ${c.detail}`"
            >
              <template v-if="showAreas && c.mask" #layer="{ size }">
                <PaintLayer
                  :width="size.width"
                  :height="size.height"
                  :sketch="{ base: true, strokes: [] }"
                  :base="imageUrl(sessionId, c.mask)"
                  readonly
                />
              </template>
            </FrameImage>
          </div>
          <!-- Centred, so it sits under its picture, whose width the cell doesn't know. -->
          <figcaption class="flex flex-col items-center gap-0.5 text-center text-xs">
            <span class="flex flex-wrap items-center justify-center gap-x-2">
              <span class="font-medium text-white">{{ c.title }}</span>
              <span class="text-white/60">{{ c.detail }}</span>
              <span v-if="(picture.picked ?? 0) === c.version" class="text-white" data-picked>· Picked</span>
              <button
                v-else
                type="button"
                class="rounded-md border border-white/25 px-2 py-0.5 hover:border-white/60 hover:text-white"
                title="Show this as the picture"
                data-pick-edit
                @click="emit('pick', c.version)"
              >
                Pick
              </button>
            </span>
            <span v-if="c.told" class="line-clamp-2 max-w-prose text-white/60" :title="c.told" data-told>{{ c.told }}</span>
          </figcaption>
        </figure>
      </div>
    </div>
  </dialog>
</template>
