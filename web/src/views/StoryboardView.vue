<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import {
  ApiError,
  cancelFrame,
  chainFromStoryboard,
  changedSinceRender,
  type Activity,
  DOWNLOADING,
  editStoryboardFrame,
  getSession,
  imageUrl,
  isWritten,
  type JobKind,
  type Look,
  type Made3d,
  MAX_SHOWN,
  type Outcome,
  type PicturedFrame,
  planStoryboard,
  restartStoryboard,
  saveBeat,
  saveFrameBody,
  saveLook,
  type StoryboardEvent,
  type StoryboardFrame,
  type StoryboardSession,
  shownPicture,
  writeStoryboard,
} from '../api'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ComposeBox from '../components/ComposeBox.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameImage from '../components/FrameImage.vue'
import FrameViewer from '../components/FrameViewer.vue'
import JobQueue from '../components/JobQueue.vue'
import LookForm from '../components/LookForm.vue'
import PictureButtons from '../components/PictureButtons.vue'
import ImageModelPicker from '../components/ImageModelPicker.vue'
import ModelComparison from '../components/ModelComparison.vue'
import RenderAllButton from '../components/RenderAllButton.vue'
import PanelTabs from '../components/PanelTabs.vue'
import { useImageModels } from '../composables/useSettingsOptions'
import { useFeatures } from '../composables/useFeatures'
import { useJobs } from '../composables/useJobs'
import { showPickedFrame, useFrameKeys } from '../composables/useFrameKeys'
import { JOB_NAMES, jobForming, jobStatus, queueTabLabel, sweepOf } from '../jobs'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredText } from '../composables/useStoredText'
import { saveLine, useAutosave } from '../composables/useAutosave'
import SaveStatus from '../components/SaveStatus.vue'
import { sessionPath } from '../sessionPath'

const props = defineProps<{ id: string }>()
const router = useRouter()

const session = ref<StoryboardSession | null>(null)
const loadError = ref('')
/** The Frame shown in the main panel and edited in the Prompt panel. */
const selected = ref(0)
const panel = ref<'frames' | 'queue' | 'prompt'>('frames')
const message = ref<{ kind: 'error' | Outcome; text: string } | null>(null)

/**
 * The Storyboard's own work in progress, which holds it until done: the plan, writing its Frames,
 * or an edit. Renders, upscales and 3D are queued jobs instead (`useJobs`), so editing carries on
 * beside them.
 */
interface Work {
  kind: 'plan' | 'write' | 'edit'
  phase: Activity
  frameIndex: number | null
  progress?: { step: number; total: number }
  cancelling?: boolean
  /** Started elsewhere (another tab); followed by polling. */
  detached?: boolean
}
const work = ref<Work | null>(null)

/** What the plan has produced so far, shown while it streams in. */
const planning = ref<{ look: Look | null; beats: { beat: string; shown: string[] }[] } | null>(null)

const busy = computed(() => work.value !== null)
const planned = computed(() => (session.value?.frames.length ?? 0) > 0)
/** How many Frames are written; once one is, the Look and Beats are fixed until a Restart. */
const writtenCount = computed(() => session.value?.frames.filter(isWritten).length ?? 0)
const writingStarted = computed(() => writtenCount.value > 0)
const allWritten = computed(() => planned.value && writtenCount.value === session.value!.frames.length)

/** The Frames to list: the saved ones, or the plan's Beats as they arrive. */
const frames = computed<(StoryboardFrame | { index: number; beat: string; pending: true })[]>(() => {
  if (planned.value || !planning.value) return session.value?.frames ?? []
  return planning.value.beats.map(({ beat }, index) => ({ index, beat, pending: true as const }))
})
const current = computed(() => {
  const f = frames.value[selected.value]
  return f && !('pending' in f) ? f : null
})
/** The selected Frame is written: it has sentences to edit, and a prompt to render. */
const currentWritten = computed(() => !!current.value && isWritten(current.value))
const look = computed(() => session.value?.look ?? planning.value?.look ?? null)
/** The picture a Frame shows, by the Storyboard's Image Model if it has one. */
const pictureOf = (frame: PicturedFrame) => shownPicture(frame, session.value!.settings.imageModel)
/** A Frame's picture is changed since render: its prompt changed, or it's by another model. */
const changed = (frame: PicturedFrame) => {
  const picture = pictureOf(frame)
  return !!picture && changedSinceRender(picture, session.value!.settings.imageModel)
}
/** The picture of the selected Frame. */
const picture = computed(() => (current.value ? pictureOf(current.value) : undefined))

