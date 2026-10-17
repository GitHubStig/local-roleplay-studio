<script setup lang="ts">
import type { AutosaveStatus } from '../composables/useAutosave'

/**
 * Where a panel that saves itself (`useAutosave`) stands: unsaved, saving, saved or refused, and
 * Revert while it differs from when it was opened.
 */
defineProps<{
  status: AutosaveStatus
  canRevert: boolean
  disabled?: boolean
  /** Said while saving, e.g. that it waits for the render running. */
  savingText?: string
  /** Said once saved, e.g. when it applies. */
  savedText?: string
}>()
const emit = defineEmits<{ revert: [] }>()
</script>

<template>
  <!-- Nothing to say, no room taken: the line appearing is what shows there's something unsaved. -->
  <div v-if="status.kind !== 'idle' || canRevert" class="flex items-center gap-2 text-xs" data-save-status>
    <span v-if="status.kind === 'unsaved'" class="text-muted">Saves when you click away</span>
    <span v-else-if="status.kind === 'saving'" class="animate-pulse text-muted">
      {{ savingText ?? 'Saving…' }}
    </span>
    <span v-else-if="status.kind === 'saved'" class="text-muted">
      Saved<template v-if="savedText"> · {{ savedText }}</template>
    </span>
    <span v-else-if="status.kind === 'refused'" class="min-w-0 text-danger" role="alert">
      Not saved: {{ status.why }}
    </span>
    <button
      v-if="canRevert"
      type="button"
      class="ml-auto shrink-0 rounded px-1.5 text-muted hover:text-fg disabled:opacity-50"
      title="Put back what was here when you opened it"
      :disabled="disabled"
      data-revert
      @click="emit('revert')"
    >
      Revert
    </button>
  </div>
</template>
