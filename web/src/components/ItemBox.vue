<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import Icon from './Icon.vue'

/** One item of a list (`ItemList`): a box as tall as its text, and its Remove button. */
/** `bare`: text, boxed only while it's pointed at or edited, among parts drawn that way. */
defineProps<{ label: string; removeTitle: string; disabled?: boolean; bare?: boolean }>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ remove: [] }>()

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
useTextareaAutosize({ element: textarea, input: value })
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="flex items-start gap-1">
    <textarea
      ref="textarea"
      v-model="value"
      rows="1"
      class="min-w-0 flex-1 resize-none overflow-hidden rounded border text-sm text-fg disabled:opacity-60"
      :class="bare
        ? 'border-transparent bg-transparent px-1.5 py-1 hover:border-line focus:border-line focus:bg-surface focus:outline-none'
        : 'border-line bg-surface p-2'"
      :disabled="disabled"
      :aria-label="label"
      data-item
    />
    <button
      type="button"
      class="rounded p-1 hover:text-danger disabled:opacity-50"
      :class="bare ? 'pt-1.5' : 'pt-2'"
      :disabled="disabled"
      :title="removeTitle"
      data-remove-item
      @click="emit('remove')"
    >
      <Icon name="x" />
    </button>
  </div>
</template>
