<script setup lang="ts">
import Icon from '../components/Icon.vue'
import SuggestButton, { type Hint } from './SuggestButton.vue'
import TruthBox from './TruthBox.vue'

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
    <TruthBox
      v-for="(truth, i) in truths"
      :key="i"
      :model-value="truth"
      :label="`${label} ${i + 1}`"
      :disabled="disabled"
      @update:model-value="set(i, $event)"
      @remove="remove(i)"
    />
    <p v-if="!truths.length && hint.offer" class="italic" data-offer>Suggested: {{ hint.offer }}</p>
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex items-center gap-1 rounded py-0.5 hover:text-fg disabled:opacity-50"
        :disabled="disabled"
        data-add-truth
        @click="add()"
      >
        <Icon name="plus" class="size-4" />
        Add a Truth
      </button>
      <SuggestButton :hint="hint" :disabled="disabled" @suggest="emit('suggest')" />
    </div>
    <p v-if="hint.error" class="text-danger" data-suggest-error>{{ hint.error }}</p>
  </div>
</template>
