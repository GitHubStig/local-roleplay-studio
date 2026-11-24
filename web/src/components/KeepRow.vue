<script setup lang="ts">
import Icon from './Icon.vue'

/**
 * One part's row under What to keep, folded: its name, what's kept and how much, and a caret that
 * points right while it's folded and down once it's open (as the mockup draws it), opening to its
 * ticks (the slot). Beside the name on a wide screen, under it on a phone.
 */
defineProps<{ name: string; status: string; size: string }>()
</script>

<template>
  <details class="group border-b border-line/60">
    <summary class="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-1.5 hover:bg-canvas/60 [&::-webkit-details-marker]:hidden">
      <span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
        <span class="font-semibold sm:flex-1">{{ name }}</span>
        <span class="text-xs text-muted sm:hidden">{{ status }} · {{ size }}</span>
      </span>
      <span class="hidden text-sm text-muted sm:inline" data-keep-status>{{ status }}</span>
      <span class="hidden w-20 text-right text-sm tabular-nums sm:inline">{{ size }}</span>
      <Icon name="chevron-right" class="text-muted transition-transform group-open:rotate-90" data-keep-caret />
    </summary>
    <slot />
  </details>
</template>
