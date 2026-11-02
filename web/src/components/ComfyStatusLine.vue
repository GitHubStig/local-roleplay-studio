<script setup lang="ts">
import { computed } from 'vue'
import type { ComfyStatus, ComfyUses } from '../api'

/**
 * Whether a ComfyUI Backend answers at its address, and has what will run there, with a button to
 * check again. Shown on each Settings tab that sends work to ComfyUI, with what that tab sends.
 */
const props = defineProps<{
  status: ComfyStatus | 'checking' | null
  /** What of the check to show: a tab's own work, none if nothing's checked for it; all left out. */
  uses?: (keyof ComfyUses)[]
}>()
defineEmits<{ check: [] }>()

/** What's missing for what's shown, if anything. */
const missing = computed(() => {
  const status = props.status
  if (typeof status !== 'object' || !status?.up) return ''
  return Object.entries(status.missing)
    .filter(([use]) => !props.uses || props.uses.includes(use as keyof ComfyUses))
    .map(([, what]) => what)
    .join('; ')
})
</script>

<template>
  <span class="flex items-center gap-2 text-sm" data-comfy-status>
    <span v-if="status === 'checking'" class="animate-pulse text-muted">Checking…</span>
    <template v-else-if="status?.up">
      <span v-if="missing" class="text-warn">
        Up (ComfyUI {{ status.version }}), but {{ missing }}
      </span>
      <span v-else class="text-ok">
        Up: ComfyUI {{ status.version }} on {{ status.device }}{{
          uses?.length === 0 ? '.' : ', with the files it needs.'
        }}
      </span>
    </template>
    <span v-else-if="status" class="text-danger">Down: {{ status.error }}</span>
    <button
      type="button"
      class="ml-auto shrink-0 rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
      :disabled="status === 'checking'"
      data-check-comfy
      @click="$emit('check')"
    >
      Check
    </button>
  </span>
</template>
