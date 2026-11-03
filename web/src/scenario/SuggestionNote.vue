<script setup lang="ts">
import Icon from '../components/Icon.vue'

/**
 * Under a blank part of a Scenario: what's suggested for it (by Expand, or asked for), with a
 * button to take it and one for another; or, with none, a button to ask for one.
 */
export interface Hint {
  /** The suggestion; none yet. */
  text?: string
  /** A suggestion is being asked for. */
  busy: boolean
  /** Why the last ask failed; '' for none. */
  error: string
}
defineProps<{ hint: Hint; disabled?: boolean }>()
const emit = defineEmits<{ use: []; suggest: [] }>()

const button =
  'shrink-0 rounded border border-line px-1.5 py-0.5 hover:border-fg hover:text-fg disabled:opacity-50'
</script>

<template>
  <p class="flex flex-wrap items-baseline gap-2 text-xs text-muted" data-suggestion>
    <template v-if="hint.busy">
      <Icon name="spinner" class="size-3.5 animate-spin self-center" />
      <span>Suggesting…</span>
    </template>
    <template v-else-if="hint.text">
      <span class="italic" data-suggestion-text>Suggested: {{ hint.text }}</span>
      <button type="button" :class="button" :disabled="disabled" data-use @click="emit('use')">
        Use
      </button>
      <button
        type="button"
        :class="button"
        :disabled="disabled"
        title="Ask for another suggestion"
        data-another
        @click="emit('suggest')"
      >
        Another
      </button>
    </template>
    <template v-else>
      <button
        type="button"
        :class="button"
        :disabled="disabled"
        title="Ask the Text Model for a suggestion"
        data-suggest
        @click="emit('suggest')"
      >
        Suggest
      </button>
      <span v-if="hint.error" class="text-danger">{{ hint.error }}</span>
    </template>
  </p>
</template>
