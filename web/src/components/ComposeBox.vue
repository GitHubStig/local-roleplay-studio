<script setup lang="ts">
/**
 * Where the player writes the next Action (a Chain, a Storyboard) or Message (a Roleplay): three
 * lines, Enter sends, Shift+Enter starts a new line. The same box in every kind of Session.
 */
defineProps<{ placeholder: string; disabled?: boolean }>()
const emit = defineEmits<{ send: [] }>()
const value = defineModel<string>({ required: true })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    emit('send')
  }
}
</script>

<template>
  <textarea
    v-model="value"
    rows="3"
    class="flex-1 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
    :placeholder="placeholder"
    :disabled="disabled"
    @keydown="onKeydown"
  />
</template>
