<script setup lang="ts">
import ItemList from '../components/ItemList.vue'
import SuggestButton, { type Hint } from './SuggestButton.vue'

/** A list of Truths, the story's or one Person's (`ItemList`), with Expand's offer and Suggest. */
defineProps<{
  /** As Expand's suggestions name it: `truths`, `people.<id>.truths`. */
  field: string
  label: string
  hint: Hint
  disabled?: boolean
}>()
const truths = defineModel<string[]>({ required: true })
const emit = defineEmits<{ suggest: [] }>()
</script>

<template>
  <div class="flex flex-col gap-1 text-xs" :data-truths="field">
    <ItemList v-model="truths" :label="label" noun="Truth" :disabled="disabled">
      <template #empty>
        <p v-if="hint.offer" class="italic" data-offer>Suggested: {{ hint.offer }}</p>
      </template>
      <template #actions>
        <SuggestButton :hint="hint" :disabled="disabled" @suggest="emit('suggest')" />
      </template>
    </ItemList>
    <p v-if="hint.error" class="text-danger" data-suggest-error>{{ hint.error }}</p>
  </div>
</template>