// --- Loading, and planning on first open.

// A kept-alive screen keeps running in the background; it only navigates while on screen.
let onScreen = true
let leaveOnReturn: { path: string; query: Record<string, string> } | null = null
function leave(query: Record<string, string> = {}) {
  clearCurrentSession(props.id)
  draft.value = ''
  if (onScreen) router.replace({ path: '/', query })
  else leaveOnReturn = { path: '/', query }
}

async function load(): Promise<boolean> {
  try {
    const loaded = await getSession(props.id)
    // This screen is for Storyboards; a Chain has its own.
    if (loaded.kind !== 'storyboard') {
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
  setCurrentSession(props.id, 'storyboard', session.value?.title)
  return true
}

let started = false
async function start() {
  if (started) return
  if (!(await load())) return
  started = true
  if (session.value!.activity) follow()
  else if (!planned.value) await plan()
}
onMounted(start)

let firstActivation = true
onActivated(async () => {
  onScreen = true
  if (firstActivation) return (firstActivation = false)
  if (leaveOnReturn) return router.replace(leaveOnReturn)
  if (!started) return start()
  if (!busy.value && (await load()) && session.value!.activity) follow()
})
onDeactivated(() => (onScreen = false))

// Work started in another tab: show it, and poll until it's done.
let followTimer: ReturnType<typeof setTimeout> | undefined
function follow() {
  const s = session.value!
  work.value = {
    // Writing the Frames is on no one Frame; an edit is.
    kind: !s.frames.length ? 'plan' : s.activeFrame == null ? 'write' : 'edit',
    phase: s.activity!,
    frameIndex: s.activeFrame ?? null,
    detached: true,
  }
  const poll = async () => {
    if (!(await load())) return (work.value = null)
    const s = session.value!
    if (s.activity) {
      work.value = { ...work.value!, phase: s.activity, frameIndex: s.activeFrame ?? null }
      followTimer = setTimeout(poll, 1500)
    } else work.value = null
  }
  followTimer = setTimeout(poll, 1500)
}
onBeforeUnmount(() => clearTimeout(followTimer))

// --- Streamed work.

/** Updates the progress shown for whatever is running; returns true for a final event. */
function track(event: StoryboardEvent): boolean {
  switch (event.type) {
    case 'phase':
      work.value = { ...work.value!, phase: event.phase }
      return false
    case 'progress':
      work.value = { ...work.value!, progress: { step: event.step, total: event.total } }
      return false
    case 'failed':
      if (event.sessionDiscarded) leave({ error: event.message })
      else message.value = { kind: 'error', text: event.message }
      return true
    case 'cancelled':
      if (event.sessionDiscarded) leave()
      return true
  }
  return false
}

async function run(next: Work, call: () => Promise<void>) {
  work.value = next
  message.value = null
  try {
    await call()
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  } finally {
    work.value = null
  }
}

async function plan() {
  planning.value = { look: null, beats: [] }
  await run({ kind: 'plan', phase: 'text', frameIndex: null }, () =>
    planStoryboard(props.id, (event) => {
      if (track(event)) return
      const p = planning.value!
      // The Look comes first, so a new one means a retry started the plan over.
      if (event.type === 'look') planning.value = { look: event.look, beats: [] }
      else if (event.type === 'planned-beat') {
        p.beats[event.index] = { beat: event.beat, shown: event.shown }
      } else if (event.type === 'planned') {
        session.value = event.session
        planning.value = null
      }
    }))
}

/**
 * Writes the Frames from the reviewed plan, a call per Frame, each shown as it's saved; after a
 * failure or Cancel, writing again carries on from the first not written.
 */
async function writeFrames() {
  if (busy.value || !planned.value || allWritten.value) return
  // Written from the plan as saved.
  if (!(await flushEdits('written'))) return
  const first = session.value!.frames.findIndex((f) => !isWritten(f))
  await run({ kind: 'write', phase: 'text', frameIndex: first }, () =>
    writeStoryboard(props.id, (event) => {
      if (track(event)) return
      if (event.type === 'written-frame') {
        const s = session.value!
        s.frames = s.frames.map((f) => (f.index === event.frame.index ? event.frame : f))
        work.value = { ...work.value!, frameIndex: event.frame.index + 1 }
      } else if (event.type === 'written') session.value = event.session
    }))
}

/** Back to the plan, once confirmed: every Frame's sentences and pictures go. */
async function restart() {
  if (busy.value) return
  const what =
    'Restart this Storyboard? Every Frame\'s sentences and pictures are deleted, and the Look and ' +
    "Beats can be edited again. This can't be undone."
  if (!confirm(what)) return
  message.value = null
  try {
    session.value = await restartStoryboard(props.id)
    await load()
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  }
}

// --- Queued work: renders, upscales and 3D, each on its Frame.

const { jobs, runningJob, jobsFor, hasJob, queue, queueAll, dropJob, clear, retry } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (text) => (message.value = { kind: 'error', text }),
  reportFailures: true,
})
/** A Frame's running job, if any, else the next queued one: what its status says it's doing. */
const frameJob = (index: number) => {
  const open = jobsFor(index).filter((j) => j.status !== 'failed')
  return open.find((j) => j.status === 'running') ?? open[0] ?? null
}
/** The selected Frame's running job, if any: its picture sweeps while it works. */
const selectedJob = computed(() =>
  jobsFor(selected.value).find((j) => j.status === 'running') ?? null
)

