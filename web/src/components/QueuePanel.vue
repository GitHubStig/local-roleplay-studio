<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useQueue } from '../composables/useQueue'
import { jobLink } from '../jobs'
import type { QueueJob } from '../queue'
import { sessionPath } from '../sessionPath'
import Icon from './Icon.vue'
import QueueList from './QueueList.vue'

/**
 * The Queue sliding in from the rail, over the screen: its list (`QueueList`), the Session on
 * screen's jobs first, a job going to its Frame when clicked; the full page a link away. Closed by
 * its ✕, Esc, or a click outside it.
 */
defineProps<{
  /** The Session on screen, if one is. */
  sessionId?: string | null
}>()
const open = defineModel<boolean>('open', { required: true })
const { queue } = useQueue()
const router = useRouter()

const panel = useTemplateRef<HTMLElement>('panel')
onClickOutside(panel, () => (open.value = false), { ignore: ['[data-nav-queue]'] })
onKeyStroke('Escape', () => open.value && (open.value = false))

function go(job: QueueJob) {
  const s = queue.value?.sessions.find((x) => x.id === job.sessionId)
  if (!s) return
  open.value = false
  router.push(jobLink(sessionPath(s.id, s.kind), job))
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
    <QueueList class="min-h-0 flex-1" :session-id="sessionId" @go="go" />
  </aside>
</template>
