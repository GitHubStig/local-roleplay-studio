<script setup lang="ts">
import { useAttrs } from 'vue'
import Icon from './Icon.vue'

/**
 * A dropdown, its options as its slot. The browser's own caret sits hard against the right edge
 * and can't be moved, so it's hidden and the chevron icon drawn in its place, in from the edge, in
 * the colour of the text around it. It looks like a form's field (`.field`) unless given a `class`
 * of its own; `compact` is for a small one in a line of text, its caret closer in. Attributes
 * (`class`, `data-*`, `disabled`, `title`) go to the `<select>` itself.
 */
defineOptions({ inheritAttrs: false })
defineProps<{ compact?: boolean }>()
const value = defineModel<unknown>()
const attrs = useAttrs()
</script>

<template>
  <span class="relative flex min-w-0">
    <select
      v-model="value"
      v-bind="attrs"
      :class="[
        attrs.class ?? 'field',
        'min-w-0 cursor-pointer appearance-none disabled:cursor-default',
        // A form's field fills its column; a compact one sizes to its longest option.
        compact ? '!pr-6' : 'w-full !pr-9',
      ]"
    >
      <slot />
    </select>
    <Icon
      name="chevron-down"
      class="pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-70"
      :class="compact ? 'right-1.5' : 'right-3'"
    />
  </span>
</template>
