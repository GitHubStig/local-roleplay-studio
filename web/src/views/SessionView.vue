<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import ComposeBox from '../components/ComposeBox.vue'
import FrameImage from '../components/FrameImage.vue'
import Frame3dButtons from '../components/Frame3dButtons.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import JobQueue from '../components/JobQueue.vue'
import { useJobs } from '../composables/useJobs'
import { useFeatures } from '../composables/useFeatures'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredText } from '../composables/useStoredText'
import { sessionPath } from '../sessionPath'
import { diffWords } from '../diff'
import {
  type Activity,
  ApiError,
  cancelFrame,
  DOWNLOADING,
  getSession,
  imageUrl,
  type Outcome,
  type ImagePrompt,
  type ChainSession,
  streamFrame,
  type ChainFrame,
  type FrameEvent,
  type Made3d,
  MADE3D_FEATURE,
  undoFrame,
} from '../api'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Frame in progress: provisional until committed. */
interface Pending {
  phase: Activity
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

const session = ref<ChainSession | null>(null)
const loadError = ref('')
const pending = ref<Pending | null>(null)
const frameError = ref('')
/**
 * Why the last Action made no Frame (declined, or unclear and the Text Model asks what to
 * change): nothing was saved, and the Action stays in the box to reword.
 */
const notice = ref<{ kind: 'declined' | 'unclear'; text: string } | null>(null)
/** The unsent Action, remembered per Session so it survives a reload. */
const draft = useStoredText(`draft:${props.id}`)
/** Index of the Frame shown in the main panel; null follows the latest. */
const viewing = ref<number | null>(null)
const log = useTemplateRef<HTMLElement>('log')
const panel = ref<'log' | 'prompt'>('log')

/** Viewing preferences, remembered per browser. */
const captionHidden = useStoredFlag('caption-hidden')
const removedHidden = useStoredFlag('diff-removed-hidden')

const busy = computed(() => pending.value !== null)
/** This Session's Frame is waiting for another Session's render to finish. */
const queued = computed(() => pending.value?.phase === 'queued')
const shown = computed(() => {
  const frames = session.value?.frames ?? []
  return viewing.value === null ? frames.at(-1) : frames[viewing.value]
})
const latest = computed(() => session.value?.frames.at(-1))
/** Looking at an earlier Frame; the next Action still continues from the latest one. */
const viewingOlder = computed(() => !!shown.value && shown.value.index !== latest.value?.index)
const frameName = (index: number) => (index === 0 ? 'the Opening' : `Frame ${index}`)
/** The same, starting a title: the viewers' labels. */
const frameTitle = (index: number) => (index === 0 ? 'The Opening' : `Frame ${index}`)

// A kept-alive screen keeps running in the background; it must only navigate while on screen.
let onScreen = true
/** Where to go once back on screen, if the Session went away while in the background. */
let leaveOnReturn: { path: string; query: Record<string, string> } | null = null

function leave(query: Record<string, string> = {}) {
  clearCurrentSession(props.id)
  draft.value = ''
  if (onScreen) router.replace({ path: '/', query })
  else leaveOnReturn = { path: '/', query }
}

/** Loads the Session; false if it couldn't be (gone: the player is sent Home). */
async function load(): Promise<boolean> {
  try {
    const loaded = await getSession(props.id)
    // This screen is for Chains; the other kinds have their own.
    if (loaded.kind !== 'chain') {
      router.replace(sessionPath(props.id, loaded.kind))
      return false
    }
    session.value = loaded
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      leave()
      return false
    }
    loadError.value = (err as Error).message
    return false
  }
  loadError.value = ''
  // Current Session leads back to the Session opened last.
  setCurrentSession(props.id, 'chain')
  return true
}

