<script setup lang="ts">
import type { Job } from '../api'
import { JOB_NAMES, jobStatus } from '../jobs'

/** A Frame's queued, running and failed jobs, each cancellable (or retried) in place. */
defineProps<{
  jobs: readonly Job[]
  /** What the Session's own kind of work says it's doing, when it says more (see `jobStatus`). */
  describe?: (job: Job) => string | undefined
}>()
defineEmits<{ retry: [job: Job]; drop: [job: Job] }>()
</script>

<template>
  <p v-for="job in jobs" :key="job.id" class="flex items-center gap-2" data-frame-job>
    <span
      :class="{
        'animate-pulse text-info': job.status === 'running',
        'text-muted': job.status === 'queued',
        'text-danger': job.status === 'failed',
      }"
    >
      {{ JOB_NAMES[job.kind] }} · {{ jobStatus(job, describe) }}
    </span>
    <button
      v-if="job.status === 'failed'"
      type="button"
      class="text-fg underline-offset-2 hover:underline"
      data-retry
      @click="$emit('retry', job)"
    >
      Retry
    </button>
    <button
      type="button"
      class="text-danger underline-offset-2 hover:underline"
      @click="$emit('drop', job)"
    >
      {{ job.status === 'failed' ? 'Dismiss' : 'Cancel' }}
    </button>
  </p>
</template>
