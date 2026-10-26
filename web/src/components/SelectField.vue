<script setup lang="ts">
import Icon from './Icon.vue'

/**
 * A dropdown in a form, its options as its slot. The browser's own caret sits hard against the
 * right edge and can't be moved, so it's hidden and the chevron icon drawn in its place, in from
 * the edge. Attributes (`data-*`, `disabled`, `title`) go to the `<select>` itself.
 */
defineOptions({ inheritAttrs: false })
const value = defineModel<unknown>()
</script>

<template>
  <span class="relative flex min-w-0">
    <select v-model="value" class="field w-full min-w-0 appearance-none pr-9" v-bind="$attrs">
      <slot />
    </select>
    <Icon
      name="chevron-down"
      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
    />
  </span>
</template>
