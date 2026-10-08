<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'
import FrameImage from './FrameImage.vue'

/**
 * A full-window look at one image: pinch to zoom, drag or two-finger scroll to pan, double-click
 * to reset (all from FrameImage). Esc, the close button or a click anywhere outside the image
 * closes it. Given a `label` or `hasPrevious` / `hasNext`, the ‹ › buttons and the arrow keys ask
 * for the image before or after; the parent decides which that is.
 */
const props = defineProps<{
  /** The image to show; null keeps the viewer closed. */
  src: string | null
  alt?: string
  /** Where this image sits, e.g. "Frame 28 · 4 of 7". */
  label?: string
  hasPrevious?: boolean
  hasNext?: boolean
}>()
const emit = defineEmits<{ close: []; previous: []; next: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

/**
 * The arrow keys step through while the viewer is open, wherever the focus is: a ‹ › button that
 * had it is disabled at the first or last image, and the browser then drops the focus out of the
 * dialog, which would leave the keys going nowhere (and listened for on the dialog, they did).
 */
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (!dialog.value?.open) return
  if (e.key === 'ArrowLeft' && props.hasPrevious) {
    e.preventDefault()
    emit('previous')
  } else if (e.key === 'ArrowRight' && props.hasNext) {
    e.preventDefault()
    emit('next')
  }
})

watch(
  () => props.src,
  (src) => {
    const el = dialog.value
    if (!el) return
    if (src && !el.open) {
      el.showModal()
      // The dialog itself, not its first button: a ‹ › focused shows a ring, and one disabled under
      // the focus (the last image) drops it out of the dialog.
      el.focus()
    }
    else if (!src && el.open) el.close()
  },
  { flush: 'post' },
)

/**
 * A click that isn't on the image or its controls (the dimmed backdrop, the space around it)
 * closes; a pan that starts on the image and lets go outside it doesn't.
 */
const controls = useTemplateRef<HTMLElement>('controls')
onClickOutside(
  () => dialog.value?.querySelector<HTMLElement>('[data-image-frame]'),
  () => dialog.value?.open && dialog.value.close(),
  { ignore: [controls] },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 outline-none backdrop:bg-black/85"
    tabindex="-1"
    data-image-viewer
    @close="emit('close')"
  >
    <div v-if="src" class="flex h-full w-full flex-col p-4 sm:p-8">
      <div
        ref="controls"
        class="flex items-center justify-end gap-3 pb-2 text-sm text-white/80"
        data-viewer-controls
      >
        <template v-if="label || hasPrevious || hasNext">
          <button
            type="button"
            class="px-1 text-lg leading-none hover:text-white disabled:opacity-30"
            :disabled="!hasPrevious"
            aria-label="Previous (←)"
            title="Previous (←)"
            data-previous
            @click="emit('previous')"
          >
            ‹
          </button>
          <span v-if="label" class="tabular-nums" data-viewer-label>{{ label }}</span>
          <button
            type="button"
            class="mr-auto px-1 text-lg leading-none hover:text-white disabled:opacity-30"
            :disabled="!hasNext"
            aria-label="Next (→)"
            title="Next (→)"
            data-next
            @click="emit('next')"
          >
            ›
          </button>
        </template>
        <a :href="src" target="_blank" class="hover:text-white hover:underline">Open full size</a>
        <button type="button" class="hover:text-white" aria-label="Close" @click="dialog?.close()">
          Close ✕
        </button>
      </div>
      <FrameImage :src="src" :alt="alt" bare instant zoom />
    </div>
  </dialog>
</template>
