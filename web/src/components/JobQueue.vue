<script setup lang="ts">
import { computed } from 'vue'
import { frameName } from '../frameName'
import type { Job } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { isOpen, jobStatus, openJob } from '../jobs'

/**
 * A Session's whole queue: running, queued, failed and done; clicking one goes to its Frame (and
 * a done one is dismissed, as seen). Cancel all cancels what's running and queued, all at once
 * (after a Render all, say); what's finished, done or failed, stays until Dismiss finished.
 * `describe` and `name` as `jobStatus` and `frameName`.
 */
const props = withDefaults(
  defineProps<{
    jobs: readonly Job[]
    /** What to say when nothing's queued. */
    empty: string
    describe?: (job: Job) => string | undefined
    /** What a Frame is called. */
    name?: (index: number) => string
  }>(),
  { name: frameName },
)
const emit = defineEmits<{
  go: [index: number]
  /** The music's work: its Frame, on the Music tab. */
  music: [index: number]
  /** An edit: show it being made, in the viewer. */
  edit: [index: number]
  /** A clip: show its Frame's Clip section, on the picture it's made from (`Job.image`). */
  clip: [job: Job]
  retry: [job: Job]
  drop: [job: Job]
  cancelAll: []
  /** Dismiss every finished job, done or failed. */
  dismissFinished: []
}>()
const { jobName } = useImageModels()
/** What Cancel all and Dismiss finished each take. */
const openCount = computed(() => props.jobs.filter(isOpen).length)
const finishedCount = computed(() => props.jobs.length - openCount.value)

/** Shows the job where it's seen (`openJob`). */
const open = (job: Job) =>
  openJob(job, {
    go: (index) => emit('go', index),
    music: (index) => emit('music', index),
    edit: (index) => emit('edit', index),
    clip: (j) => emit('clip', j),
    drop: (j) => emit('drop', j),
  })
</script>

<template>
  <p v-if="!jobs.length" class="p-4 text-sm text-muted" data-queue-empty>{{ empty }}</p>
  <template v-else>
    <div class="flex justify-end gap-2 border-b border-line px-3 py-1.5">
      <button
        v-if="openCount"
        type="button"
        class="text-xs text-danger underline-offset-2 hover:underline"
        title="Cancel everything running and queued. What's finished stays."
        data-cancel-all
        @click="$emit('cancelAll')"
      >
        Cancel all ({{ openCount }})
      </button>
      <span
        v-if="openCount && finishedCount"
        class="text-xs text-muted"
        aria-hidden="true"
        data-queue-actions-separator
      >
        ·
      </span>
      <button
        v-if="finishedCount"
        type="button"
        class="text-xs text-fg underline-offset-2 hover:underline"
        title="Dismiss what's finished, done or failed, and leave the rest"
        data-dismiss-finished
        @click="$emit('dismissFinished')"
      >
        Dismiss finished ({{ finishedCount }})
      </button>
    </div>
    <ol>
      <li
        v-for="job in jobs"
        :key="job.id"
        class="flex items-start gap-2 border-b border-line p-3 text-sm hover:bg-surface"
        data-queue-item
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
          :title="job.kind === 'edit' ? 'See the edit' : `Go to ${name(job.frameIndex)}`"
          @click="open(job)"
        >
          <span class="font-medium">{{ jobName(job) }} · {{ name(job.frameIndex) }}</span>
          <span
            class="text-xs"
            :class="{
              'animate-pulse text-info': job.status === 'running',
              'text-muted': job.status === 'queued',
              'text-ok': job.status === 'done',
              'text-danger': job.status === 'failed',
            }"
          >
            {{ jobStatus(job, describe) }}
          </span>
        </button>
        <button
          v-if="job.status === 'failed'"
          type="button"
          class="shrink-0 text-xs text-fg underline-offset-2 hover:underline"
          data-retry
          @click="$emit('retry', job)"
        >
          Retry
        </button>
        <button
          type="button"
          class="shrink-0 text-xs text-danger underline-offset-2 hover:underline"
          @click="$emit('drop', job)"
        >
          {{ isOpen(job) ? 'Cancel' : 'Dismiss' }}
        </button>
      </li>
    </ol>
  </template>
</template>
