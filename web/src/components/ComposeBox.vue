<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { useTemplateRef } from 'vue'

/**
 * Where the player writes the next Action (a Chain, a Storyboard) or Message (a Roleplay): Enter
 * sends, Shift+Enter starts a new line. Three lines in a box of its own; `floating`, inside the
 * floating text box (`FloatingBox`), it starts at one line and grows with what's typed, up to a
 * few, with no box of its own.
 */
const props = defineProps<{ placeholder: string; disabled?: boolean; floating?: boolean }>()
const emit = defineEmits<{ send: [] }>()
const value = defineModel<string>({ required: true })
const box = useTemplateRef<HTMLTextAreaElement>('box')
if (props.floating) useTextareaAutosize({ element: box, input: value })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    emit('send')
  }
}
</script>

<template>
  <textarea
    ref="box"
    v-model="value"
    :rows="floating ? 1 : 3"
    class="flex-1 resize-none disabled:opacity-60"
    :class="floating
      ? 'max-h-40 min-h-9 bg-transparent px-2 py-1.5 outline-none placeholder:text-muted'
      : 'rounded-lg border border-line bg-surface p-3'"
    :placeholder="placeholder"
    :disabled="disabled"
    @keydown="onKeydown"
  />
</template>
