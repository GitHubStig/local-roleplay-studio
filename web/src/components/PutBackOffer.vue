<script setup lang="ts">
import Icon from './Icon.vue'
import type { Offered } from '../composables/usePutBack'

/** What Undo couldn't put back in the box, beside it, with Use it to swap it in (`usePutBack`). */
defineProps<{ offered: Offered }>()
defineEmits<{ use: []; dismiss: [] }>()
</script>

<template>
  <p class="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted" data-put-back>
    <span class="min-w-0 truncate" :title="offered.text">
      {{ offered.label }}: <span class="italic text-fg">{{ offered.text }}</span>
    </span>
    <button
      type="button"
      class="shrink-0 rounded border border-line px-2 py-0.5 text-xs hover:text-fg"
      title="Put this in the box, and keep what's there now here instead"
      data-put-back-use
      @click="$emit('use')"
    >
      Use it
    </button>
    <button
      type="button"
      class="shrink-0 text-muted hover:text-fg"
      title="Dismiss"
      data-put-back-dismiss
      @click="$emit('dismiss')"
    >
      <Icon name="x" />
      <span class="sr-only">Dismiss</span>
    </button>
  </p>
</template>
