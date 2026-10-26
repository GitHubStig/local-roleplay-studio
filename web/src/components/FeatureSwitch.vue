<script setup lang="ts">
import type { Availability } from '../api'
import ToggleSwitch from './ToggleSwitch.vue'

/**
 * A Feature's switch in Settings. One this machine can't run shows why, and stays off whatever
 * the setting says.
 */
const props = defineProps<{ availability: Availability; title: string }>()
const on = defineModel<boolean>({ required: true })
</script>

<template>
  <ToggleSwitch
    :model-value="on && props.availability.available"
    :title="title"
    :disabled="!availability.available"
    @update:model-value="on = $event"
  >
    <slot />
    <template #after>
      <span v-if="!availability.available" class="text-sm text-warn" data-unavailable>
        Not available here: {{ availability.reason }}.
      </span>
    </template>
  </ToggleSwitch>
</template>
