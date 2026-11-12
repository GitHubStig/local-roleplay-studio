<script setup lang="ts">
import ItemList from '../components/ItemList.vue'
import SuggestButton, { type Hint } from './SuggestButton.vue'

/**
 * A list of Truths, the story's or one Person's, as a row (`ScenarioField`'s shape): "Truths" on
 * the left, the list (`ItemList`) with Expand's offer and Suggest on the right.
 */
defineProps<{
  /** As Expand's suggestions name it: `truths`, `people.<id>.truths`. */
  field: string
  /** What they are, on hover over the row's name, and to screen readers. */
  label: string
  hint: Hint
  disabled?: boolean
}>()
const truths = defineModel<string[]>({ required: true })
const emit = defineEmits<{ suggest: [] }>()
</script>

<template>
  <div class="group/part grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 max-sm:grid-cols-1" :data-truths="field">
    <span class="pt-1.5 text-sm text-muted" :title="label">Truths</span>
    <div class="flex min-w-0 flex-col gap-1 pt-1 text-xs">
      <ItemList v-model="truths" :label="label" noun="Truth" bare :disabled="disabled">
        <template #empty>
          <p v-if="hint.offer" class="italic" data-offer>Suggested: {{ hint.offer }}</p>
        </template>
        <template #actions>
          <SuggestButton
            :class="{ 'opacity-0 group-focus-within/part:opacity-100 group-hover/part:opacity-100 touch:opacity-100': !hint.busy }"
            :hint="hint"
            :disabled="disabled"
            @suggest="emit('suggest')"
          />
        </template>
      </ItemList>
      <p v-if="hint.error" class="text-danger" data-suggest-error>{{ hint.error }}</p>
    </div>
  </div>
</template>