/** Frames that still need an image: never rendered, or changed since. Blocked ones are skipped. */
const toRender = computed(() =>
  (session.value?.frames ?? []).filter((f) =>
    isWritten(f) && !f.blocked && (!pictureOf(f) || changed(f)) && !hasJob(f.index, 'render')
  )
)

async function cancel() {
  if (work.value) work.value = { ...work.value, cancelling: true }
  await cancelFrame(props.id)
}

// --- Editing.

/** The unsent Action, remembered per Session so it survives a reload. */
const draft = useStoredText(`draft:${props.id}`)
async function sendAction() {
  const action = draft.value.trim()
  if (!action || busy.value || !current.value || !currentWritten.value) return
  const index = current.value.index
  // The Action is made to what's saved.
  if (!(await flushEdits('sent'))) return
  await run({ kind: 'edit', phase: 'text', frameIndex: index }, () =>
    editStoryboardFrame(props.id, index, action, (event) => {
      if (track(event)) return
      if (event.type === 'edited') {
        session.value = event.session
        message.value = { kind: event.outcome, text: event.narration }
        // A done edit used the Action; a declined or unclear one stays to be reworded.
        if (event.outcome === 'done') draft.value = ''
      }
    }))
}

/**
 * Hand edits, saved as the focus leaves their panel (`useAutosave`), in one line: the Look, and the
 * selected Frame's sentences and who it shows.
 */
const line = saveLine()
const lookForm = useTemplateRef<InstanceType<typeof LookForm>>('lookForm')
async function saveLookDraft(draft: Look): Promise<Look> {
  session.value = await saveLook(props.id, draft)
  return session.value.look!
}

