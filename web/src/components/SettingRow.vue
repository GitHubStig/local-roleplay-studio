<script setup lang="ts">
/**
 * A row of Settings: what it is and what it does on the left (`note`, then anything said under it,
 * `after`), its control on the right (the default slot); one under the other on a phone. A `label`
 * by default, so a click on the words reaches a lone control; a `div` (`as`) for a row with
 * several. An on/off setting is a `ToggleSwitch`, which lays itself out the same way.
 */
withDefaults(defineProps<{ label: string; as?: 'label' | 'div'; disabled?: boolean }>(), {
  as: 'label',
  disabled: false,
})
</script>

<template>
  <component
    :is="as"
    class="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-start"
    data-setting-row
  >
    <span class="flex min-w-0 flex-col gap-0.5">
      <span :class="{ 'text-muted': disabled }">{{ label }}</span>
      <span v-if="$slots.note" class="text-sm text-muted"><slot name="note" /></span>
      <slot name="after" />
    </span>
    <span class="flex min-w-0 flex-col gap-1"><slot /></span>
  </component>
</template>
