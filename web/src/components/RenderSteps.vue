<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '../api'
import { renderSteps } from '../jobs'
import { useImageModels } from '../composables/useSettingsOptions'
import Icon from './Icon.vue'

/**
 * A render's two steps in a Session with reference sheets, once it has reached its face pass:
 * rendered (by its Image Model), then the faces being repainted, repainted, or skipped and why.
 * Nothing for any other job.
 */
const props = defineProps<{ job: Job }>()
const { labelOf } = useImageModels()
const steps = computed(() =>
  renderSteps(props.job, `Rendered${props.job.image ? ` · ${labelOf(props.job.image.imageModel)}` : ''}`)
)
</script>

<template>
  <span v-if="steps.length" class="mt-0.5 flex flex-col text-xs" data-render-steps>
    <span v-for="step in steps" :key="step.text" class="flex items-start gap-1" :data-step="step.state">
      <Icon v-if="step.state === 'running'" name="spinner" class="mt-px shrink-0 animate-spin text-info" />
      <Icon v-else-if="step.state === 'done'" name="check" class="mt-px shrink-0 text-muted" />
      <Icon v-else name="x" class="mt-px shrink-0 text-muted" />
      <span class="min-w-0">
        <span :class="step.state === 'running' ? 'text-fg' : 'text-muted'">{{ step.text }}</span>
        <span v-if="step.note" class="block text-muted">{{ step.note }}</span>
      </span>
    </span>
  </span>
</template>
