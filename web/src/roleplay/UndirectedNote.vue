<script setup lang="ts">
/**
 * Beside Listen, when a line was spoken as written because directing it failed (the Text Model
 * crashed, say): says so, with why on hover, and offers to speak it again.
 */
defineProps<{ reason: string; busy: boolean }>()
defineEmits<{ again: [] }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs not-italic text-warn" :title="reason" data-undirected>
    · spoken as written: directing it failed
    <button
      type="button"
      class="underline-offset-2 hover:underline disabled:opacity-50"
      :disabled="busy"
      data-speak-again
      @click="$emit('again')"
    >
      Speak again
    </button>
  </span>
</template>
