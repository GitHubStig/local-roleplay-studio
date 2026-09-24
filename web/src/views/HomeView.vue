<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createSession, deleteSession, imageUrl, listSessions, type SessionSummary } from '../api'
import StartSession from '../components/StartSession.vue'
import { clearCurrentSession, useCurrentSession } from '../composables/useCurrentSession'

const route = useRoute()
const router = useRouter()
const { currentSessionId } = useCurrentSession()

const sessions = ref<SessionSummary[] | null>(null)
const listError = ref('')
const deleteError = ref('')
/** Why the last attempt to start failed, e.g. the Opening Turn errored. */
const startError = ref(typeof route.query.error === 'string' ? route.query.error : '')

let poll: ReturnType<typeof setTimeout> | undefined

/** Loads the list; while any Session has a Turn running, refreshes every 2 s to track it. */
async function load() {
  clearTimeout(poll)
  try {
    sessions.value = await listSessions()
    listError.value = ''
  } catch (err) {
    listError.value = (err as Error).message
    return
  }
  if (sessions.value.some((s) => s.activity)) poll = setTimeout(load, 2000)
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(poll))

async function start(scenarioId: string) {
  startError.value = ''
  try {
    const session = await createSession(scenarioId)
    router.push(`/sessions/${session.id}`)
  } catch (err) {
    startError.value = (err as Error).message
  }
}

async function remove(s: SessionSummary) {
  const what = `${s.scenarioTitle}, ${s.turns} ${s.turns === 1 ? 'Turn' : 'Turns'}`
  if (!confirm(`Delete this Session (${what}) and its images? This can't be undone.`)) return
  deleteError.value = ''
  try {
    await deleteSession(s.id)
    clearCurrentSession(s.id)
    try {
      localStorage.removeItem(`draft:${s.id}`)
    } catch {
      // Nothing stored.
    }
  } catch (err) {
    deleteError.value = (err as Error).message
  }
  await load()
}

const ACTIVITY_LABELS = {
  text: 'Writing…',
  queued: 'Waiting to render…',
  image: 'Rendering…',
} as const

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "5 minutes ago", "yesterday", … */
function ago(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
</script>

<template>
  <div class="overflow-y-auto p-6">
    <div class="mx-auto flex max-w-4xl flex-col gap-10">
      <section v-if="listError || sessions?.length" class="flex flex-col gap-4">
        <h2 class="text-xl font-semibold">Your Sessions</h2>
        <p v-if="listError" class="text-danger">Could not load your Sessions: {{ listError }}</p>
        <p v-if="deleteError" class="text-sm text-danger" role="alert">{{ deleteError }}</p>

        <ul class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          <li v-for="s in sessions" :key="s.id" class="group relative" data-session>
            <RouterLink
              :to="`/sessions/${s.id}`"
              class="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-fg"
              :class="{ 'border-fg': s.id === currentSessionId }"
            >
              <div class="aspect-[3/4] bg-canvas">
                <img
                  v-if="s.latestImage"
                  :src="imageUrl(s.id, s.latestImage)"
                  alt=""
                  class="h-full w-full object-cover"
                />
              </div>
              <div class="flex flex-col gap-1 p-3 text-sm">
                <span class="font-medium">{{ s.scenarioTitle }}</span>
                <span class="text-muted">
                  {{ s.turns }} {{ s.turns === 1 ? 'Turn' : 'Turns' }} · {{ ago(s.updatedAt) }}
                </span>
                <span v-if="s.activity" class="animate-pulse text-info" data-activity>
                  {{ ACTIVITY_LABELS[s.activity] }}
                </span>
                <span v-else-if="s.id === currentSessionId" class="text-muted">Current</span>
              </div>
            </RouterLink>
            <button
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas/90 px-2 py-0.5 text-xs text-danger opacity-0 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:text-muted"
              :disabled="s.activity !== null"
              :title="s.activity ? 'A Turn is running in this Session' : 'Delete this Session'"
              data-delete
              @click="remove(s)"
            >
              Delete
            </button>
          </li>
        </ul>
      </section>

      <StartSession :error="startError" @start="start" />
    </div>
  </div>
</template>
