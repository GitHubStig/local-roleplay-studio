<script setup lang="ts">
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import SuggestionNote, { type Hint } from './SuggestionNote.vue'

/** One of a Scenario's text parts: blank leaves it to the Text Model, unless a suggestion is taken. */
defineProps<{
  /** The field's name, as Expand's suggestions have it: `place`, `people.<id>.goal`. */
  field: string
  label: string
  /** What's suggested for it, when it can be suggested for. */
  hint?: Hint
  disabled?: boolean
}>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ suggest: [] }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <CollapsibleTextarea
      :id="field"
      v-model="value"
      :label="label"
      :disabled="disabled"
      placeholder="Left to the Text Model"
      always-open
    />
    <SuggestionNote
      v-if="hint && !value.trim()"
      :hint="hint"
      :disabled="disabled"
      @use="value = hint!.text!"
      @suggest="emit('suggest')"
    />
  </div>
</template>
