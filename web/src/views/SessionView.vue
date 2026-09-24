<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import {
  ApiError,
  cancelTurn,
  createSession,
  endSession,
  getSession,
  imageUrl,
  type Outcome,
  type Scene,
  type Session,
  streamTurn,
  type TurnEvent,
  undoTurn,
} from '../api'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Turn in progress: provisional until committed. */
interface Pending {
  phase: 'text' | 'image'
  progress?: { step: number; total: number }
  narration?: string
  outcome?: Outcome
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
const panel = ref<'log' | 'scene'>('log')

const CAPTION_KEY = 'caption-hidden'
/** A per-browser viewing preference, like the theme. */
const captionHidden = ref(readCaptionHidden())

function readCaptionHidden(): boolean {
  try {
    return localStorage.getItem(CAPTION_KEY) === '1'
  } catch {
    return false
  }
}

watch(captionHidden, (hidden) => {
  try {
    if (hidden) localStorage.setItem(CAPTION_KEY, '1')
    else localStorage.removeItem(CAPTION_KEY)
  } catch {
    // Not remembered this time; still applies until reload.
  }
})

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
    if (err instanceof ApiError && err.status === 404) {
      clearCurrentSession(props.id)
      router.replace('/')
      return
    }
    loadError.value = (err as Error).message
    return
  }
  if (session.value.status === 'active' && session.value.turns.length === 0) {
    await runTurn(null)
  }
})

// Play leads back here while the Session is active.
watch(() => session.value?.status, (status) => {
  if (status === 'active') setCurrentSession(props.id)
  else if (status === 'ended') clearCurrentSession(props.id)
})

watch([() => session.value?.turns.length, panel], async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})