/** The selected Frame's text and who it shows: its Beat until it's written, then its sentences. */
interface FrameDraft {
  text: string
  shown: string[]
}
/** Which Frame, and which of its texts: `3:beat`, `3:body`. */
const draftKey = (index: number, written: boolean) => `${index}:${written ? 'body' : 'beat'}`
const keyIndex = (key: unknown) => Number(String(key).split(':')[0])
const {
  draft: frameDraft,
  status: frameStatus,
  canRevert: frameCanRevert,
  flush: flushFrame,
  revert: revertFrame,
  onFocusout: onFrameFocusout,
} = useAutosave<FrameDraft>({
  source: () => {
    const f = current.value
    return f ? { text: isWritten(f) ? f.body : f.beat, shown: f.shown } : null
  },
  key: () => current.value && draftKey(current.value.index, isWritten(current.value)),
  async save(draft, key) {
    const index = keyIndex(key)
    const text = draft.text.trim()
    session.value = String(key).endsWith(':body')
      ? await saveFrameBody(props.id, index, text, draft.shown)
      : await saveBeat(props.id, index, text, draft.shown)
    const saved = session.value.frames[index]
    return { text: isWritten(saved) ? saved.body : saved.beat, shown: saved.shown }
  },
  hold: (draft) =>
    draft.text.trim() ? null : currentWritten.value ? 'the Frame needs its sentences' : 'the Beat needs a line',
  normal: (draft) => ({ text: draft.text.trim(), shown: draft.shown }),
  name: (key) => frameTitle(keyIndex(key)),
  line,
})
/** The selected Frame's text and Shows can be edited: its sentences once written, else its Beat until writing starts. */
const frameEditable = computed(() => currentWritten.value || !writingStarted.value)
/** The selected Frame is rendering: its sentences wait, so its picture is of what they say. */
const renderingSelected = computed(() =>
  runningJob.value?.kind === 'render' && runningJob.value.frameIndex === selected.value
)
/**
 * Who's renamed when the Look's names change from `before` to `after`, as the server has it
 * (`renameShown`): a name kept stays; while the count is the same, one gone is the person in its
 * place; otherwise it's dropped (null).
 */
const renamedTo = (before: string[], after: string[], name: string): string | null =>
  after.includes(name)
    ? name
    : after.length === before.length && before.includes(name)
    ? after[before.indexOf(name)]
    : null
const lookNames = () => look.value?.people.map((p) => p.name) ?? []
// A rename in the Look carries over to the Frame's draft, as the server does to every Frame.
watch(lookNames, (after, before) => {
  const draft = frameDraft.value
  if (!draft || !before) return
  const shown = draft.shown.map((n) => renamedTo(before, after, n)).filter((n) => n !== null)
  if (shown.join('\n') !== draft.shown.join('\n')) draft.shown = shown
})

/** Shows or hides a person in the selected Frame; one added is the least prominent. */
async function toggleShown(name: string) {
  // A Look edit goes first, so the name is one the Look has.
  const before = lookNames()
  if (!(await (lookForm.value?.flush() ?? true))) return
  const now = renamedTo(before, lookNames(), name)
  const draft = frameDraft.value
  if (!now || !draft) return
  draft.shown = draft.shown.includes(now)
    ? draft.shown.filter((n) => n !== now)
    : [...draft.shown, now]
  flushFrame()
}

/** Saves what's edited by hand, before work that reads it; false, saying why, if it can't. */
async function flushEdits(what: string): Promise<boolean> {
  if ((await (lookForm.value?.flush() ?? true)) && (await flushFrame())) return true
  message.value = { kind: 'error', text: `Not ${what}: an edit isn't saved (see the Prompt panel)` }
  return false
}
async function queueSaved(kind: JobKind, index: number) {
  if (await flushEdits('queued')) queue(kind, index)
}
/** A new Chain from the Frames up to `index`, opened to carry on from it by Actions. */
const copying = ref(false)
async function continueAsChain(index: number) {
  if (copying.value || !(await flushEdits('copied'))) return
  copying.value = true
  message.value = null
  try {
    const chain = await chainFromStoryboard(props.id, index)
    router.push(sessionPath(chain.id, 'chain'))
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  } finally {
    copying.value = false
  }
}
async function renderAll() {
  // After saving, as an edit may have changed more Frames since.
  if (await flushEdits('rendered')) queueAll('render', toRender.value.map((f) => f.index))
}

