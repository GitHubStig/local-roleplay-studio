<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '../api'
import { renderSteps } from '../jobs'
import { useImageModels, useSettingsOptions } from '../composables/useSettingsOptions'
import Icon from './Icon.vue'

/**
 * A render's or an edit's two steps in a Session with reference sheets, once it has reached its
 * face pass: rendered (by its Image Model) or edited (by its edit model), then the faces being
 * repainted, repainted, or skipped and why. Nothing for any other job.
 */
const props = defineProps<{ job: Job }>()
const { labelOf } = useImageModels()
const options = useSettingsOptions()
const editModel = (id: string) => options.value?.editModels.find((m) => m.id === id)?.label ?? id
const made = computed(() => {
  const { job } = props
  if (job.kind === 'edit') {
    const model = job.edit?.model
    return `Edited${model ? ` · ${editModel(model)}` : ''}`
  }
  return `Rendered${job.image ? ` · ${labelOf(job.image.imageModel)}` : ''}`
})
const steps = computed(() => renderSteps(props.job, made.value))
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
