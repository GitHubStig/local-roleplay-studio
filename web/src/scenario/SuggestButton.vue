<script setup lang="ts">
import Icon from '../components/Icon.vue'

/** Suggest, beside a part of a Scenario: writes a suggestion into it, as Roleplay's Suggest does. */
export interface Hint {
  /** Expand's suggestion for the part, not yet taken: shown in the empty part, and Suggest's first. */
  offer?: string
  /** A suggestion is being written. */
  busy: boolean
  /** Why the last one failed, for the part to show; '' for none. */
  error: string
}
defineProps<{ hint: Hint; disabled?: boolean }>()
const emit = defineEmits<{ suggest: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex shrink-0 items-center gap-1 rounded border border-line bg-surface px-1.5 py-px text-[11px] leading-[14px] text-muted hover:border-fg hover:text-fg disabled:opacity-50"
    :disabled="disabled || hint.busy"
    title="Write a suggestion here, from the story and what's typed; again for another"
    data-suggest
    @click="emit('suggest')"
  >
    <Icon v-if="hint.busy" name="spinner" class="size-3 animate-spin" />
    Suggest
  </button>
</template>
