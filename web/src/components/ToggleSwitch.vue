<script setup lang="ts">
/**
 * An on/off Setting: its title and what it does, with a switch beside them. The switch is a
 * checkbox drawn as one (`role="switch"`), so it works from the keyboard and reads as a switch.
 * `#after` holds anything said under the description (why it can't be turned on, say).
 */
defineProps<{ title: string; disabled?: boolean }>()
const on = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex items-start justify-between gap-4" :class="{ 'cursor-pointer': !disabled }">
    <span class="flex flex-col gap-0.5">
      <span :class="{ 'text-muted': disabled }">{{ title }}</span>
      <span v-if="$slots.default" class="text-sm text-muted"><slot /></span>
      <slot name="after" />
    </span>
    <input v-model="on" type="checkbox" role="switch" class="switch mt-0.5" :disabled="disabled" />
  </label>
</template>

<style scoped>
@reference "../style.css";

.switch {
  @apply relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-fg disabled:cursor-not-allowed disabled:opacity-40;
}
.switch::before {
  @apply absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-muted transition-transform content-[''];
}
.switch:checked::before {
  @apply translate-x-4 bg-canvas;
}
.switch:focus-visible {
  @apply outline-2 outline-offset-2 outline-fg;
}
</style>