// Leaving the site or reloading drops the connection to running work, which cancels it.
function warnBeforeUnload(e: BeforeUnloadEvent) {
  if (busy.value && !work.value?.detached) {
    e.preventDefault()
    e.returnValue = ''
  }
}
useEventListener(window, 'beforeunload', warnBeforeUnload)

// --- Labels.

/** Draft, Stale, Blocked or Rendered, for a Frame in the list and on the image. */
function status(f: StoryboardFrame): { label: string; tone: string } {
  if (!isWritten(f)) return { label: 'Not written', tone: 'text-muted' }
  if (f.blocked) return { label: 'Blocked', tone: 'text-danger' }
  if (!pictureOf(f)) return { label: 'Draft', tone: 'text-muted' }
  if (changed(f)) return { label: 'Changed since render', tone: 'text-warn' }
  if (pictureOf(f)!.upscaled) return { label: 'Upscaled', tone: 'text-ok' }
  return { label: 'Rendered', tone: 'text-ok' }
}

const statusLabel = computed(() => {
  const w = work.value
  if (!w) return ''
  if (w.cancelling) return 'Cancelling…'
  const total = session.value?.frames.length || session.value?.frameCount || 0
  if (w.kind === 'plan') {
    if (!planning.value?.look) return 'Planning the Storyboard…'
    const planned = planning.value.beats.filter(Boolean).length
    return `Planning Beat ${Math.min(planned + 1, total)} of ${total}…`
  }
  if (w.kind === 'write') return `Writing Frame ${Math.min((w.frameIndex ?? 0) + 1, total)} of ${total}…`
  if (w.phase === 'download') return DOWNLOADING
  return `Editing Frame ${(w.frameIndex ?? 0) + 1}…`
})

/** The image frame sweeps while a job makes the selected Frame's picture; the text box while it's edited. */
const renderingHere = computed(() => sweepOf(selectedJob.value?.phase))
/** The picture forming, over the frame, while a job renders the selected Frame. */
const forming = computed(() => jobForming(session.value, selectedJob.value))
const editingHere = computed(() => work.value?.kind === 'edit' && work.value.frameIndex === selected.value)

const { renderedParts } = useImageModels()
/** Writing the Frame, then rendering the picture it shows, once it has one, and by which model. */
const timingsLabel = (f: StoryboardFrame) => {
  if (!f.timings) return ''
  const picture = pictureOf(f)
  return [`Text ${f.timings.text.toFixed(1)} s`, ...(picture ? renderedParts(picture) : [])]
    .join(' · ')
}