let started = false
let starting = false
/** First successful load: follow a Frame already running, or write the opening prompt. */
async function start() {
  if (started || starting) return
  starting = true
  try {
    if (!(await load())) return
    started = true
  } finally {
    starting = false
  }
  refreshJobs()
  if (session.value!.activity) follow()
  else if (session.value!.frames.length === 0) await runChainFrame(null)
}

onMounted(start)

// Coming back to a kept-alive Session: pick up changes made elsewhere (another tab, a delete
// from Home), unless a Frame is running here. Retries if the first load failed. Vue also calls
// this right after the first mount, which `start` already covers.
let firstActivation = true
onActivated(async () => {
  onScreen = true
  if (firstActivation) return (firstActivation = false)
  if (leaveOnReturn) return router.replace(leaveOnReturn)
  if (!started) return start()
  refreshJobs()
  if (busy.value) return
  if ((await load()) && session.value!.activity) follow()
})
onDeactivated(() => (onScreen = false))

// --- A Frame this screen didn't start (page reloaded, another tab): show it and allow Cancel.
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

// --- While this Frame waits in the render queue, stay here: no leaving, no reloading.
onBeforeRouteLeave(() => {
  if (!queued.value) return true
  frameError.value = 'Waiting for another render. Cancel this Frame to leave.'
  return false
})
// Reloading, closing the tab or leaving the site drops this page's connection to a running Frame,
// which cancels it; the browser asks first ("Leave site?"). It can't show our own wording. A Frame
// this page is only following (started elsewhere) isn't affected, so no warning for that.
function warnBeforeUnload(e: BeforeUnloadEvent) {
  if (busy.value && !pending.value?.detached) {
    e.preventDefault()
    e.returnValue = '' // older browsers need this as well
  }
}
useEventListener(window, 'beforeunload', warnBeforeUnload)

watch([() => session.value?.frames.length, panel], async () => {
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})

function onEvent(event: FrameEvent) {
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
      s.frames.push(event.frame)
      pending.value = null
      viewing.value = null
      draft.value = ''
      break
    case 'declined':
    case 'unclear':
      // As in a Roleplay: no Frame, the Action stays in the box, and the reason shows by it.
      pending.value = null
      notice.value = { kind: event.type, text: event.message }
      break
    case 'failed':
    case 'cancelled':
      pending.value = null
      if (event.sessionDiscarded) {
        leave(event.type === 'failed' ? { error: event.message } : {})
      } else if (event.type === 'failed') {
        frameError.value = event.message
      }
      break
  }
}

async function runChainFrame(action: string | null) {
  frameError.value = ''
  notice.value = null
  pending.value = { phase: 'text' }
  try {
    await streamFrame(props.id, action, onEvent)
  } catch (err) {
    frameError.value = (err as Error).message
  } finally {
    pending.value = null
  }
}

function submit() {
  const action = draft.value.trim()
  // While an earlier Frame is shown, the box holds that Frame's Action, not the draft.
  if (action && !busy.value && !viewingOlder.value) runChainFrame(action)
}

async function cancel() {
  if (pending.value) pending.value = { ...pending.value, cancelling: true }
  await cancelFrame(props.id)
}

/** Which extras are on: off, their buttons are hidden; what they made still opens. */
const { on: featureOn } = useFeatures()

// --- Background work: upscales and 3D, queued so the next Action needn't wait for them.

const { jobs, jobsFor, hasJob, queue, dropJob, retry, refreshJobs } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (message) => (frameError.value = message),
})
/** The shown Frame's running job, if it's making a picture: its border sweeps. */
const shownJob = computed(() =>
  jobsFor(shown.value?.index ?? -1).find((j) => j.status === 'running') ?? null
)

// --- Looking closer: the picture viewer, and 3D by model (experimental; Frame3dButtons).

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)

/** Undo is possible for any Frame after the Opening Frame, while nothing is running. */
const canUndo = computed(() => !busy.value && (session.value?.frames.length ?? 0) > 1)
const undoing = ref(false)

