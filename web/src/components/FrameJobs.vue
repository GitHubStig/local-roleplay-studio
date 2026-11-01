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
/** What the job's button does: cancel it as it runs, take it off the queue, or dismiss a failure. */
const dropLabel = (job: Job) =>
  job.status === 'failed' ? 'Dismiss' : job.status === 'running' ? 'Cancel' : 'Remove from queue'
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
    <!-- Running: a spinner, which turns into Cancel under the pointer or keyboard focus. A screen
         that can't hover shows both, the spinner beside the button, so a tap can't cancel unseen. -->
    <span v-if="job.status === 'running'" class="hidden text-info touch:inline-flex" data-job-working>
      <Icon name="spinner" class="animate-spin" />
    </span>
    <button
      type="button"
      class="group icon-button text-danger"
      :class="{ quiet: job.status === 'running' }"
      :title="dropLabel(job)"
      :aria-label="dropLabel(job)"
      data-drop-job
      @click="$emit('drop', job)"
    >
      <template v-if="job.status === 'running'">
        <span class="inline-flex text-info group-hover:hidden group-focus-visible:hidden touch:hidden" data-job-spinner>
          <Icon name="spinner" class="animate-spin" />
        </span>
        <span class="hidden group-hover:inline-flex group-focus-visible:inline-flex touch:inline-flex">
          <Icon name="x" />
        </span>
      </template>
      <Icon v-else name="x" />
    </button>
  </p>
  </div>
</template>
