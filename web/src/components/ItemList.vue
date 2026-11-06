<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import Icon from './Icon.vue'
import ItemBox from './ItemBox.vue'

/**
 * A list of short texts, a box each (a Scenario's Truths, a Cast's others): each editable, removed
 * with its button, and another added under them, with the focus in it. `removed` follows a
 * removal, for a form that saves on leaving a box to save that too. `empty` shows while there are
 * none; `actions` sits beside the Add button.
 */
const props = defineProps<{
  label: string
  /** What one item is, for its buttons: "Add a Truth", "Remove this Truth". */
  noun: string
  disabled?: boolean
}>()
const items = defineModel<string[]>({ required: true })
const emit = defineEmits<{ removed: [] }>()

const boxes = useTemplateRef<InstanceType<typeof ItemBox>[]>('boxes')
const set = (i: number, text: string) => (items.value = items.value.map((t, j) => (j === i ? text : t)))
function remove(i: number) {
  items.value = items.value.filter((_, j) => j !== i)
  emit('removed')
}
async function add() {
  items.value = [...items.value, '']
  await nextTick()
  boxes.value?.at(-1)?.focus()
}
</script>

<template>
  <div class="flex flex-col gap-1 text-xs text-muted" data-items>
    {{ label }}
    <ItemBox
      v-for="(item, i) in items"
      ref="boxes"
      :key="i"
      :model-value="item"
      :label="`${label} ${i + 1}`"
      :remove-title="`Remove this ${props.noun}`"
      :disabled="disabled"
      @update:model-value="set(i, $event)"
      @remove="remove(i)"
    />
    <slot v-if="!items.length" name="empty" />
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex items-center gap-1 rounded py-0.5 hover:text-fg disabled:opacity-50"
        :disabled="disabled"
        data-add-item
        @click="add"
      >
        <Icon name="plus" class="size-4" />
        Add {{ /^[aeiou]/i.test(props.noun) ? 'an' : 'a' }} {{ props.noun }}
      </button>
      <slot name="actions" />
    </div>
  </div>
</template>
