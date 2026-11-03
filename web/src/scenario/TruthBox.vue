<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import Icon from '../components/Icon.vue'

/** One Truth in a list: a box as tall as its text, as the other parts are, and its Remove button. */
defineProps<{ label: string; disabled?: boolean }>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ remove: [] }>()

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
useTextareaAutosize({ element: textarea, input: value })
</script>

<template>
  <div class="flex items-start gap-1">
    <textarea
      ref="textarea"
      v-model="value"
      rows="1"
      class="min-w-0 flex-1 resize-none overflow-hidden rounded border border-line bg-surface p-2 text-sm text-fg disabled:opacity-60"
      :disabled="disabled"
      :aria-label="label"
      data-truth
    />
    <button
      type="button"
      class="rounded p-1 pt-2 hover:text-danger disabled:opacity-50"
      :disabled="disabled"
      title="Remove this Truth"
      data-remove-truth
      @click="emit('remove')"
    >
      <Icon name="x" />
    </button>
  </div>
</template>