/** Removes the latest Frame and puts its Action back in the text box to edit and resend. */
async function undo() {
  const latest = session.value?.frames.at(-1)
  if (!canUndo.value || !latest || undoing.value) return
  undoing.value = true
  frameError.value = ''
  try {
    session.value = await undoFrame(props.id, latest.index)
    viewing.value = null
    if (!draft.value.trim() && latest.action) draft.value = latest.action
  } catch (err) {
    frameError.value = (err as Error).message
  } finally {
    undoing.value = false
  }
}

/** "Text 9.8 s · Waited 12.3 s · Image 5.1 s", or "Image reused" when nothing was rendered. */
function timingsLabel(t: NonNullable<ChainFrame['timings']>): string {
  const parts = [`Text ${t.text.toFixed(1)} s`]
  if (t.queued !== undefined) parts.push(`Waited ${t.queued.toFixed(1)} s`)
  parts.push(t.image === null ? 'Image reused' : `Image ${t.image.toFixed(1)} s`)
  return parts.join(' · ')
}

/** The text box's border sweeps while the Text Model writes the new prompt. */
const writing = computed(() => pending.value?.phase === 'text' && !pending.value.cancelling)

/** The frame's border sweeps while an image renders (or waits to), until the new one lands. */
const renderingPhase = computed(() => {
  // A new Frame sweeps whatever is shown; a job sweeps only the Frame it is working on.
  const phase = pending.value?.phase ?? shownJob.value?.phase
  if (phase === 'queued') return 'queued'
  return phase === 'image' || phase === 'download' ? 'image' : null
})

/** The caption: the provisional Narration while a Frame runs, else the shown Frame's. */
const captionText = computed(() => pending.value?.narration ?? shown.value?.narration ?? '')

/** The reasoning streaming in, shown in the caption's place until the Narration arrives. */
const liveThinking = computed(() =>
  pending.value?.thinking && !pending.value.narration ? pending.value.thinking : ''
)
const thinkingBox = useTemplateRef<HTMLElement>('thinkingBox')
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
  if (pending.value?.phase === 'download') return DOWNLOADING
  if (pending.value?.phase !== 'image') return 'Writing the prompt…'
  const p = pending.value.progress
  const doing = 'Rendering the image…'
  return p ? `${doing} step ${p.step} of ${p.total}` : doing
})

