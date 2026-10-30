<script setup lang="ts">
import { frameName } from '../frameName'
import type { Job } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { isOpen, jobStatus } from '../jobs'

/**
 * A Session's whole queue: running, queued, failed and done; clicking one goes to its Frame (and
 * a done one is dismissed, as seen). Clear queue cancels what's running and queued and dismisses
 * what failed, all at once (after a Render all, say); what's done stays until Dismiss done.
 * `describe` and `name` as `jobStatus` and `frameName`.
 */
withDefaults(
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
  /** An edit: show it being made, in the viewer. */
  edit: [index: number]
  /** A clip: show its Frame's Clip section, on the picture it's made from (`Job.image`). */
  clip: [job: Job]
  retry: [job: Job]
  drop: [job: Job]
  clear: []
  /** Dismiss every done job. */
  dismissDone: []
}>()
const { jobName } = useImageModels()

/** Goes to the job's Frame; a done job has been seen by then, so it's dismissed. */
function open(job: Job) {
  if (job.kind === 'edit') emit('edit', job.frameIndex)
  else if (job.kind === 'clip') emit('clip', job)
  else emit('go', job.frameIndex)
  if (job.status === 'done') emit('drop', job)
}
</script>

<template>
  <p v-if="!jobs.length" class="p-4 text-sm text-muted" data-queue-empty>{{ empty }}</p>
  <template v-else>
    <div class="flex justify-end gap-2 border-b border-line px-3 py-1.5">
      <button
        v-if="jobs.some((j) => j.status !== 'done')"
        type="button"
        class="text-xs text-danger underline-offset-2 hover:underline"
        title="Cancel everything running and queued, and dismiss what failed. What's done stays."
        data-clear-queue
        @click="$emit('clear')"
      >
        Clear queue ({{ jobs.filter((j) => j.status !== 'done').length }})
      </button>
      <span
        v-if="jobs.some((j) => j.status === 'done') && jobs.some((j) => j.status !== 'done')"
        class="text-xs text-muted"
        aria-hidden="true"
        data-queue-actions-separator
      >
        ·
      </span>
      <button
        v-if="jobs.some((j) => j.status === 'done')"
        type="button"
        class="text-xs text-fg underline-offset-2 hover:underline"
        title="Dismiss what's done, and leave the rest"
        data-dismiss-done
        @click="$emit('dismissDone')"
      >
        Dismiss done ({{ jobs.filter((j) => j.status === 'done').length }})
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
