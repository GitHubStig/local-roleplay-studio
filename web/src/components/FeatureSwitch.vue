<script setup lang="ts">
import type { Availability } from '../api'

/**
 * A Feature's switch in Settings. One this machine can't run shows why, and stays off whatever
 * the setting says.
 */
defineProps<{ availability: Availability; title: string }>()
const on = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex items-start gap-2">
    <input
      type="checkbox"
      class="mt-1"
      :checked="on && availability.available"
      :disabled="!availability.available"
      @change="on = ($event.target as HTMLInputElement).checked"
    />
    <span class="flex flex-col gap-0.5">
      <span :class="{ 'text-muted': !availability.available }">{{ title }}</span>
      <span class="text-sm text-muted"><slot /></span>
      <span v-if="!availability.available" class="text-sm text-warn" data-unavailable>
        Not available here: {{ availability.reason }}.
      </span>
    </span>
  </label>
</template>
