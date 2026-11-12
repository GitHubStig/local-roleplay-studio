<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { cancelJob } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { useQueue } from '../composables/useQueue'
import { frameName } from '../frameName'
import { isOpen, jobLink, jobStatus } from '../jobs'
import type { QueueJob } from '../queue'
import { sessionPath } from '../sessionPath'
import Icon from './Icon.vue'

/**
 * The Queue sliding in from the rail, over the screen: the Session on screen's jobs first, then
 * the other Sessions', each going to its Frame when clicked and cancelled by its ✕; Dismiss for
 * what's finished, Cancel all for the rest; the full page a link away. Closed by its ✕, Esc, or a
 * click outside it.
 */
const props = defineProps<{
  /** The Session on screen, if one is. */
  sessionId?: string | null
}>()
const open = defineModel<boolean>('open', { required: true })
const { queue, refresh } = useQueue()
const { jobName } = useImageModels()
const router = useRouter()

const panel = useTemplateRef<HTMLElement>('panel')
onClickOutside(panel, () => (open.value = false), { ignore: ['[data-nav-queue]'] })
onKeyStroke('Escape', () => open.value && (open.value = false))

const jobs = computed(() => queue.value?.jobs ?? [])
const sessionOf = (id: string) => queue.value?.sessions.find((s) => s.id === id)
/** Running first, then waiting, then failed; finished ones are only counted. */
const rank = (j: QueueJob) => ({ running: 0, queued: 1, failed: 2, done: 3 })[j.status]
const listed = (list: QueueJob[]) =>
  list.filter((j) => j.status !== 'done').sort((a, b) => rank(a) - rank(b))
const here = computed(() => listed(jobs.value.filter((j) => j.sessionId === props.sessionId)))
const elsewhere = computed(() => listed(jobs.value.filter((j) => j.sessionId !== props.sessionId)))
const finished = computed(() => jobs.value.filter((j) => j.status === 'done' || j.status === 'failed'))
const running = computed(() => jobs.value.filter(isOpen))
const machineName = (key: string) => (key === 'here' ? 'This machine' : key)

function go(job: QueueJob) {
  const s = sessionOf(job.sessionId)
  if (!s) return
  open.value = false
  router.push(jobLink(sessionPath(s.id, s.kind), job))
}
async function drop(list: readonly QueueJob[]) {
  // The waiting before the running, so none starts as another is cancelled.
  const waitingFirst = [...list].sort((a, b) => Number(a.status === 'running') - Number(b.status === 'running'))
  for (const job of waitingFirst) await cancelJob(job.sessionId, job.id).catch(() => {})
  await refresh()
}
</script>

<template>
  <aside
    v-if="open"
    ref="panel"
    class="fixed inset-y-0 left-12 z-40 flex w-80 max-w-[calc(100vw-3rem)] flex-col border-r border-line bg-canvas text-sm shadow-[8px_0_24px_-12px_rgba(0,0,0,0.35)]"
    aria-label="Queue"
    data-queue-panel
  >
    <header class="flex items-center gap-2 border-b border-line px-3 py-2.5">
      <h2 class="font-semibold">Queue</h2>
      <RouterLink to="/queue" class="ml-auto text-muted underline underline-offset-2 hover:text-fg" data-full-queue @click="open = false">
        Full page
      </RouterLink>
      <button type="button" class="rounded-md p-1 text-muted hover:text-fg" title="Close (Esc)" aria-label="Close" @click="open = false">
        <Icon name="x" />
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <template v-for="part in [
        { key: 'here', title: 'This Session', list: here },
        { key: 'elsewhere', title: sessionId ? 'Other Sessions' : 'Every Session', list: elsewhere },
      ]" :key="part.key">
        <section v-if="part.list.length" class="mb-3" :data-queue-part="part.key">
          <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{{ part.title }}</h3>
          <ul>
            <li v-for="job in part.list" :key="job.id" class="flex items-start gap-1 border-b border-line py-2 last:border-b-0" data-queue-job>
              <button type="button" class="flex min-w-0 flex-1 items-start gap-1.5 text-left hover:text-fg" @click="go(job)">
                <Icon v-if="job.status === 'running'" name="spinner" class="mt-0.5 animate-spin text-muted" />
                <span class="min-w-0">
                  <span class="block truncate">{{ frameName(job.frameIndex) }} · {{ jobName(job) }}</span>
                  <span class="block truncate text-xs" :class="job.status === 'failed' ? 'text-danger' : 'text-muted'">
                    <template v-if="part.key === 'elsewhere'">{{ sessionOf(job.sessionId)?.title }} · </template>{{ machineName(job.machine) }} · {{ jobStatus(job) }}
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="rounded p-1 text-muted hover:text-danger"
                :title="job.status === 'failed' ? 'Dismiss' : job.status === 'running' ? 'Cancel' : 'Remove from queue'"
                :aria-label="job.status === 'failed' ? 'Dismiss' : 'Cancel'"
                data-queue-drop
                @click="drop([job])"
              >
                <Icon name="x" />
              </button>
            </li>
          </ul>
        </section>
      </template>
      <p v-if="!here.length && !elsewhere.length" class="py-6 text-center text-muted" data-queue-empty>
        Nothing running or waiting.
      </p>
    </div>
    <footer v-if="finished.length || running.length" class="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
      <span>{{ finished.length }} finished</span>
      <button v-if="finished.length" type="button" class="ml-auto hover:text-fg" data-queue-dismiss @click="drop(finished)">Dismiss</button>
      <button v-if="running.length" type="button" class="text-danger hover:underline" :class="{ 'ml-auto': !finished.length }" data-queue-cancel-all @click="drop(running)">
        Cancel all
      </button>
    </footer>
  </aside>
</template>