function onEvent(event: TurnEvent) {
  const s = session.value!
  switch (event.type) {
    case 'phase':
      pending.value = { ...pending.value, phase: event.phase }
      break
    case 'progress':
      pending.value = { ...pending.value!, progress: { step: event.step, total: event.total } }
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
        clearCurrentSession(props.id)
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

/** Undo is possible for any Turn after the Opening Turn, while nothing is running. */
const canUndo = computed(() => active.value && !busy.value && (session.value?.turns.length ?? 0) > 1)
const undoing = ref(false)

/** Removes the latest Turn and puts its Direction back in the text box to edit and resend. */
async function undo() {
  const latest = session.value?.turns.at(-1)
  if (!canUndo.value || !latest || undoing.value) return
  undoing.value = true
  turnError.value = ''
  try {
    session.value = await undoTurn(props.id, latest.index)
    viewing.value = null
    if (!draft.value.trim() && latest.action) draft.value = latest.action
  } catch (err) {
    turnError.value = (err as Error).message
  } finally {
    undoing.value = false
  }
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

/** The image on screen; it only changes once the next one has loaded, for a clean crossfade. */
const displayed = ref<{ src: string; alt: string } | null>(null)

watch(
  () => shown.value && { src: imageUrl(props.id, shown.value.image), alt: shown.value.imagePrompt },
  (next) => {
    if (!next) return
    if (next.src === displayed.value?.src) return
    const img = new Image()
    const show = () => {
      // Skip if the player has already moved on to another Turn.
      if (shown.value && imageUrl(props.id, shown.value.image) === next.src) displayed.value = next
    }
    img.onload = show
    img.onerror = show
    img.src = next.src
  },
  { immediate: true },
)

/** Width ÷ height of this Session's images; every Turn shares one size. Portrait until known. */
const aspect = ref(832 / 1216)

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) aspect.value = img.naturalWidth / img.naturalHeight
}

/** The largest box of the image's proportions that fits the panel (`cq*` = panel size). */
const frameStyle = computed(() => ({
  width: `min(100cqw, calc(100cqh * ${aspect.value}))`,
  height: `min(100cqh, calc(100cqw / ${aspect.value}))`,
}))

/** The caption: the provisional Narration while a Turn runs, else the shown Turn's. */
const captionText = computed(() => pending.value?.narration ?? shown.value?.narration ?? '')
const captionOutcome = computed(() =>
  pending.value?.narration ? pending.value.outcome : shown.value?.outcome
)

/** Labels for the Outcomes that leave the Scene unchanged. */
const OUTCOME_LABELS: Partial<Record<Outcome, string>> = {
  declined: 'Declined',
  unclear: "Didn't understand",
}

const phaseLabel = computed(() => {
  if (pending.value?.cancelling) return 'Cancelling…'
  if (pending.value?.phase !== 'image') return 'Writing the Scene…'
  const p = pending.value.progress
  return p ? `Rendering the image… ${p.step}/${p.total}` : 'Rendering the image…'
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
        <!-- The image takes all space above the fixed-height controls, so it never resizes. The
             frame inside is sized to the image's proportions so the caption sits on the photo. -->
        <section
          class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface [container-type:size]"
        >
          <div class="relative overflow-hidden" :style="frameStyle">
            <!-- Crossfade: the next image is preloaded, then fades in over the last one. -->
            <Transition
              enter-active-class="transition-opacity duration-700 ease-out"
              enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-700 ease-in"
              leave-to-class="opacity-0"
            >
              <img
                v-if="displayed"
                :key="displayed.src"
                :src="displayed.src"
                :alt="displayed.alt"
                class="absolute inset-0 h-full w-full object-contain"
                @load="onImageLoad"
              />
            </Transition>
            <span
              v-if="!displayed && !busy"
              class="absolute inset-0 flex items-center justify-center text-muted"
            >
              No image yet
            </span>

            <div
              v-if="busy"
              class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
              role="status"
            >
              <span class="animate-pulse">{{ phaseLabel }}</span>
            </div>

            <template v-if="captionText">
              <div
                v-if="!captionHidden"
                class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/60 to-transparent px-5 pb-4 pt-12 text-white"
              >
                <span
                  v-if="captionOutcome && OUTCOME_LABELS[captionOutcome]"
                  class="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="captionOutcome === 'declined'
                  ? 'bg-amber-300/20 text-amber-300'
                  : 'bg-sky-300/20 text-sky-300'"
                  data-outcome
                >
                  {{ OUTCOME_LABELS[captionOutcome] }}
                </span>
                <p
                  class="max-h-24 overflow-y-auto pr-10 text-sm leading-relaxed"
                  :class="{
                    'italic opacity-75': pending?.narration,
                    'text-amber-300': captionOutcome === 'declined',
                    'text-sky-300': captionOutcome === 'unclear',
                  }"
                  :data-provisional="pending?.narration ? '' : undefined"
                  data-caption
                >
                  {{ captionText }}
                </p>
                <button
                  type="button"
                  class="absolute bottom-3 right-3 rounded px-1.5 text-xs text-white/70 hover:text-white"
                  title="Hide caption"
                  @click="captionHidden = true"
                >
                  Hide
                </button>
              </div>
              <button
                v-else
                type="button"
                class="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white"
                @click="captionHidden = false"
              >
                Show caption
              </button>
            </template>
          </div>
        </section>

        <div v-if="active" class="flex shrink-0 flex-col gap-2">
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
            <p
              class="min-w-0 flex-1 truncate text-sm text-danger"
              :title="turnError"
              role="alert"
            >
              {{ turnError }}
            </p>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!canUndo || undoing"
              title="Undo the latest Turn and put its Direction back in the box"
              @click="undo"
            >
              Undo
            </button>
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

        <div v-else class="flex shrink-0 items-center gap-4 rounded-lg border border-line p-3 text-sm">
          <span class="text-muted">This Session has ended.</span>
          <RouterLink to="/" class="rounded-lg bg-fg px-3 py-1.5 font-medium text-canvas">
            New Session
          </RouterLink>
        </div>
      </main>

      <aside class="flex w-80 flex-col border-l border-line">
        <div role="tablist" class="flex border-b border-line text-sm">
          <button
            v-for="tab in [{ id: 'log', label: 'Turn Log' }, { id: 'scene', label: 'Scene' }] as const"
            :key="tab.id"
            type="button"
            role="tab"
            class="flex-1 px-4 py-2 text-muted aria-selected:border-b-2 aria-selected:border-fg aria-selected:font-medium aria-selected:text-fg"
            :aria-selected="panel === tab.id"
            @click="panel = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <ol v-if="panel === 'log'" ref="log" class="flex-1 overflow-y-auto" role="tabpanel">
          <li v-for="turn in session.turns" :key="turn.index" class="group relative">
            <button
              type="button"
              class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
              :class="{ 'bg-surface': shown?.index === turn.index }"
              :aria-current="shown?.index === turn.index"
              data-turn
              @click="viewing = turn.index === session.turns.length - 1 ? null : turn.index"
            >
              <img
                :src="imageUrl(session.id, turn.image)"
                alt=""
                class="h-20 w-14 shrink-0 rounded object-cover"
              />
              <span class="flex min-w-0 flex-col gap-1">
                <span class="font-medium">{{ turn.action ?? 'Opening' }}</span>
                <span
                  v-if="OUTCOME_LABELS[turn.outcome]"
                  class="text-xs font-medium"
                  :class="turn.outcome === 'declined' ? 'text-warn' : 'text-info'"
                >
                  {{ OUTCOME_LABELS[turn.outcome] }}
                </span>
                <span
                  class="line-clamp-3 text-muted"
                  :class="{
                    'text-warn': turn.outcome === 'declined',
                    'text-info': turn.outcome === 'unclear',
                  }"
                >
                  {{ turn.narration }}
                </span>
              </span>
            </button>
            <button
              v-if="canUndo && turn.index === session.turns.at(-1)?.index"
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas px-2 py-0.5 text-xs text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
              :disabled="undoing"
              title="Undo this Turn"
              data-undo
              @click="undo"
            >
              Undo
            </button>
          </li>
          <li v-if="busy" class="p-3 text-sm italic text-muted">
            {{ draft.trim() || 'Opening' }} — {{ phaseLabel }}
          </li>
        </ol>

        <div v-else class="flex-1 overflow-y-auto p-4 text-sm" role="tabpanel">
          <template v-if="shown">
            <p class="mb-3 text-muted">
              Turn {{ shown.index }} · {{ shown.action ?? 'Opening' }}
            </p>
            <dl class="flex flex-col gap-3">
              <div v-for="[key, lines] in sceneEntries(shown.scene)" :key="key">
                <dt class="font-medium capitalize">{{ key }}</dt>
                <dd v-for="line in lines" :key="line" class="text-muted">{{ line }}</dd>
              </div>
            </dl>
            <details :key="shown.index" class="mt-4 text-muted" open>
              <summary class="cursor-pointer select-none">Image prompt</summary>
              <p class="mt-1 text-xs leading-relaxed">{{ shown.imagePrompt }}</p>
            </details>
          </template>
          <p v-else class="text-muted">No Scene yet.</p>
        </div>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>
  </div>
</template>
