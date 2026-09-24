<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  cancelTurn,
  createSession,
  endSession,
  getSession,
  imageUrl,
  type Scene,
  type Session,
  streamTurn,
  type TurnEvent,
} from '../api'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Turn in progress: provisional until committed. */
interface Pending {
  phase: 'text' | 'image'
  narration?: string
  declined?: boolean
  scene?: Scene
  cancelling?: boolean
}

const session = ref<Session | null>(null)
const loadError = ref('')
const pending = ref<Pending | null>(null)
const turnError = ref('')
const draft = ref('')
/** Index of the Turn shown in the main panel; null follows the latest. */
const viewing = ref<number | null>(null)
const log = ref<HTMLElement | null>(null)

const busy = computed(() => pending.value !== null)
const active = computed(() => session.value?.status === 'active')
const shown = computed(() => {
  const turns = session.value?.turns ?? []
  return viewing.value === null ? turns.at(-1) : turns[viewing.value]
})

onMounted(async () => {
  try {
    session.value = await getSession(props.id)
  } catch (err) {
    loadError.value = (err as Error).message
    return
  }
  if (session.value.status === 'active' && session.value.turns.length === 0) {
    await runTurn(null)
  }
})

watch(() => session.value?.turns.length, async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})

function onEvent(event: TurnEvent) {
  const s = session.value!
  switch (event.type) {
    case 'phase':
      pending.value = { ...pending.value, phase: event.phase }
      break
    case 'text':
      pending.value = { ...pending.value!, ...event }
      break
    case 'committed':
      s.turns.push(event.turn)
      pending.value = null
      viewing.value = null
      draft.value = ''
      break
    case 'failed':
    case 'cancelled':
      pending.value = null
      if (event.sessionDiscarded) {
        const query = event.type === 'failed' ? { error: event.message } : {}
        router.replace({ path: '/', query })
      } else if (event.type === 'failed') {
        turnError.value = event.message
      }
      break
  }
}

async function runTurn(action: string | null) {
  turnError.value = ''
  pending.value = { phase: 'text' }
  try {
    await streamTurn(props.id, action, onEvent)
  } catch (err) {
    turnError.value = (err as Error).message
  } finally {
    pending.value = null
  }
}

function submit() {
  const action = draft.value.trim()
  if (action && !busy.value && active.value) runTurn(action)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

async function cancel() {
  if (pending.value) pending.value = { ...pending.value, cancelling: true }
  await cancelTurn(props.id)
}

async function end() {
  if (!confirm('End this Session? You can start a new one afterwards.')) return
  try {
    session.value = await endSession(props.id)
  } catch (err) {
    turnError.value = (err as Error).message
  }
}

async function reset() {
  if (!confirm('Reset: end this Session and start a fresh one from the same Scenario?')) return
  try {
    if (active.value) await endSession(props.id)
    const next = await createSession(session.value!.scenarioId)
    router.push(`/sessions/${next.id}`)
  } catch (err) {
    turnError.value = (err as Error).message
  }
}

const phaseLabel = computed(() => {
  if (pending.value?.cancelling) return 'Cancelling…'
  return pending.value?.phase === 'image' ? 'Rendering the image…' : 'Writing the Scene…'
})

const sceneEntries = (scene: Scene) =>
  Object.entries(scene).map(([key, value]) => [
    key,
    typeof value === 'object' && value !== null
      ? Object.entries(value).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '—' : v}`)
      : [String(value)],
  ] as const)
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Session: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <section
          class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface"
        >
          <img
            v-if="shown"
            :src="imageUrl(session.id, shown.image)"
            :alt="shown.imagePrompt"
            class="h-full w-full object-contain"
          />
          <span v-else-if="!busy" class="text-muted">No image yet</span>
          <div
            v-if="busy"
            class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-canvas/85 px-4 py-2 text-sm"
            role="status"
          >
            <span class="animate-pulse">{{ phaseLabel }}</span>
          </div>
        </section>

        <div class="max-h-40 overflow-y-auto text-sm">
          <p v-if="pending?.narration" class="italic text-muted" data-provisional>
            {{ pending.narration }}
          </p>
          <template v-else-if="shown">
            <p :class="{ 'text-warn': shown.declined }">{{ shown.narration }}</p>
            <details class="mt-1 text-muted">
              <summary class="cursor-pointer select-none">Scene details</summary>
              <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
                <template v-for="[key, lines] in sceneEntries(shown.scene)" :key="key">
                  <dt class="font-medium capitalize">{{ key }}</dt>
                  <dd>
                    <div v-for="line in lines" :key="line">{{ line }}</div>
                  </dd>
                </template>
              </dl>
            </details>
          </template>
        </div>

        <p v-if="turnError" class="text-sm text-danger" role="alert">{{ turnError }}</p>

        <div v-if="active" class="flex flex-col gap-2">
          <textarea
            v-model="draft"
            class="h-24 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
            placeholder="Your Direction… (Enter to send, Shift+Enter for a new line)"
            :disabled="busy"
            @keydown="onKeydown"
          />
          <div class="flex items-center gap-2">
            <button
              v-if="!busy"
              type="button"
              class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
              :disabled="!draft.trim()"
              @click="submit"
            >
              Send
            </button>
            <button
              v-else
              type="button"
              class="rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
              :disabled="pending?.cancelling"
              @click="cancel"
            >
              Cancel
            </button>
            <span class="flex-1" />
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="busy"
              @click="reset"
            >
              Reset
            </button>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="busy"
              @click="end"
            >
              End
            </button>
          </div>
        </div>

        <div v-else class="flex items-center gap-4 rounded-lg border border-line p-3 text-sm">
          <span class="text-muted">This Session has ended.</span>
          <RouterLink to="/" class="rounded-lg bg-fg px-3 py-1.5 font-medium text-canvas">
            New Session
          </RouterLink>
        </div>
      </main>

      <aside class="flex w-80 flex-col border-l border-line">
        <h2 class="border-b border-line px-4 py-2 text-sm font-medium">Turn Log</h2>
        <ol ref="log" class="flex-1 overflow-y-auto">
          <li v-for="turn in session.turns" :key="turn.index">
            <button
              type="button"
              class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
              :class="{ 'bg-surface': shown?.index === turn.index }"
              :aria-current="shown?.index === turn.index"
              @click="viewing = turn.index === session.turns.length - 1 ? null : turn.index"
            >
              <img
                :src="imageUrl(session.id, turn.image)"
                alt=""
                class="h-20 w-14 shrink-0 rounded object-cover"
              />
              <span class="flex min-w-0 flex-col gap-1">
                <span class="font-medium">{{ turn.action ?? 'Opening' }}</span>
                <span class="line-clamp-3 text-muted" :class="{ 'text-warn': turn.declined }">
                  {{ turn.narration }}
                </span>
              </span>
            </button>
          </li>
          <li v-if="busy" class="p-3 text-sm italic text-muted">
            {{ draft.trim() || 'Opening' }} — {{ phaseLabel }}
          </li>
        </ol>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>
  </div>
</template>
