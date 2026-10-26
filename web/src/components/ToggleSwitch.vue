<script setup lang="ts">
/**
 * An on/off Setting: its title and what it does, with a switch beside them, squarish like the
 * theme toggle in the header. Its knob says Off or On and slides across as it changes (On filled,
 * so it stands out). Underneath it's a checkbox (`role="switch"`), so it works from the keyboard
 * and reads as a switch. `#after` holds anything said under the description (why it can't be
 * turned on, say).
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
    <input v-model="on" type="checkbox" role="switch" class="switch sr-only" :disabled="disabled" />
    <span class="track" aria-hidden="true">
      <span class="knob">
        <span class="off">Off</span>
        <span class="on">On</span>
      </span>
    </span>
  </label>
</template>

<style scoped>
@reference "../style.css";

/* A bordered track, its knob longer than half of it, sliding right when on. */
.track {
  @apply relative mt-0.5 h-6 w-14 shrink-0 rounded-lg border border-line;
}
.knob {
  @apply absolute left-0.5 top-0.5 flex h-[1.125rem] w-8 items-center justify-center rounded-md border border-line bg-surface text-xs text-fg shadow-sm transition duration-150 ease-out;
}
.switch:checked + .track .knob {
  @apply translate-x-[1.125rem] border-fg bg-fg text-canvas;
}
.switch:checked + .track .off,
.switch:not(:checked) + .track .on {
  @apply hidden;
}
.switch:focus-visible + .track {
  @apply outline-2 outline-offset-2 outline-fg;
}
.switch:disabled + .track {
  @apply cursor-not-allowed opacity-40;
}
</style>
