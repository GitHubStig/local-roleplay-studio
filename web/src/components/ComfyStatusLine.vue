<script setup lang="ts">
import type { ComfyStatus } from '../api'

/**
 * Whether ComfyUI answers at Settings' address, and has what will run there, with a button to
 * check again. Shown on each Settings tab that sends work to ComfyUI.
 */
defineProps<{ status: ComfyStatus | 'checking' | null }>()
defineEmits<{ check: [] }>()
</script>

<template>
  <span class="flex items-center gap-2 text-sm" data-comfy-status>
    <span v-if="status === 'checking'" class="animate-pulse text-muted">Checking…</span>
    <template v-else-if="status?.up">
      <span v-if="status.ready" class="text-ok">
        Up: ComfyUI {{ status.version }} on {{ status.device }}, with the files it needs.
      </span>
      <span v-else class="text-warn">
        Up (ComfyUI {{ status.version }}), but {{ status.missing }}
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
