<script setup lang="ts">
import type { Job } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import Icon from './Icon.vue'
import { jobStatus } from '../jobs'

/** A Frame's queued, running and failed jobs, each cancellable (or retried) in place. */
defineProps<{
  jobs: readonly Job[]
  /** What the Session's own kind of work says it's doing, when it says more (see `jobStatus`). */
  describe?: (job: Job) => string | undefined
}>()
defineEmits<{ retry: [job: Job]; drop: [job: Job] }>()
/** What the job's button does: stop it as it runs, take it off the queue, or dismiss a failure. */
const dropLabel = (job: Job) =>
  job.status === 'failed' ? 'Dismiss' : job.status === 'running' ? 'Cancel rendering' : 'Remove from queue'
const { jobName } = useImageModels()
</script>

<template>
  <div v-if="jobs.length" class="flex flex-col gap-1">
  <p v-for="job in jobs" :key="job.id" class="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1" data-frame-job>
    <span
      class="min-w-0 flex-1"
      :class="{
        'animate-pulse text-info': job.status === 'running',
        'text-muted': job.status === 'queued',
        'text-danger': job.status === 'failed',
      }"
    >
      {{ jobName(job) }} · {{ jobStatus(job, describe) }}
    </span>
    <button
      v-if="job.status === 'failed'"
      type="button"
      class="icon-button text-fg"
      title="Retry"
      aria-label="Retry"
      data-retry
      @click="$emit('retry', job)"
    >
      <Icon name="retry" />
    </button>
    <button
      type="button"
      class="icon-button text-danger"
      :title="dropLabel(job)"
      :aria-label="dropLabel(job)"
      data-drop-job
      @click="$emit('drop', job)"
    >
      <Icon :name="job.status === 'running' ? 'stop' : 'x'" />
    </button>
  </p>
  </div>
</template>
