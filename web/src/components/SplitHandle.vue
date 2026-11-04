<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ref, useTemplateRef } from 'vue'

/**
 * A splitter between two side-by-side panes: dragged, or moved with the arrow keys, it sets the
 * width in px of the pane on its right (`width`), measured from the right edge of the element
 * holding both, kept between `min` and as much as leaves `leave` px for the pane on its left.
 */
const props = defineProps<{ min: number; leave: number; label: string }>()
const width = defineModel<number>({ required: true })

const handle = useTemplateRef<HTMLElement>('handle')
const dragging = ref(false)
const STEP = 32

function clamp(px: number) {
  const whole = handle.value?.parentElement?.getBoundingClientRect().width ?? Infinity
  return Math.round(Math.max(props.min, Math.min(px, whole - props.leave)))
}
function onDown(e: PointerEvent) {
  dragging.value = true
  handle.value?.setPointerCapture(e.pointerId)
  e.preventDefault()
}
useEventListener(handle, 'pointermove', (e: PointerEvent) => {
  const box = handle.value?.parentElement?.getBoundingClientRect()
  if (dragging.value && box) width.value = clamp(box.right - e.clientX)
})
useEventListener(handle, 'pointerup', () => (dragging.value = false))
function onKey(e: KeyboardEvent) {
  const by = { ArrowLeft: STEP, ArrowRight: -STEP }[e.key]
  if (!by) return
  width.value = clamp(width.value + by)
  e.preventDefault()
}
</script>

<template>
  <div
    ref="handle"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="width"
    tabindex="0"
    class="group flex w-2 shrink-0 cursor-col-resize touch-none justify-center outline-none"
    data-split-handle
    @pointerdown="onDown"
    @keydown="onKey"
  >
    <div
      class="h-full w-px bg-line group-hover:w-0.5 group-hover:bg-fg group-focus-visible:w-0.5 group-focus-visible:bg-fg"
      :class="{ 'w-0.5 bg-fg': dragging }"
    />
  </div>
</template>
