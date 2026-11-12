<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { onDeactivated, ref, useTemplateRef } from 'vue'

/**
 * A button and the panel it opens over the screen: a menu (the picture's Clip and 3D, the text
 * box's ⋯), the Session's models and switches, a Frame's jobs. Closed by the button again, Esc, a
 * click outside, or leaving the screen. On a phone the panel opens as a sheet from the bottom, the
 * screen still in view above it. The button is the `button` slot's, given `open` and `toggle`; the
 * panel is the default slot's, given `close`.
 */
withDefaults(
  defineProps<{
    /** Which edge of the button the panel lines up with. */
    align?: 'start' | 'end'
    /** Whether it opens below the button or above it (a toolbar at a picture's foot). */
    side?: 'below' | 'above'
    /** The panel's own classes: its width, its padding. */
    panelClass?: string
  }>(),
  { align: 'start', side: 'below', panelClass: 'w-72 p-1' },
)
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const toggle = () => (open.value = !open.value)
const close = () => (open.value = false)
onClickOutside(root, close)
onKeyStroke('Escape', () => open.value && close())
onDeactivated(close)
defineExpose({ close })
</script>

<template>
  <div ref="root" class="relative" :data-open="open || undefined">
    <slot name="button" :open="open" :toggle="toggle" />
    <div
      v-if="open"
      class="z-40 overflow-y-auto rounded-xl border border-line bg-surface text-fg shadow-lg max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[70dvh] max-sm:w-auto! max-sm:rounded-b-none max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:absolute sm:max-h-[min(70dvh,36rem)]"
      :class="[
        panelClass,
        align === 'end' ? 'sm:right-0' : 'sm:left-0',
        side === 'above' ? 'sm:bottom-full sm:mb-2' : 'sm:top-full sm:mt-2',
      ]"
      data-pop-panel
      @click.stop
    >
      <slot :close="close" />
    </div>
  </div>
</template>
