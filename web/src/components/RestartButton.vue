<script setup lang="ts">
/**
 * Restart…, at the right of the heading of what it unlocks (a Roleplay's Cast, a Storyboard's
 * Look): quiet until hovered, as it deletes work once confirmed. `title` says what goes and what
 * stays.
 */
defineProps<{ title: string; disabled?: boolean }>()
const emit = defineEmits<{ restart: [] }>()
</script>

<template>
  <button
    type="button"
    class="ml-auto shrink-0 rounded border border-line px-2 py-0.5 text-xs font-normal text-muted hover:border-danger hover:text-danger disabled:opacity-50"
    :disabled="disabled"
    :title="title"
    data-restart
    @click.prevent="emit('restart')"
  >
    Restart…
  </button>
</template>
