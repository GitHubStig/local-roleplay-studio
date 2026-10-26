<script setup lang="ts">
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'

/**
 * One field of a Roleplay's Cast: a growing text box for the long ones (collapsible on its own
 * unless `alwaysOpen`), a one-line input for a name or the age.
 */
defineProps<{
  /** As `group.key`, e.g. `character.age`: remembers a long box's collapsed state, and tests find it by it. */
  id: string
  label: string
  long?: boolean
  value: string
  disabled?: boolean
  alwaysOpen?: boolean
}>()
const emit = defineEmits<{ input: [value: string] }>()
</script>

<template>
  <CollapsibleTextarea
    v-if="long"
    :id="id"
    :model-value="value"
    :label="label"
    :disabled="disabled"
    :always-open="alwaysOpen"
    @update:model-value="emit('input', $event)"
  />
  <label v-else class="flex flex-col gap-1 text-xs text-muted">
    {{ label }}
    <input
      :value="value"
      :type="id.endsWith('.age') ? 'number' : 'text'"
      class="rounded border border-line bg-surface px-2 py-1 text-sm text-fg disabled:opacity-60"
      :disabled="disabled"
      :data-field="id"
      @input="emit('input', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
