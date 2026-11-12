<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { cancelJob, KIND_LABELS } from '../api'
import QueueList from '../components/QueueList.vue'
import { useStoredString } from '../composables/storage'
import { useCurrentSession } from '../composables/useCurrentSession'
import { useQueue } from '../composables/useQueue'
import { useImageModels } from '../composables/useSettingsOptions'
import { frameName } from '../frameName'
import { isOpen, jobLink, jobStatus } from '../jobs'
import {
  lasted,
  type MachineQueue,
  machineQueues,
  type QueueJob,
  type QueueRow,
  sessionsDone,
  textCallName,
} from '../queue'
import { useDoneNotice } from '../composables/useDoneNotice'
import { sessionPath } from '../sessionPath'

/**
 * Every machine's queue, in the same shape as Settings: the machines down the left, each saying
 * what runs and waits there, and the one picked on the right: what runs, what waits in the order it
 * will go (the Text Model's calls among it), and what's finished, with how long each waited and
 * took, across every Session. A job opens in its Session at its Frame. On a phone it's the short
 * list the rail's Queue panel shows (`QueueList`), the Session opened last first.
 */
const { queue, error, now, refresh } = useQueue()
const machines = computed(() => (queue.value ? machineQueues(queue.value) : []))
/** The machine picked, remembered per browser; else the first with work, else the first. */
const storedMachine = useStoredString('queue-machine')
const machine = computed(() =>
  machines.value.find((m) => m.key === storedMachine.value) ??
    machines.value.find((m) => m.running.length || m.waiting.length) ?? machines.value[0]
)
/** What a machine has running and waiting, beside its name. */
function countOf(m: MachineQueue): string {
  const parts = [m.running.length && `${m.running.length} running`, m.waiting.length && `${m.waiting.length} waiting`]
  return parts.filter(Boolean).join(' · ') || 'Idle'
}
const { currentSessionId } = useCurrentSession()
const router = useRouter()
function go(job: QueueJob) {
  const s = queue.value?.sessions.find((x) => x.id === job.sessionId)
  if (s) router.push(jobLink(sessionPath(s.id, s.kind), job))
}
const { jobName } = useImageModels()
/** A Session's queue done here notifies as on its own screen, which isn't open meanwhile. */
const notifyDone = useDoneNotice()

// The poll is shared (`useQueue`); a Session's work finishing notifies only from here.
watch(queue, (after, before) => {
  if (!after || !before) return
  for (const { sessionId, failed } of sessionsDone(before.jobs, after.jobs)) {
    notifyDone(sessionId, failed, after.sessions.find((s) => s.id === sessionId)?.title)
  }
})

/** Cancels a queued or running job, or dismisses a finished one. */
async function drop(job: QueueJob) {
  await cancelJob(job.sessionId, job.id).catch(() => {})
  await refresh()
}

/** The jobs among `rows` (a text call is its screen's to cancel). */
const jobsOf = (rows: readonly QueueRow[]) =>
  rows.flatMap((r) => (r.type === 'job' ? [r.job] : []))

/**
 * Drops each of `jobs` in turn, then shows the queue once: the waiting ones before the running,
 * so none starts as another is cancelled.
 */
async function dropAll(jobs: readonly QueueJob[]) {
  const waitingFirst = [...jobs].sort((a, b) => Number(a.status === 'running') - Number(b.status === 'running'))
  for (const job of waitingFirst) await cancelJob(job.sessionId, job.id).catch(() => {})
  await refresh()
}

/**
 * A section's button, on the right of its heading: Cancel all on the first of Running and Waiting
 * there is, for the machine's jobs in both; Dismiss all on Finished.
 */
function actionOf(m: MachineQueue, section: (typeof SECTIONS)[number]['key']) {
  if (section === 'finished') {
    const jobs = jobsOf(m.finished)
    return { label: `Dismiss all (${jobs.length})`, title: "Dismiss what's finished here, done or failed", jobs, danger: false }
  }
  if (section === 'waiting' && m.running.length) return null
  const jobs = [...jobsOf(m.running), ...jobsOf(m.waiting)]
  if (!jobs.length) return null
  return {
    label: `Cancel all (${jobs.length})`,
    title: "Cancel every job running and waiting here. The Text Model's calls carry on.",
    jobs,
    danger: true,
  }
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
  <div class="flex min-h-0">
    <!-- On a phone: the short list, the Session opened last first. -->
    <div class="flex min-h-0 flex-1 flex-col sm:hidden short:hidden" data-queue-phone>
      <h2 class="px-4 pb-1 pt-4 text-xl font-semibold">Queue</h2>
      <QueueList class="min-h-0 flex-1 px-1" :session-id="currentSessionId" @go="go" />
    </div>

    <!-- Beside a rail: the machines down the left. -->
    <nav
      class="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line p-3 sm:flex short:flex"
      aria-label="Machines"
      data-queue-machines
    >
      <h2 class="mb-1 px-2 text-lg font-semibold">Queue</h2>
      <p class="mb-3 px-2 text-xs text-muted">
        One heavy job runs on a machine at a time; the Text Model's calls go next, ahead of the jobs
        waiting.
      </p>
      <p class="border-t border-line px-2 pb-1 pt-3 text-[0.68rem] font-medium uppercase tracking-wider text-muted/75">Machines</p>
      <button
        v-for="m in machines"
        :key="m.key"
        type="button"
        class="flex flex-col rounded-md px-2 py-1.5 text-left text-muted hover:text-fg"
        :class="{ 'bg-surface text-fg shadow-sm': machine?.key === m.key }"
        :aria-current="machine?.key === m.key ? 'true' : undefined"
        :data-machine-tab="m.key"
        @click="storedMachine = m.key"
      >
        <span :class="{ 'font-medium': machine?.key === m.key }">{{ m.name }}</span>
        <span class="text-xs text-muted">{{ countOf(m) }}</span>
      </button>
    </nav>

    <!-- The machine picked: its jobs, a row each. -->
    <div class="hidden min-w-0 flex-1 flex-col overflow-y-auto sm:flex short:flex">
      <p v-if="error" class="px-6 pt-4 text-sm text-danger" data-queue-error>{{ error }}</p>
      <section v-if="machine" class="w-full max-w-4xl px-6 py-4" data-machine>
        <header class="mb-3 flex items-baseline gap-2">
          <h3 class="text-lg font-semibold" data-machine-name>{{ machine.name }}</h3>
          <span v-if="machine.backends.length" class="text-sm text-muted">{{ machine.backends.join(', ') }}</span>
        </header>
        <p
          v-if="!machine.running.length && !machine.waiting.length && !machine.finished.length"
          class="text-sm text-muted"
        >
          Idle.
        </p>
        <template v-for="section in SECTIONS" :key="section.key">
          <template v-if="machine[section.key].length">
            <div class="mt-4 flex items-baseline justify-between gap-2 border-b border-line pb-1">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ section.title }}</h4>
              <button
                v-if="actionOf(machine, section.key)"
                type="button"
                class="text-xs underline-offset-2 hover:underline"
                :class="actionOf(machine, section.key)!.danger ? 'text-danger' : 'text-fg'"
                :title="actionOf(machine, section.key)!.title"
                :data-section-action="section.key"
                @click="dropAll(actionOf(machine, section.key)!.jobs)"
              >
                {{ actionOf(machine, section.key)!.label }}
              </button>
            </div>
            <ol :data-section="section.key">
              <li
                v-for="row in machine[section.key]"
                :key="row.type === 'job' ? row.job.id : `${row.call.job} ${row.call.since}`"
                class="flex items-start gap-2 border-b border-line py-2.5 text-sm"
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
</template>
