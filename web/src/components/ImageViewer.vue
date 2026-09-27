<script setup lang="ts">
import { ref, watch } from 'vue'
import FrameImage from './FrameImage.vue'

/**
 * A full-window look at one image: pinch to zoom, drag or two-finger scroll to pan, double-click
 * to reset (all from FrameImage). Esc, the close button or a click anywhere outside the image
 * closes it.
 */
const props = defineProps<{
  /** The image to show; null keeps the viewer closed. */
  src: string | null
  alt?: string
}>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => props.src,
  (src) => {
    const el = dialog.value
    if (!el) return
    if (src && !el.open) el.showModal()
    else if (!src && el.open) el.close()
  },
  { flush: 'post' },
)

/** A click that isn't on the image itself (the dimmed backdrop, the space around it) closes. */
function onClick(e: MouseEvent) {
  if (!(e.target as Element).closest('[data-image-frame], [data-viewer-controls]')) {
    dialog.value?.close()
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/85"
    data-image-viewer
    @click="onClick"
    @close="emit('close')"
  >
    <div v-if="src" class="flex h-full w-full flex-col p-4 sm:p-8">
      <div class="flex justify-end gap-3 pb-2 text-sm text-white/80" data-viewer-controls>
        <a :href="src" target="_blank" class="hover:text-white hover:underline">Open full size</a>
        <button type="button" class="hover:text-white" aria-label="Close" @click="dialog?.close()">
          Close ✕
        </button>
      </div>
      <FrameImage :src="src" :alt="alt" bare instant />
    </div>
  </dialog>
</template>
