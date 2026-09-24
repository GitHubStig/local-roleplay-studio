<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { diffWords } from '../diff'
import {
  ApiError,
  cancelTurn,
  getSession,
  imageUrl,
  type Outcome,
  type ImagePrompt,
  type Session,
  streamTurn,
  type TurnEvent,
  undoTurn,
} from '../api'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Turn in progress: provisional until committed. */
interface Pending {
  phase: 'text' | 'queued' | 'image'
  /** Started elsewhere (before a reload, in another tab); followed by polling the Session. */
  detached?: boolean
  /** The Text Model's reasoning so far, when thinking is on. */
  thinking?: string
  progress?: { step: number; total: number }
  narration?: string
  outcome?: Outcome
  prompt?: ImagePrompt
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
const panel = ref<'log' | 'prompt'>('log')

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
/** This Session's Turn is waiting for another Session's render to finish. */
const queued = computed(() => pending.value?.phase === 'queued')
const shown = computed(() => {
  const turns = session.value?.turns ?? []
  return viewing.value === null ? turns.at(-1) : turns[viewing.value]
})
const latest = computed(() => session.value?.turns.at(-1))
/** Looking at an earlier Turn; the next Action still continues from the latest one. */
const viewingOlder = computed(() => !!shown.value && shown.value.index !== latest.value?.index)
const turnName = (index: number) => (index === 0 ? 'the Opening' : `Turn ${index}`)

// A kept-alive screen keeps running in the background; it must only navigate while on screen.
let onScreen = true
/** Where to go once back on screen, if the Session went away while in the background. */
let leaveOnReturn: { path: string; query: Record<string, string> } | null = null

function leave(query: Record<string, string> = {}) {
  clearCurrentSession(props.id)
  forgetDraft()
  if (onScreen) router.replace({ path: '/', query })
  else leaveOnReturn = { path: '/', query }
}

/** Loads the Session; false if it couldn't be (gone: the player is sent Home). */
async function load(): Promise<boolean> {
  try {
    session.value = await getSession(props.id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      leave()
      return false
    }
    loadError.value = (err as Error).message
    return false
  }
  loadError.value = ''
  // Play leads back to the Session opened last.
  setCurrentSession(props.id)
  return true
}

let started = false
let starting = false
/** First successful load: follow a Turn already running, or write the opening prompt. */
async function start() {
  if (started || starting) return
  starting = true
  try {
    if (!(await load())) return
    started = true
  } finally {
    starting = false
  }
  if (session.value!.activity) follow()
  else if (session.value!.turns.length === 0) await runTurn(null)
}

onMounted(start)

// Coming back to a kept-alive Session: pick up changes made elsewhere (another tab, a delete
// from Home), unless a Turn is running here. Retries if the first load failed. Vue also calls
// this right after the first mount, which `start` already covers.
let firstActivation = true
onActivated(async () => {
  onScreen = true
  if (firstActivation) return (firstActivation = false)
  if (leaveOnReturn) return router.replace(leaveOnReturn)
  if (!started) return start()
  if (busy.value) return
  if ((await load()) && session.value!.activity) follow()
})
onDeactivated(() => (onScreen = false))

// --- A Turn this screen didn't start (page reloaded, another tab): show it and allow Cancel.
let followTimer: ReturnType<typeof setTimeout> | undefined
function follow() {
  pending.value = { phase: session.value!.activity!, detached: true }
  const poll = async () => {
    if (!(await load())) return (pending.value = null)
    const activity = session.value!.activity
    if (activity) {
      pending.value = { ...pending.value!, phase: activity }
      followTimer = setTimeout(poll, 1500)
    } else {
      pending.value = null
      viewing.value = null
    }
  }
  followTimer = setTimeout(poll, 1500)
}
onBeforeUnmount(() => clearTimeout(followTimer))

// --- The unsent Action, remembered per Session so it survives a reload.
const draftKey = `draft:${props.id}`
try {
  draft.value = localStorage.getItem(draftKey) ?? ''
} catch {
  // Storage blocked; the draft just isn't remembered.
}
watch(draft, (text) => {
  try {
    if (text) localStorage.setItem(draftKey, text)
    else localStorage.removeItem(draftKey)
  } catch {
    // Not remembered this time.
  }
})
function forgetDraft() {
  try {
    localStorage.removeItem(draftKey)
  } catch {
    // Nothing stored.
  }
}

// --- While this Turn waits in the render queue, stay here: no leaving, no reloading.
onBeforeRouteLeave(() => {
  if (!queued.value) return true
  turnError.value = 'Waiting for another render. Cancel this Turn to leave.'
  return false
})
// Reloading, closing the tab or leaving the site drops this page's connection to a running Turn,
// which cancels it; the browser asks first ("Leave site?"). It can't show our own wording. A Turn
// this page is only following (started elsewhere) isn't affected, so no warning for that.
function warnBeforeUnload(e: BeforeUnloadEvent) {
  if (busy.value && !pending.value?.detached) {
    e.preventDefault()
    e.returnValue = '' // older browsers need this as well
  }
}
window.addEventListener('beforeunload', warnBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

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
    case 'thinking':
      pending.value = {
        ...pending.value!,
        thinking: (event.restart ? '' : pending.value?.thinking ?? '') + event.text,
      }
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
        leave(event.type === 'failed' ? { error: event.message } : {})
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
  if (action && !busy.value) runTurn(action)
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
const canUndo = computed(() => !busy.value && (session.value?.turns.length ?? 0) > 1)
const undoing = ref(false)

/** Removes the latest Turn and puts its Action back in the text box to edit and resend. */
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

/** The text box's border sweeps while the Text Model writes the new prompt. */
const writing = computed(() => pending.value?.phase === 'text' && !pending.value.cancelling)

/** The frame's border sweeps while an image renders (or waits to), until the new one lands. */
const renderingPhase = computed(() =>
  pending.value?.phase === 'image' || pending.value?.phase === 'queued' ? pending.value.phase : null
)

/** The image on screen; it only changes once the next one has loaded, for a clean crossfade. */
const displayed = ref<{ src: string; alt: string } | null>(null)

watch(
  () => shown.value && { src: imageUrl(props.id, shown.value.image), alt: shown.value.promptText },
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

/** The reasoning streaming in, shown in the caption's place until the Narration arrives. */
const liveThinking = computed(() =>
  pending.value?.thinking && !pending.value.narration ? pending.value.thinking : ''
)
const thinkingBox = ref<HTMLElement | null>(null)
watch(liveThinking, async () => {
  await nextTick()
  thinkingBox.value?.scrollTo({ top: thinkingBox.value.scrollHeight })
})
const captionOutcome = computed(() =>
  pending.value?.narration ? pending.value.outcome : shown.value?.outcome
)

/** Labels for the Outcomes that leave the Image Prompt unchanged. */
const OUTCOME_LABELS: Partial<Record<Outcome, string>> = {
  declined: 'Declined',
  unclear: "Didn't understand",
}

const phaseLabel = computed(() => {
  if (pending.value?.cancelling) return 'Cancelling…'
  if (pending.value?.phase === 'queued') return 'Waiting for another render…'
  if (pending.value?.phase !== 'image') return 'Writing the prompt…'
  const p = pending.value.progress
  return p ? `Rendering the image… ${p.step}/${p.total}` : 'Rendering the image…'
})

/** The shown Turn's Image Prompt, word-diffed against the Turn before it (none for the Opening). */
const promptDiff = computed(() => {
  const turn = shown.value
  if (!turn) return []
  const before = session.value?.turns[turn.index - 1]
  return before ? diffWords(before.prompt, turn.prompt) : [{ kind: 'same' as const, text: turn.prompt }]
})
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
          <div
            class="relative overflow-hidden rounded-md"
            :class="{ 'render-sweep': renderingPhase }"
            :style="frameStyle"
            :data-rendering="renderingPhase ?? undefined"
          >
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
              v-if="viewingOlder"
              class="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/70 py-1 pl-3 pr-1 text-sm text-white"
              data-viewing
            >
              <span>Viewing {{ turnName(shown!.index) }} of {{ latest!.index }}</span>
              <button
                type="button"
                class="rounded-full bg-white/15 px-2.5 py-0.5 hover:bg-white/25"
                @click="viewing = null"
              >
                Back to latest
              </button>
            </div>

            <div
              v-if="busy"
              class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
              role="status"
            >
              <span class="animate-pulse">{{ phaseLabel }}</span>
            </div>

            <div
              v-if="liveThinking && !captionHidden"
              class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/60 to-transparent px-5 pb-4 pt-12 text-white"
              data-thinking
            >
              <span class="mb-1 inline-block animate-pulse text-xs font-medium text-white/80">
                Thinking…
              </span>
              <p
                ref="thinkingBox"
                class="max-h-28 overflow-y-auto whitespace-pre-line text-xs italic leading-relaxed text-white/70"
              >
                {{ liveThinking }}
              </p>
            </div>

            <template v-else-if="captionText">
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

        <div class="flex shrink-0 flex-col gap-2">
          <!-- The sweep shows here while the Text Model writes, then moves to the image. -->
          <div
            class="flex rounded-lg"
            :class="{ 'render-sweep': writing }"
            :data-writing="writing ? '' : undefined"
          >
            <textarea
              v-model="draft"
              class="h-24 flex-1 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
              :placeholder="viewingOlder
              ? `Your change continues from ${turnName(latest!.index)}, the latest Turn…`
              : 'What to change… (Enter to send, Shift+Enter for a new line)'"
              :disabled="busy"
              @keydown="onKeydown"
            />
          </div>
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
              title="Undo the latest Turn and put its Action back in the box"
              @click="undo"
            >
              Undo
            </button>
          </div>
        </div>

      </main>

      <aside class="flex w-80 flex-col border-l border-line">
        <div role="tablist" class="flex border-b border-line text-sm">
          <button
            v-for="tab in [{ id: 'log', label: 'Turn Log' }, { id: 'prompt', label: 'Prompt' }] as const"
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
            {{ pending?.detached ? 'A Turn in progress' : draft.trim() || 'Opening' }} —
            {{ phaseLabel }}
          </li>
        </ol>

        <div v-else class="flex-1 overflow-y-auto p-4 text-sm" role="tabpanel">
          <template v-if="shown">
            <p class="mb-3 text-muted">
              Turn {{ shown.index }} · {{ shown.action ?? 'Opening' }}
            </p>
            <p class="leading-relaxed" data-prompt>
              <template v-for="(part, i) in promptDiff" :key="i">
                <span
                  :class="{
                    'rounded bg-info/20 text-fg': part.kind === 'added',
                    'text-danger line-through opacity-70': part.kind === 'removed',
                  }"
                  :data-diff="part.kind"
                >{{ part.text }}</span>{{ ' ' }}
              </template>
            </p>
            <p v-if="shown.index > 0" class="mt-2 text-xs text-muted">
              <span class="rounded bg-info/20 px-1 text-fg">added</span> and
              <span class="text-danger line-through">removed</span> since Turn {{ shown.index - 1 }}.
              Rendered with "adult," in front.
            </p>
            <details v-if="shown.thinking" :key="`thinking-${shown.index}`" class="mt-4 text-muted">
              <summary class="cursor-pointer select-none">Thinking</summary>
              <p class="mt-1 whitespace-pre-line text-xs leading-relaxed" data-turn-thinking>
                {{ shown.thinking }}
              </p>
            </details>
          </template>
          <p v-else class="text-muted">No prompt yet.</p>
        </div>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>
  </div>
</template>
