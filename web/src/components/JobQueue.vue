<script setup lang="ts">
import { frameName } from '../frameName'
import type { Job } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { jobStatus } from '../jobs'

/**
 * A Session's whole queue: running, queued and failed; clicking one goes to its Frame. Clear queue
 * cancels and dismisses them all at once (after a Render all, say).
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
defineEmits<{
  go: [index: number]
  /** An edit: show it being made, in the viewer. */
  edit: [index: number]
  /** A clip: show its Frame's Clip section, on the picture it's made from (`Job.image`). */
  clip: [job: Job]
  retry: [job: Job]
  drop: [job: Job]
  clear: []
}>()
const { jobName } = useImageModels()
</script>

<template>
  <p v-if="!jobs.length" class="p-4 text-sm text-muted" data-queue-empty>{{ empty }}</p>
  <template v-else>
    <div class="flex justify-end border-b border-line px-3 py-1.5">
      <button
        type="button"
        class="text-xs text-danger underline-offset-2 hover:underline"
        title="Cancel everything running and queued, and dismiss what failed"
        data-clear-queue
        @click="$emit('clear')"
      >
        Clear queue
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
          @click="job.kind === 'edit'
            ? $emit('edit', job.frameIndex)
            : job.kind === 'clip'
            ? $emit('clip', job)
            : $emit('go', job.frameIndex)"
        >
          <span class="font-medium">{{ jobName(job) }} · {{ name(job.frameIndex) }}</span>
          <span
            class="text-xs"
            :class="{
              'animate-pulse text-info': job.status === 'running',
              'text-muted': job.status === 'queued',
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
          {{ job.status === 'failed' ? 'Dismiss' : 'Cancel' }}
        </button>
      </li>
    </ol>
  </template>
</template>