/** The Storyboard switched Image Model: it comes back without what only a load adds. */
function onImageModel(switched: StoryboardSession) {
  session.value = { ...session.value!, ...switched }
}

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)
const frameTitle = (index: number) => `Frame ${index + 1}`
const frameList = useTemplateRef<HTMLElement>('frameList')
/** From the Queue tab: picks the Frame and shows it in the Frames list. */
function goToFrame(index: number) {
  selected.value = index
  panel.value = 'frames'
  showPickedFrame(frameList)
}
/** ↑ and ↓ in the Frames list. */
const onFrameKey = useFrameKeys(frameList, {
  count: () => frames.value.length,
  current: () => selected.value,
  pick: (index) => (selected.value = index),
})
/** Rendering needs pictures on; off, a Storyboard's plan can still be read and edited. */
const { on: featureOn } = useFeatures()
const imagesOn = computed(() => featureOn.value('images'))
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Storyboard: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div v-if="featureOn('images')" class="flex items-center justify-end gap-4 text-sm">
          <ImageModelPicker
            :session="session"
            @switched="onImageModel"
            @failed="(text) => (message = { kind: 'error', text })"
          />
          <ModelComparison
            :session-id="session.id"
            :frames="session.frames"
            :image-model="session.settings.imageModel"
            :name="frameTitle"
            :caption="(f) => f.beat"
            @changed="load"
            one-style
          />
        </div>
        <FrameImage
          :src="picture ? imageUrl(session.id, picture.upscaled ?? picture.image) : null"
          :alt="current?.prompt"
          :rendering="renderingHere"
          :preview="forming"
          :hide-size="busy"
          :empty-text="!current ? 'Planning…' : !currentWritten ? 'Not written yet' : current.blocked ? 'Blocked: edit this Frame first' : 'Not rendered yet'"
          :expected-size="session.imageSize"
          @open="viewingPicture = current!.index"
        >
          <div
            v-if="busy || selectedJob"
            class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            role="status"
          >
            <span class="animate-pulse">{{
              busy ? statusLabel : `${JOB_NAMES[selectedJob!.kind]} · ${jobStatus(selectedJob!)}`
            }}</span>
          </div>
          <div
            v-if="frames.length"
            class="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            data-frame-badge
          >
            Frame {{ selected + 1 }} of {{ frames.length }}
            <template v-if="current"> · {{ status(current).label }}</template>
          </div>
          <div
            v-if="frames[selected]?.beat"
            class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/60 to-transparent px-5 pb-4 pt-12 text-sm text-white"
            data-beat
          >
            {{ frames[selected].beat }}
          </div>
        </FrameImage>

        <div class="flex shrink-0 flex-col gap-2">
          <div
            class="flex rounded-lg"
            :class="{ 'render-sweep': editingHere }"
            :data-writing="editingHere ? '' : undefined"
          >
            <ComposeBox
              v-model="draft"
              :placeholder="currentWritten
              ? `What to change in Frame ${current!.index + 1}… (Enter to send, Shift+Enter for a new line)`
              : 'Frames can be edited by Action once they\'re written.'"
              :disabled="busy || !currentWritten"
              @send="sendAction"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="!busy">
              <button
                v-if="planned && !allWritten"
                type="button"
                class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
                :title="writingStarted
                ? 'Write the Frames not written yet, carrying on from those that are'
                : 'Write each Frame\'s sentences from the Look and Beats as they are now. They are fixed after.'"
                data-write
                @click="writeFrames"
              >
                {{ writingStarted
                  ? `Write the rest (${session.frames.length - writtenCount})`
                  : `Write ${session.frames.length} Frames` }}
              </button>
              <button
                v-if="currentWritten"
                type="button"
                class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
                :disabled="!draft.trim()"
                @click="sendAction"
              >
                Send
              </button>
            </template>
            <button
              v-if="busy && !work?.detached"
              type="button"
              class="rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
              :disabled="work?.cancelling"
              @click="cancel"
            >
              Cancel
            </button>
            <PictureButtons
              v-if="current && currentWritten"
              :picture="picture"
              :has-job="(kind) => hasJob(current!.index, kind)"
              :can-render="!current.blocked"
              button-class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              @queue="(kind) => queueSaved(kind, current!.index)"
              @view="(kind) => (open3d = { index: current!.index, kind })"
            />
            <RenderAllButton
              v-if="imagesOn && writingStarted"
              :count="toRender.length"
              title="Queue a render of every Frame not rendered yet, or changed since"
              @render="renderAll"
            />
            <p
              v-if="message"
              class="min-w-0 flex-1 truncate text-sm"
              :class="{
                'text-danger': message.kind === 'error',
                'text-warn': message.kind === 'declined',
                'text-info': message.kind === 'unclear',
                'text-muted': message.kind === 'done',
              }"
              :title="message.text"
              role="alert"
            >
              {{ message.text }}
            </p>
          </div>
        </div>
      </main>

      <aside class="flex w-80 flex-col border-l border-line xl:w-auto xl:flex-row">
        <!-- Narrow windows: one panel at a time. From xl up: the Prompt beside the others. -->
        <div class="xl:hidden">
          <PanelTabs
            v-model="panel"
            :tabs="[
              { id: 'frames', label: 'Frames' },
              { id: 'queue', label: queueTabLabel(jobs) },
              { id: 'prompt', label: 'Prompt' },
            ]"
          />
        </div>

        <section
          class="min-h-0 flex-1 flex-col xl:w-72 xl:flex-none xl:border-r xl:border-line"
          :class="panel === 'prompt' ? 'hidden xl:flex' : 'flex'"
          data-frames-panel
        >
          <div class="hidden xl:block">
            <PanelTabs
              v-model="panel"
              :tabs="[{ id: 'frames', label: 'Frames' }, { id: 'queue', label: queueTabLabel(jobs) }]"
            />
          </div>
          <!-- The queue: what's running, queued and failed; click one to go to its Frame. -->
          <div v-if="panel === 'queue'" class="min-h-0 flex-1 overflow-y-auto" data-queue>
            <JobQueue
              :jobs="jobs"
              empty="Nothing queued. Render, Render all and Upscale add work here, to run while you carry on."
              :name="frameTitle"
              @go="goToFrame"
              @retry="retry"
              @drop="dropJob"
              @clear="clear"
            />
          </div>
          <ol
            v-show="panel !== 'queue'"
            ref="frameList"
            class="flex-1 overflow-y-auto"
            role="tabpanel"
            @keydown="onFrameKey"
          >
            <li v-for="f in frames" :key="f.index" class="group relative">
              <button
                type="button"
                class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
                :class="{ 'bg-surface': selected === f.index }"
                :aria-current="selected === f.index"
                data-frame
                @click="selected = f.index"
              >
                <img
                  v-if="'pictures' in f && pictureOf(f)"
                  :src="imageUrl(session.id, pictureOf(f)!.image)"
                  alt=""
                  class="h-20 w-14 shrink-0 rounded object-cover"
                  :class="{ 'opacity-50': changed(f) }"
                />
                <span
                  v-else
                  class="flex h-20 w-14 shrink-0 items-center justify-center rounded border border-dashed border-line text-muted"
                >
                  {{ f.index + 1 }}
                </span>
                <span class="flex min-w-0 flex-col gap-1">
                  <span class="line-clamp-3">{{ f.beat }}</span>
                  <span v-if="'pending' in f" class="animate-pulse text-xs text-muted">Planning…</span>
                  <span
                    v-else-if="work?.kind === 'write' && work.frameIndex === f.index"
                    class="animate-pulse text-xs text-muted"
                    data-status
                  >
                    Writing…
                  </span>
                  <span v-else class="text-xs font-medium" :class="status(f).tone" data-status>
                    {{ frameJob(f.index) ? `${JOB_NAMES[frameJob(f.index)!.kind]}…` : status(f).label }}
                  </span>
                </span>
              </button>
              <button
                v-if="planned && !busy && !('pending' in f) && isWritten(f)"
                type="button"
                class="absolute right-2 top-2 rounded border border-line bg-canvas px-2 py-0.5 text-xs text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                :disabled="!!f.blocked || copying"
                :title="f.blocked
                ? 'Edit this Frame first: it crosses a limit'
                : `A new Chain of Frames 1 to ${f.index + 1}, with their pictures, to carry on from this Frame by Actions. This Storyboard stays as it is.`"
                data-continue-chain
                @click="continueAsChain(f.index)"
              >
                {{ copying ? 'Making…' : 'Chain from here' }}
              </button>
            </li>
          </ol>
        </section>

        <section
          class="min-h-0 flex-1 flex-col xl:w-[28rem] xl:flex-none"
          :class="panel === 'prompt' ? 'flex' : 'hidden xl:flex'"
          data-prompt-panel
        >
          <h2 class="hidden border-b border-line px-4 py-2 text-sm font-medium xl:block">Prompt</h2>
          <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm" role="tabpanel">
            <p v-if="!look" class="text-muted">The Look and Frames appear as the plan is written.</p>

            <LookForm
              v-else
              ref="lookForm"
              :look="look"
              :save="saveLookDraft"
              :line="line"
              id-prefix="storyboard.look"
              every="every Frame"
              :disabled="busy || !planned || writingStarted"
            />
            <div v-if="writingStarted" class="flex items-center gap-2 text-xs text-muted" data-plan-fixed>
              <span class="flex-1">The Look and Beats are fixed now that Frames are written.</span>
              <button
                type="button"
                class="rounded border border-line px-2 py-1 hover:text-fg disabled:opacity-50"
                :disabled="busy"
                title="Back to the plan: every Frame's sentences and pictures are deleted, and the Look and Beats can be edited again"
                data-restart
                @click="restart"
              >
                Restart…
              </button>
            </div>
            <p v-else-if="planned" class="text-xs text-muted" data-review>
              Review the Look, and each Frame's Beat and who it shows, then write the Frames.
            </p>

            <form
              v-if="current && frameDraft"
              class="flex min-w-0 flex-col gap-2"
              data-frame-editor
              @submit.prevent="flushFrame"
              @focusout="onFrameFocusout"
            >
              <h3 class="font-medium">
                Frame {{ current.index + 1 }}
                <span v-if="currentWritten" class="font-normal text-muted">· {{ current.beat }}</span>
              </h3>
              <p v-if="current.timings" class="text-xs text-muted" data-timings>
                {{ timingsLabel(current) }}
              </p>
              <p v-if="current.blocked" class="text-xs text-danger">
                Crosses a limit ({{ current.blocked }}): edit it before rendering.
              </p>
              <div v-if="look?.people.length" class="flex flex-wrap items-center gap-1.5 text-xs" data-shown>
                <span class="text-muted">Shows</span>
                <button
                  v-for="person in look.people"
                  :key="person.name"
                  type="button"
                  class="rounded-full border border-line px-2 py-0.5 text-muted aria-pressed:bg-surface aria-pressed:text-fg disabled:opacity-50"
                  :aria-pressed="frameDraft.shown.includes(person.name)"
                  :disabled="busy || renderingSelected || !frameEditable"
                  @click="toggleShown(person.name)"
                >
                  {{ person.name }}
                </button>
                <span v-if="!frameDraft.shown.length" class="text-muted">· the place alone</span>
                <span v-else-if="frameDraft.shown.length > MAX_SHOWN" class="text-muted">
                  · only the first {{ MAX_SHOWN }} are described
                </span>
              </div>
              <!-- Its border sweeps while an Action rewrites them, as the Action box's does. -->
              <div
                class="rounded-md"
                :class="{ 'render-sweep': editingHere }"
                :data-rewriting="editingHere ? '' : undefined"
              >
                <CollapsibleTextarea
                  id="storyboard.frame"
                  v-model="frameDraft.text"
                  :label="currentWritten ? 'The Frame\'s seven sentences' : 'Its Beat'"
                  :disabled="busy || renderingSelected || !frameEditable"
                />
              </div>
              <p v-if="renderingSelected" class="text-xs text-muted">
                Read-only while it renders, so its picture is of what it says.
              </p>
              <SaveStatus
                v-else
                :status="frameStatus"
                :can-revert="frameCanRevert"
                :disabled="busy"
                @revert="revertFrame"
              />
              <details v-if="currentWritten" class="text-muted" open>
                <summary class="cursor-pointer select-none text-xs">Full prompt</summary>
                <p class="mt-1 text-xs leading-relaxed" data-prompt-text>{{ current.prompt }}</p>
              </details>
            </form>
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
      :image-model="session.settings.imageModel"
      :name="frameTitle"
    />
    <Frame3dViewers
      v-if="session"
      v-model:open="open3d"
      :session-id="session.id"
      :frames="session.frames"
      :image-model="session.settings.imageModel"
      :name="frameTitle"
    />
  </div>
</template>
