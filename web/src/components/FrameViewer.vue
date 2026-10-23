<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, reactive, ref, useTemplateRef } from 'vue'
import {
  type EditOrder,
  framePicture,
  imageUrl,
  newestImage,
  pickedEdit,
  type PicturedFrame,
} from '../api'
import { useFeatures } from '../composables/useFeatures'
import ImageViewer from './ImageViewer.vue'
import PaintLayer from './PaintLayer.vue'
import VersionStepper from './VersionStepper.vue'

/**
 * A Session's pictures in the full-window viewer: it opens on one Frame, and ← and → (or ↑ and ↓)
 * step through the Frames that have a picture, showing each one's upscale if it has one. A picture
 * shows as its picked version (ADR 0021), which its versions' buttons change; Edit paints over the
 * newest version the area to repaint, and says what to paint there.
 */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly PicturedFrame[]
    /** The Session's Image Model, which picks the picture each Frame shows. */
    imageModel: string
    /** What a Frame is called in the viewer's label. */
    name?: (index: number) => string
    /** An edit is queued or running on Frame `index`: its versions wait till it's done. */
    editing?: (index: number) => boolean
  }>(),
  { name: (index: number) => `Frame ${index}`, editing: () => false },
)
/** The Frame open in the viewer, by index; null keeps it closed. */
const open = defineModel<number | null>('open', { required: true })
/** Painting an edit of the open Frame's picture. */
const painting = defineModel<boolean>('painting', { default: false })
const emit = defineEmits<{
  /** The viewer stepped to Frame `index`, e.g. to scroll what's behind it there. */
  step: [index: number]
  /** Edit Frame `index`'s picture as `order` says. */
  edit: [index: number, order: EditOrder]
  /** Pick version `version` of Frame `index`'s picture. */
  pick: [index: number, version: number]
  /** Delete the newest edit of Frame `index`'s picture. */
  deleteEdit: [index: number]
}>()
const { on: featureOn } = useFeatures()

const pictured = computed(() =>
  props.frames.flatMap((f) => {
    const picture = framePicture(f, props.imageModel)
    return picture ? [{ index: f.index, picture }] : []
  })
)
const at = computed(() => pictured.value.findIndex((f) => f.index === open.value))
const current = computed(() => (at.value >= 0 ? pictured.value[at.value] : null))
/** The newest edit of the open picture, if it has one: the one Retry and Delete act on. */
const newest = computed(() => current.value?.picture.edits?.at(-1))
const busy = computed(() => !!current.value && props.editing(current.value.index))

const shown = computed(() => {
  const frame = current.value
  if (!frame) return null
  const name = props.name(frame.index)
  const { picture } = frame
  if (painting.value) {
    // What a new edit is made from, at its own size: the mask is painted in its pixels.
    return {
      src: imageUrl(props.sessionId, newestImage(picture)),
      alt: `Picture of ${name}, to paint over`,
      label: `Editing ${name}: paint over what to repaint`,
    }
  }
  const edit = pickedEdit(picture)
  const version = edit ?? picture
  return {
    src: imageUrl(props.sessionId, version.upscaled ?? version.image),
    alt: `Picture of ${name}`,
    label: `${name} · ${at.value + 1} of ${pictured.value.length}`,
    caption: edit
      ? `Edit ${picture.picked}: ${edit.instructions.join('; ')}`
      : picture.edits?.length
      ? 'The Original, as rendered.'
      : undefined,
  }
})

function step(by: number) {
  const frame = pictured.value[at.value + by]
  if (!frame) return
  open.value = frame.index
  emit('step', frame.index)
}

// --- Painting an edit: the brush, and what to paint there.
const layer = useTemplateRef<InstanceType<typeof PaintLayer>>('layer')
const brush = reactive({ size: 60, erase: false })
const instruction = ref('')

function stopPainting() {
  painting.value = false
  instruction.value = ''
}
function send() {
  const frame = current.value
  const told = instruction.value.trim()
  if (!frame || !told) return
  const mask = layer.value?.mask()
  emit('edit', frame.index, { instruction: told, ...(mask && { mask }) })
  stopPainting()
}
function close() {
  stopPainting()
  open.value = null
}
function deleteNewest() {
  const frame = current.value
  if (!frame || !newest.value) return
  const n = frame.picture.edits!.length
  if (!confirm(`Delete Edit ${n} of ${props.name(frame.index)}? This can't be undone.`)) return
  emit('deleteEdit', frame.index)
}

