<script setup lang="ts">
import { computed } from 'vue'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import SuggestButton, { type Hint } from './SuggestButton.vue'

/** One of a Scenario's text parts: blank leaves it to the Text Model, unless a suggestion is taken. */
const props = defineProps<{
  /** The field's name, as Expand's suggestions have it: `place`, `people.<id>.goal`. */
  field: string
  label: string
  /** Its Suggest button's state; none for a part that can't be suggested for. */
  hint?: Hint
  disabled?: boolean
}>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ suggest: [] }>()

const placeholder = computed(() =>
  props.hint?.offer ? `Suggested: ${props.hint.offer}` : 'Left to the Text Model'
)
</script>

<template>
  <div class="flex flex-col gap-1">
    <CollapsibleTextarea
      :id="field"
      v-model="value"
      :label="label"
      :disabled="disabled || hint?.busy"
      :placeholder="placeholder"
      always-open
    >
      <template v-if="hint" #actions>
        <SuggestButton :hint="hint" :disabled="disabled" @suggest="emit('suggest')" />
      </template>
    </CollapsibleTextarea>
    <p v-if="hint?.error" class="text-xs text-danger" data-suggest-error>{{ hint.error }}</p>
  </div>
</template>