/** The shown Frame's Image Prompt, word-diffed against the Frame before it (none for the Opening). */
const promptDiff = computed(() => {
  const frame = shown.value
  if (!frame) return []
  const before = session.value?.frames[frame.index - 1]
  return before ? diffWords(before.prompt, frame.prompt) : [{ kind: 'same' as const, text: frame.prompt }]
})
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Session: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <FrameImage
          :src="shown ? imageUrl(session.id, shown.upscaled ?? shown.image) : null"
          :alt="shown?.promptText"
          :rendering="renderingPhase"
          :hide-size="busy"
          :empty-text="busy ? undefined : 'No image yet'"
          :expected-size="session.imageSize"
          @open="viewingPicture = shown!.index"
        >
          <div
            v-if="viewingOlder"
            class="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/70 py-1 pl-3 pr-1 text-sm text-white"
            data-viewing
          >
            <span>Viewing {{ frameName(shown!.index) }} of {{ latest!.index }}</span>
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
        </FrameImage>

        <div class="flex shrink-0 flex-col gap-2">
          <!-- The sweep shows here while the Text Model writes, then moves to the image. -->
          <div
            class="flex rounded-lg"
            :class="{ 'render-sweep': writing }"
            :data-writing="writing ? '' : undefined"
          >
            <!-- An earlier Frame shows the Action that made it, read-only (still selectable to copy). -->
            <textarea
              v-if="viewingOlder"
              :value="shown!.action ?? ''"
              rows="3"
              class="flex-1 cursor-default resize-none rounded-lg border border-dashed border-line bg-canvas p-3 text-muted"
              placeholder="The Opening Frame has no Action."
              readonly
              :aria-label="`The Action sent on ${frameName(shown!.index)}`"
              data-past-action
            />
            <ComposeBox
              v-else
              v-model="draft"
              placeholder="What to change… (Enter to send, Shift+Enter for a new line)"
              :disabled="busy"
              @send="submit"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!busy"
              type="button"
              class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
              :disabled="!draft.trim() || viewingOlder"
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
            <button
              v-if="shown && featureOn('images')"
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!!shown.upscaled || hasJob(shown.index, 'upscale')"
              :title="shown.upscaled
              ? `${frameName(shown.index)} is upscaled to 2048 px`
              : `Upscale ${frameName(shown.index)} to 2048 px with SeedVR2`"
              data-upscale
              @click="queue('upscale', shown.index)"
            >
              {{ shown.upscaled ? 'Upscaled' : 'Upscale' }}
            </button>
            <Frame3dButtons
              v-if="shown"
              :frame="shown"
              :disabled="(kind) => hasJob(shown!.index, kind)"
              :available="(kind) => featureOn(MADE3D_FEATURE[kind])"
              button-class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              @make="(kind) => queue(kind, shown!.index)"
              @view="(kind) => (open3d = { index: shown!.index, kind })"
            />
            <p
              class="min-w-0 flex-1 truncate text-sm"
              :class="frameError ? 'text-danger' : notice?.kind === 'unclear' ? 'text-info' : 'text-warn'"
              :title="frameError || notice?.text"
              role="alert"
              data-frame-notice
            >
              {{ frameError || notice?.text }}
            </p>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!canUndo || undoing"
              title="Undo the latest Frame and put its Action back in the box"
              @click="undo"
            >
              Undo
            </button>
          </div>
        </div>

      </main>

      <!-- Narrow windows: Frames and Prompt as tabs. From xl up: side by side, tabs hidden. -->
      <aside class="flex w-80 flex-col border-l border-line xl:w-auto xl:flex-row">
        <div role="tablist" class="flex border-b border-line text-sm xl:hidden">
          <button
            v-for="tab in [{ id: 'log', label: 'Frames' }, { id: 'prompt', label: 'Prompt' }] as const"
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

        <section
          class="min-h-0 flex-1 flex-col xl:w-72 xl:flex-none xl:border-r xl:border-line"
          :class="panel === 'log' ? 'flex' : 'hidden xl:flex'"
          data-log-panel
        >
          <h2 class="hidden border-b border-line px-4 py-2 text-sm font-medium xl:block">
            Frames
          </h2>
          <!-- The queue, while there's any: what's running, queued and failed. -->
          <JobQueue
            v-if="jobs.length"
            class="max-h-48 shrink-0 overflow-y-auto border-b border-line"
            :jobs="jobs"
            :name="frameTitle"
            data-queue
            @go="(index) => (viewing = index === session!.frames.length - 1 ? null : index)"
            @retry="retry"
            @drop="dropJob"
          />
          <ol ref="log" class="flex-1 overflow-y-auto" role="tabpanel">
          <li v-for="frame in session.frames" :key="frame.index" class="group relative">
            <button
              type="button"
              class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
              :class="{ 'bg-surface': shown?.index === frame.index }"
              :aria-current="shown?.index === frame.index"
              data-frame
              @click="viewing = frame.index === session.frames.length - 1 ? null : frame.index"
            >
              <img
                :src="imageUrl(session.id, frame.image)"
                alt=""
                class="h-20 w-14 shrink-0 rounded object-cover"
              />
              <span class="flex min-w-0 flex-col gap-1">
                <!-- Capped here; the Prompt tab and the text box show it in full. -->
                <span class="line-clamp-2 font-medium" :title="frame.action ?? undefined" data-action>
                  {{ frame.action ?? 'Opening' }}
                </span>
                <span
                  v-if="OUTCOME_LABELS[frame.outcome]"
                  class="text-xs font-medium"
                  :class="frame.outcome === 'declined' ? 'text-warn' : 'text-info'"
                >
                  {{ OUTCOME_LABELS[frame.outcome] }}
                </span>
                <span
                  class="line-clamp-3 text-muted"
                  :class="{
                    'text-warn': frame.outcome === 'declined',
                    'text-info': frame.outcome === 'unclear',
                  }"
                >
                  {{ frame.narration }}
                </span>
              </span>
            </button>
            <button
              v-if="canUndo && frame.index === session.frames.at(-1)?.index"
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas px-2 py-0.5 text-xs text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
              :disabled="undoing"
              title="Undo this Frame"
              data-undo
              @click="undo"
            >
              Undo
            </button>
          </li>
          <li v-if="busy" class="line-clamp-3 p-3 text-sm italic text-muted">
            {{ pending?.detached ? 'A Frame in progress' : draft.trim() || 'Opening' }} —
            {{ phaseLabel }}
          </li>
          </ol>
        </section>

        <section
          class="min-h-0 flex-1 flex-col xl:w-[28rem] xl:flex-none"
          :class="panel === 'prompt' ? 'flex' : 'hidden xl:flex'"
          data-prompt-panel
        >
          <h2 class="hidden border-b border-line px-4 py-2 text-sm font-medium xl:block">
            Prompt
          </h2>
          <div class="flex-1 overflow-y-auto p-4 text-sm" role="tabpanel">
          <template v-if="shown">
            <p class="text-muted" :class="shown.timings ? 'mb-1' : 'mb-3'">
              Frame {{ shown.index }} · {{ shown.action ?? 'Opening' }}
            </p>
            <p v-if="shown.timings" class="mb-3 text-xs text-muted" data-timings>
              {{ timingsLabel(shown.timings) }}
            </p>
            <div v-if="shown.index > 0" class="mb-2 flex flex-col gap-1 text-xs text-muted">
              <label class="flex w-fit cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  :checked="!removedHidden"
                  data-show-removed
                  @change="removedHidden = !($event.target as HTMLInputElement).checked"
                />
                Show removed words
              </label>
              <p>
                <span class="rounded bg-info/20 px-1 text-fg">added</span>
                <template v-if="!removedHidden">
                  and <span class="text-danger line-through">removed</span>
                </template>
                since Frame {{ shown.index - 1 }}. Rendered with "adult," in front.
              </p>
            </div>
            <p class="leading-relaxed" data-prompt>
              <template v-for="(part, i) in promptDiff" :key="i">
                <span
                  v-if="part.kind !== 'removed' || !removedHidden"
                  :class="{
                    'rounded bg-info/20 text-fg': part.kind === 'added',
                    'text-danger line-through opacity-70': part.kind === 'removed',
                  }"
                  :data-diff="part.kind"
                >{{ part.text }}</span><template
                  v-if="part.kind !== 'removed' || !removedHidden"
                >{{ ' ' }}</template>
              </template>
            </p>
            <details v-if="shown.thinking" :key="`thinking-${shown.index}`" class="mt-4 text-muted">
              <summary class="cursor-pointer select-none">Thinking</summary>
              <p class="mt-1 whitespace-pre-line text-xs leading-relaxed" data-frame-thinking>
                {{ shown.thinking }}
              </p>
            </details>
          </template>
          <p v-else class="text-muted">No prompt yet.</p>
          </div>
        </section>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>

    <FrameViewer
      v-if="session"
      v-model:open="viewingPicture"
      :session-id="session.id"
      :frames="session.frames"
      :name="frameTitle"
    />
    <Frame3dViewers
      v-if="session"
      v-model:open="open3d"
      :session-id="session.id"
      :frames="session.frames"
      :name="frameTitle"
    />
  </div>
</template>