/** ⌘Z and ⇧⌘Z (Ctrl on a PC) undo and redo strokes, outside the instruction box. */
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (!painting.value || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
  if ((e.target as HTMLElement).closest('textarea, input')) return
  e.preventDefault()
  if (e.shiftKey) layer.value?.redo()
  else layer.value?.undo()
})
</script>

<template>
  <ImageViewer
    :src="shown?.src ?? null"
    :alt="shown?.alt"
    :label="shown?.label"
    :caption="shown?.caption"
    :has-previous="at > 0"
    :has-next="at >= 0 && at < pictured.length - 1"
    :painting="painting"
    @previous="step(-1)"
    @next="step(1)"
    @close="close"
  >
    <template v-if="current && !painting" #controls>
      <VersionStepper
        :picture="current.picture"
        :disabled="busy"
        dark
        @pick="(version) => emit('pick', current!.index, version)"
      />
      <template v-if="newest">
        <button
          v-if="!newest.copied && featureOn('edits')"
          type="button"
          class="shrink-0 whitespace-nowrap hover:text-white disabled:opacity-40"
          :disabled="busy"
          :title="`Make Edit ${current.picture.edits!.length} again, with another seed`"
          data-retry-edit
          @click="emit('edit', current.index, { retry: true })"
        >
          Retry edit
        </button>
        <button
          type="button"
          class="shrink-0 whitespace-nowrap hover:text-white disabled:opacity-40"
          :disabled="busy"
          :title="`Delete Edit ${current.picture.edits!.length}`"
          data-delete-edit
          @click="deleteNewest"
        >
          Delete edit
        </button>
      </template>
      <button
        v-if="featureOn('edits')"
        type="button"
        class="shrink-0 whitespace-nowrap hover:text-white disabled:opacity-40"
        :disabled="busy"
        :title="busy ? 'Being edited: wait for it first' : 'Repaint part of the picture'"
        data-edit
        @click="painting = true"
      >
        Edit
      </button>
    </template>
    <template v-if="painting" #layer="{ size }">
      <PaintLayer
        ref="layer"
        :width="size.width"
        :height="size.height"
        :size="brush.size"
        :erase="brush.erase"
      />
    </template>
    <template v-if="painting" #below>
      <div class="flex flex-col gap-2 text-sm text-white/80" data-paint-tools>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="inline-flex overflow-hidden rounded-lg border border-white/30" role="group">
            <button
              v-for="tool in [{ erase: false, label: 'Brush' }, { erase: true, label: 'Eraser' }]"
              :key="tool.label"
              type="button"
              class="px-2 py-1"
              :class="brush.erase === tool.erase ? 'bg-white/90 text-black' : 'hover:text-white'"
              :aria-pressed="brush.erase === tool.erase"
              @click="brush.erase = tool.erase"
            >
              {{ tool.label }}
            </button>
          </div>
          <label class="flex items-center gap-2">
            Size
            <input v-model.number="brush.size" type="range" min="8" max="240" data-brush-size />
          </label>
          <button
            type="button"
            class="hover:text-white disabled:opacity-40"
            :disabled="!layer?.canUndo"
            title="Undo (⌘Z)"
            @click="layer?.undo()"
          >
            Undo
          </button>
          <button
            type="button"
            class="hover:text-white disabled:opacity-40"
            :disabled="!layer?.canRedo"
            title="Redo (⇧⌘Z)"
            @click="layer?.redo()"
          >
            Redo
          </button>
          <button type="button" class="hover:text-white" @click="layer?.clear()">Clear</button>
        </div>
        <div class="flex items-end gap-2">
          <textarea
            v-model="instruction"
            rows="2"
            maxlength="1000"
            class="min-w-0 flex-1 resize-none rounded-lg border border-white/30 bg-black/40 p-2 text-white placeholder:text-white/50"
            placeholder="What to paint there, e.g. “a hand reaching forward, index finger extended”"
            data-edit-instruction
            @keydown.enter.exact.prevent="send"
          />
          <button
            type="button"
            class="rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
            :disabled="!instruction.trim() || busy"
            data-send-edit
            @click="send"
          >
            Send
          </button>
          <button type="button" class="px-2 py-2 hover:text-white" @click="stopPainting">
            Cancel
          </button>
        </div>
        <p class="text-xs text-white/60">
          Say what to paint, not what's wrong. With nothing painted, the whole picture is repainted.
        </p>
      </div>
    </template>
  </ImageViewer>
</template>
