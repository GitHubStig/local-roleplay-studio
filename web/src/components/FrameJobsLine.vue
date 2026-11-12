<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '../api'
import { isOpen, jobStatus } from '../jobs'
import { useImageModels } from '../composables/useSettingsOptions'
import FrameJobs from './FrameJobs.vue'
import Icon from './Icon.vue'
import PopMenu from './PopMenu.vue'

/**
 * A Frame's jobs as one line on its picture, in every kind of Session: what's running and how far
 * along, how many more wait, and a thin bar along the picture's top edge for the progress. Clicking
 * it lists them (`FrameJobs`' rows, each to cancel or retry) with Cancel all. A failure stays on the
 * line with Retry until it's dismissed. Nothing shows while the Frame has no work.
 */
const props = defineProps<{
  jobs: readonly Job[]
  /** What the Session's own kind of work says it's doing, when it says more (see `jobStatus`). */
  describe?: (job: Job) => string | undefined
}>()
/** `cancelAll` hands over the Frame's open jobs, for the caller to cancel one by one. */
const emit = defineEmits<{ retry: [job: Job]; drop: [job: Job]; cancelAll: [jobs: Job[]] }>()
const { jobName } = useImageModels()

const running = computed(() => props.jobs.find((j) => j.status === 'running'))
const waiting = computed(() => props.jobs.filter((j) => j.status === 'queued').length)
const failed = computed(() => props.jobs.find((j) => j.status === 'failed'))
const open = computed(() => props.jobs.filter(isOpen))
/**
 * The line's words: the job running, then how many wait; else a failure; else the next to run,
 * then how many more wait behind it.
 */
const words = computed(() => {
  const r = running.value
  if (r) {
    const more = waiting.value ? `${waiting.value} waiting` : ''
    return [`${jobName(r)} · ${jobStatus(r, props.describe)}`, more].filter(Boolean).join(' · ')
  }
  if (failed.value) return `${jobName(failed.value)} ${jobStatus(failed.value).replace(/^Failed/, 'failed')}`
  const next = props.jobs.find((j) => j.status === 'queued')!
  return `${jobName(next)} · waiting` + (waiting.value > 1 ? ` · ${waiting.value - 1} more` : '')
})
const progress = computed(() => {
  const p = running.value?.progress
  return p ? p.step / p.total : null
})
</script>

<template>
  <template v-if="jobs.length">
    <span
      v-if="progress !== null"
      class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-white/20"
      data-jobs-progress
    >
      <span class="block h-full bg-white/90 transition-[width] duration-500" :style="{ width: `${progress * 100}%` }" />
    </span>
    <PopMenu panel-class="w-80 p-2 text-sm" data-frame-jobs-line>
      <template #button="{ toggle }">
        <span class="flex max-w-full items-center gap-1 rounded-md bg-black/55 text-xs text-white backdrop-blur-sm">
          <button
            type="button"
            class="flex min-w-0 items-center gap-1.5 py-0.5 pl-2"
            :class="failed && !running ? 'text-red-300' : ''"
            :title="`${words}: see each`"
            data-jobs-line
            @click.stop="toggle"
          >
            <Icon v-if="running" name="spinner" class="animate-spin" />
            <span class="truncate">{{ words }}</span>
            <Icon name="chevron-down" />
          </button>
          <button
            v-if="failed && !running"
            type="button"
            class="rounded border border-white/40 px-1.5 text-white hover:bg-white/15"
            data-jobs-line-retry
            @click.stop="emit('retry', failed)"
          >
            Retry
          </button>
          <button
            v-if="failed && !running"
            type="button"
            class="pr-1.5 text-white/80 hover:text-white"
            title="Dismiss"
            aria-label="Dismiss"
            data-jobs-line-dismiss
            @click.stop="emit('drop', failed)"
          >
            <Icon name="x" />
          </button>
          <span v-else class="pr-1" />
        </span>
      </template>
      <FrameJobs :jobs="jobs" :describe="describe" @retry="(j) => emit('retry', j)" @drop="(j) => emit('drop', j)" />
      <button
        v-if="open.length > 1"
        type="button"
        class="mt-2 text-sm text-danger hover:underline"
        data-cancel-frame-jobs
        @click="emit('cancelAll', open)"
      >
        Cancel all {{ open.length }}
      </button>
    </PopMenu>
  </template>
</template>
