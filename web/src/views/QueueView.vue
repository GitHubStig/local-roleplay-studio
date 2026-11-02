<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import { cancelJob, getQueue, KIND_LABELS, type Queue } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { frameName } from '../frameName'
import { isOpen, jobLink, jobStatus } from '../jobs'
import { lasted, machineQueues, type QueueJob, type QueueRow, textCallName } from '../queue'
import { sessionPath } from '../sessionPath'

/**
 * Every machine's queue at once: what runs on each, what waits in the order it will go (the Text
 * Model's calls among it), and what's finished, with how long each waited and took, across every
 * Session. A job opens in its Session as that Session's Queue tab opens it.
 */
const queue = ref<Queue | null>(null)
const error = ref('')
const now = ref(Date.now())
const machines = computed(() => (queue.value ? machineQueues(queue.value) : []))
const { jobName } = useImageModels()

async function refresh() {
  try {
    queue.value = await getQueue()
    error.value = ''
  } catch (err) {
    error.value = (err as Error).message
  }
  now.value = Date.now()
}
useIntervalFn(refresh, 2000, { immediateCallback: true })

/** Cancels a queued or running job, or dismisses a finished one. */
async function drop(job: QueueJob) {
  await cancelJob(job.sessionId, job.id).catch(() => {})
  await refresh()
}

const linkOf = (row: QueueRow) =>
  row.session &&
  (row.type === 'job'
    ? jobLink(sessionPath(row.session.id, row.session.kind), row.job)
    : sessionPath(row.session.id, row.session.kind))

/** How long it's taken so far, or took; and how long it waited first, once it started. */
function timing(row: QueueRow): string {
  if (row.type === 'text') return `${row.call.status === 'running' ? 'for' : 'waiting'} ${lasted(row.call.since, now.value)}`
  const { createdAt, startedAt, endedAt, status } = row.job
  if (!startedAt) return `queued ${lasted(createdAt, now.value)} ago`
  const waited = `waited ${lasted(createdAt, startedAt)}`
  if (endedAt) return `took ${lasted(startedAt, endedAt)}, ${waited}`
  return status === 'running' ? `for ${lasted(startedAt, now.value)}, ${waited}` : waited
}

const SECTIONS = [
  { key: 'running', title: 'Running' },
  { key: 'waiting', title: 'Waiting, in the order they go' },
  { key: 'finished', title: 'Finished' },
] as const
</script>

<template>
  <div class="overflow-y-auto">
    <div class="mx-auto max-w-7xl px-6 py-6">
      <h2 class="mb-1 text-xl font-semibold">Queue</h2>
      <p class="mb-4 text-sm text-muted">
        Every Session's jobs, and the Text Model's calls, on each machine. One heavy job runs on a
        machine at a time; text calls go next, ahead of the jobs waiting.
      </p>
      <p v-if="error" class="mb-4 text-sm text-danger" data-queue-error>{{ error }}</p>
      <!-- The machines side by side, as many abreast as fit. -->
      <div class="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
      <section
        v-for="m in machines"
        :key="m.key"
        class="min-w-0 rounded border border-line"
        data-machine
      >
        <header class="flex items-baseline gap-2 border-b border-line px-3 py-2">
          <h3 class="font-medium" data-machine-name>{{ m.name }}</h3>
          <span v-if="m.backends.length" class="text-xs text-muted">{{ m.backends.join(', ') }}</span>
        </header>
        <p
          v-if="!m.running.length && !m.waiting.length && !m.finished.length"
          class="px-3 py-2 text-sm text-muted"
        >
          Idle.
        </p>
        <template v-for="section in SECTIONS" :key="section.key">
          <template v-if="m[section.key].length">
            <h4 class="bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
              {{ section.title }}
            </h4>
            <ol :data-section="section.key">
              <li
                v-for="row in m[section.key]"
                :key="row.type === 'job' ? row.job.id : `${row.call.job} ${row.call.since}`"
                class="flex items-start gap-2 border-t border-line px-3 py-2 text-sm"
                data-queue-row
              >
                <component
                  :is="linkOf(row) ? 'RouterLink' : 'div'"
                  :to="linkOf(row)"
                  class="flex min-w-0 flex-1 flex-col gap-0.5"
                  :title="row.session ? `Open in ${row.session.title}` : undefined"
                  @click="row.type === 'job' && row.job.status === 'done' && drop(row.job)"
                >
                  <span class="font-medium">
                    <template v-if="row.type === 'job'">
                      {{ jobName(row.job) }} · {{ frameName(row.job.frameIndex) }}
                    </template>
                    <template v-else>{{ textCallName(row.call.job) }}</template>
                  </span>
                  <span v-if="row.session" class="truncate text-xs text-muted">
                    {{ KIND_LABELS[row.session.kind] }} · {{ row.session.title }}
                  </span>
                  <span
                    class="text-xs"
                    :class="row.type === 'job'
                      ? {
                        'animate-pulse text-info': row.job.status === 'running',
                        'text-muted': row.job.status === 'queued',
                        'text-ok': row.job.status === 'done',
                        'text-danger': row.job.status === 'failed',
                      }
                      : row.call.status === 'running'
                      ? 'animate-pulse text-info'
                      : 'text-muted'"
                  >
                    <template v-if="row.type === 'job'">{{ jobStatus(row.job) }} · </template>
                    <template v-else>{{ row.call.status === 'running' ? 'Writing…' : 'Waiting for the job running' }} · </template>
                    {{ timing(row) }}
                  </span>
                </component>
                <button
                  v-if="row.type === 'job'"
                  type="button"
                  class="shrink-0 text-xs text-danger underline-offset-2 hover:underline"
                  @click="drop(row.job)"
                >
                  {{ isOpen(row.job) ? 'Cancel' : 'Dismiss' }}
                </button>
              </li>
            </ol>
          </template>
        </template>
      </section>
      </div>
    </div>
  </div>
</template>
