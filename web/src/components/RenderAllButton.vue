<script setup lang="ts">
/** Render all: queues a render of each Frame that needs one, as many as `count` says. */
defineProps<{ count: number; title: string }>()
defineEmits<{ render: [] }>()
</script>

<template>
  <button
    type="button"
    class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
    :disabled="!count"
    :title="title"
    data-render-all
    @click="$emit('render')"
  >
    Render all{{ count ? ` (${count})` : '' }}
  </button>
</template>
