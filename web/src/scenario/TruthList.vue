<script setup lang="ts">
import Icon from '../components/Icon.vue'
import SuggestionNote, { type Hint } from './SuggestionNote.vue'

/** A list of Truths, the story's or one Person's: each editable, and removed with its button. */
defineProps<{
  /** As Expand's suggestions name it: `truths`, `people.<id>.truths`. */
  field: string
  label: string
  hint: Hint
  disabled?: boolean
}>()
const truths = defineModel<string[]>({ required: true })
const emit = defineEmits<{ suggest: [] }>()

const set = (i: number, text: string) =>
  (truths.value = truths.value.map((t, j) => (j === i ? text : t)))
const remove = (i: number) => (truths.value = truths.value.filter((_, j) => j !== i))
const add = (text = '') => (truths.value = [...truths.value, text])
</script>

<template>
  <div class="flex flex-col gap-1 text-xs text-muted" :data-truths="field">
    {{ label }}
    <div v-for="(truth, i) in truths" :key="i" class="flex items-center gap-1">
      <input
        :value="truth"
        type="text"
        class="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-fg disabled:opacity-60"
        :disabled="disabled"
        :aria-label="`${label} ${i + 1}`"
        data-truth
        @input="set(i, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="rounded p-1 hover:text-danger disabled:opacity-50"
        :disabled="disabled"
        title="Remove this Truth"
        data-remove-truth
        @click="remove(i)"
      >
        <Icon name="x" />
      </button>
    </div>
    <SuggestionNote
      v-if="!truths.length"
      :hint="hint"
      :disabled="disabled"
      @use="add(hint.text)"
      @suggest="emit('suggest')"
    />
    <button
      type="button"
      class="flex items-center gap-1 self-start rounded py-0.5 hover:text-fg disabled:opacity-50"
      :disabled="disabled"
      data-add-truth
      @click="add()"
    >
      <Icon name="plus" class="size-4" />
      Add a Truth
    </button>
  </div>
</template>
