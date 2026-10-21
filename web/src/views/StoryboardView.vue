<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  chainFromStoryboard,
  type Activity,
  DOWNLOADING,
  editStoryboardFrame,
  imageUrl,
  insertBeat,
  isWritten,
  type JobKind,
  type Look,
  type Made3d,
  MAX_FRAMES,
  MAX_SHOWN,
  type Outcome,
  planStoryboard,
  removeBeat,
  reorderBeats,
  restartSession,
  saveBeat,
  saveFrameBody,
  saveLook,
  type StoryboardEvent,
  type StoryboardFrame,
  type StoryboardSession,
  writeStoryboard,
} from '../api'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ComposeBox from '../components/ComposeBox.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameImage from '../components/FrameImage.vue'
import FrameViewer from '../components/FrameViewer.vue'
import Icon from '../components/Icon.vue'
import JobQueue from '../components/JobQueue.vue'
import LookForm from '../components/LookForm.vue'
import PictureButtons from '../components/PictureButtons.vue'
import ImageModelPicker from '../components/ImageModelPicker.vue'
import ModelComparison from '../components/ModelComparison.vue'
import RenderAllButton from '../components/RenderAllButton.vue'
import PanelTabs from '../components/PanelTabs.vue'
import RestartButton from '../components/RestartButton.vue'
import { useImageModels } from '../composables/useSettingsOptions'
import { useFeatures } from '../composables/useFeatures'
import { useJobs } from '../composables/useJobs'
import { useDragReorder } from '../composables/useDragReorder'
import { showPickedFrame, useFrameKeys } from '../composables/useFrameKeys'
import { JOB_NAMES, jobForming, jobStatus, queueTabLabel, sweepOf } from '../jobs'
import { useSessionScreen } from '../composables/useSessionScreen'
import { saveLine, useAutosave } from '../composables/useAutosave'
import SaveStatus from '../components/SaveStatus.vue'
import { sessionPath } from '../sessionPath'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Frame shown in the main panel and edited in the Prompt panel. */
const selected = ref(0)
const frameList = useTemplateRef<HTMLElement>('frameList')
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
const { session, loadError, draft, busy, load, leave, cancel, onImageModel, pictureOf, changed } =
  useSessionScreen(props.id, 'storyboard', {
    work,
    // A new Storyboard is planned.
    begin: (s) => (s.frames.length ? undefined : plan()),
    following: (s, followed): Work =>
      followed
        ? { ...followed, phase: s.activity!, frameIndex: s.activeFrame ?? null }
        : {
          // Writing the Frames is on no one Frame; an edit is.
          kind: !s.frames.length ? 'plan' : s.activeFrame == null ? 'write' : 'edit',
          phase: s.activity!,
          frameIndex: s.activeFrame ?? null,
          detached: true,
        },
  })

/** What the plan has produced so far, shown while it streams in. */
const planning = ref<{ look: Look | null; beats: { beat: string; shown: string[] }[] } | null>(null)

/** Why nothing can be queued while busy: a render, upscale or 3D would unload the Text Model. */
const waitForText = computed(() => (busy.value ? 'Wait for the writing to finish' : undefined))
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
/** The picture of the selected Frame. */
const picture = computed(() => (current.value ? pictureOf(current.value) : undefined))

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
/** While the Frames are written, the one shown follows the writing, until another is picked. */
let following = false
function followWriting(index: number) {
  if (!following || index >= frames.value.length) return
  selected.value = index
  showPickedFrame(frameList)
}
async function writeFrames() {
  if (busy.value || !planned.value || allWritten.value) return
  // Written from the plan as saved.
  if (!(await flushEdits('written'))) return
  const first = session.value!.frames.findIndex((f) => !isWritten(f))
  following = true
  followWriting(first)
  await run({ kind: 'write', phase: 'text', frameIndex: first }, () =>
    writeStoryboard(props.id, (event) => {
      if (track(event)) return
      if (event.type === 'written-frame') {
        const s = session.value!
        s.frames = s.frames.map((f) => (f.index === event.frame.index ? event.frame : f))
        work.value = { ...work.value!, frameIndex: event.frame.index + 1 }
        followWriting(event.frame.index + 1)
      } else if (event.type === 'written') session.value = event.session
    }))
  following = false
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
    session.value = await restartSession<StoryboardSession>(props.id)
    await load()
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  }
}

// --- Queued work: renders, upscales and 3D, each on its Frame.

const { jobs, runningJobs, jobsFor, hasJob, queue, queueAll, dropJob, clear, retry } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (text) => (message.value = { kind: 'error', text }),
  reportFailures: true,
  imageModel: () => session.value?.settings.imageModel,
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

// --- Editing.

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
  runningJobs.value.some((j) => j.kind === 'render' && j.frameIndex === selected.value)
)
/**
 * Who's renamed when the Look's names change from `before` to `after`, as the server has it
 * (`renameShown`): a name kept stays; while the count is the same, one gone is the Subject in its
 * place; otherwise it's dropped (null).
 */
const renamedTo = (before: string[], after: string[], name: string): string | null =>
  after.includes(name)
    ? name
    : after.length === before.length && before.includes(name)
    ? after[before.indexOf(name)]
    : null
const lookNames = () => look.value?.subjects.map((p) => p.name) ?? []
// A rename in the Look carries over to the Frame's draft, as the server does to every Frame.
watch(lookNames, (after, before) => {
  const draft = frameDraft.value
  if (!draft || !before) return
  const shown = draft.shown.map((n) => renamedTo(before, after, n)).filter((n) => n !== null)
  if (shown.join('\n') !== draft.shown.join('\n')) draft.shown = shown
})

/** Shows or hides a Subject in the selected Frame; one added is the least prominent. */
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

/** A Beat being added by hand, after the selected Frame: before the Frame at `at`. */
const adding = ref<{ at: number; text: string; saving: boolean } | null>(null)
/** The plan is being reviewed: its Beats can be added and removed. */
const reviewing = computed(() => planned.value && !writingStarted.value && !busy.value)
/** Beats can be added up to the most Frames a Storyboard has. */
const canAddBeat = computed(() => reviewing.value && session.value!.frames.length < MAX_FRAMES)
const newBeat = useTemplateRef<HTMLTextAreaElement>('newBeat')
async function startAdding(at: number) {
  adding.value = { at, text: '', saving: false }
  await nextTick()
  newBeat.value?.focus()
}
// It's added after the selected Frame: picking another lets it go.
watch(selected, () => {
  if (!adding.value?.saving) adding.value = null
})
async function addBeat() {
  const a = adding.value
  if (!a || a.saving || !a.text.trim()) return
  // The Frames after it move up one, so an edit to one is saved first, to the Frame it's for.
  if (!(await flushEdits('added'))) return
  a.saving = true
  message.value = null
  try {
    session.value = await insertBeat(props.id, a.at, a.text.trim())
    adding.value = null
    selected.value = a.at
  } catch (err) {
    a.saving = false
    message.value = { kind: 'error', text: (err as Error).message }
  }
}

/**
 * Removes a Beat from the plan, once confirmed, the Frames after it moving down one. An edit to
 * it goes with it; an edit to another is saved first, to the Frame it's for.
 */
const removing = ref(false)
async function removeFrameBeat(frame: StoryboardFrame) {
  const what = `Remove Frame ${frame.index + 1}'s Beat? The Frames after it move up one.`
  if (removing.value || !confirm(what)) return
  if (selected.value === frame.index && frameDraft.value) {
    frameDraft.value = { text: frame.beat, shown: frame.shown }
  }
  if (!(await flushEdits('removed'))) return
  removing.value = true
  message.value = null
  try {
    const frames = session.value!.frames.length
    session.value = await removeBeat(props.id, frame.index, { frames, createdAt: frame.createdAt })
    if (selected.value > frame.index) selected.value--
    selected.value = Math.min(selected.value, session.value.frames.length - 1)
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  } finally {
    removing.value = false
  }
}

/** The Beats can be moved: while the plan is reviewed, and there's more than one. */
const canMoveBeats = computed(() => reviewing.value && session.value!.frames.length > 1)
/** While a Beat is dragged or its move saved, the Frames in their new order (old indexes). */
const dragOrder = ref<number[] | null>(null)
/** The Frames as listed: as they're being moved, or as they are. */
const listed = computed(() => dragOrder.value?.map((i) => frames.value[i]) ?? frames.value)
const inPlan = () => frames.value.map((f) => f.index)
function moved(order: number[], from: number, to: number): number[] {
  const next = [...order]
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
const { dragging: draggingBeat, grip: beatGrip } = useDragReorder({
  scroller: frameList,
  items: '[data-frame-row]',
  axis: 'y',
  move: (from, to) => (dragOrder.value = moved(dragOrder.value ?? inPlan(), from, to)),
  end: () => dragOrder.value && saveOrder(dragOrder.value),
})
/** Moves the Beat at `from` one place by ↑ or ↓, the focus staying on its grip. */
async function moveBeat(from: number, to: number) {
  if (movingBeats.value || to < 0 || to >= frames.value.length) return
  await saveOrder(moved(inPlan(), from, to))
  await nextTick()
  frameList.value?.querySelectorAll<HTMLElement>('[data-move-beat]')[to]?.focus()
}
/**
 * Saves the Beats in a new `order`, shown so meanwhile. An edit is saved first, to the Frame it's
 * for; the Frame shown stays shown, in its new place.
 */
const movingBeats = ref(false)
async function saveOrder(order: number[]) {
  if (movingBeats.value || order.every((from, to) => from === to)) {
    dragOrder.value = null
    return
  }
  movingBeats.value = true
  dragOrder.value = order
  message.value = null
  try {
    if (!(await flushEdits('moved'))) return
    const seen = () => session.value!.frames.map((f) => f.beat)
    session.value = await line(() => reorderBeats(props.id, order, seen()))
    selected.value = order.indexOf(selected.value)
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  } finally {
    dragOrder.value = null
    movingBeats.value = false
  }
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
/** The Frame whose sentences are being written from the plan, if any. */
const writingIndex = computed(() => (work.value?.kind === 'write' ? work.value.frameIndex : null))
const writingHere = computed(() => writingIndex.value !== null && writingIndex.value === selected.value)
/** A Frame not written yet, which this write gets to after the one it's on. */
const waitingToWrite = (f: { index: number }) =>
  writingIndex.value !== null && f.index > writingIndex.value

const { renderedParts, jobName } = useImageModels()
/** Writing the Frame, then rendering the picture it shows, once it has one, and by which model. */
const timingsLabel = (f: StoryboardFrame) => {
  if (!f.timings) return ''
  const picture = pictureOf(f)
  return [`Text ${f.timings.text.toFixed(1)} s`, ...(picture ? renderedParts(picture) : [])]
    .join(' · ')
}

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)
const frameTitle = (index: number) => `Frame ${index + 1}`
/** A Frame picked by the player: the one shown stops following the writing. */
function pick(index: number) {
  following = false
  selected.value = index
}
/** From the Queue tab: picks the Frame and shows it in the Frames list. */
function goToFrame(index: number) {
  pick(index)
  panel.value = 'frames'
  showPickedFrame(frameList)
}
/** ↑ and ↓ in the Frames list. */
const onFrameKey = useFrameKeys(frameList, {
  count: () => frames.value.length,
  current: () => selected.value,
  pick,
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
          :rendering="writingHere ? 'image' : renderingHere"
          :preview="forming"
          :hide-size="busy"
          :empty-text="!current ? 'Planning…' : writingHere ? 'Writing its sentences…' : !currentWritten ? 'Not written yet' : current.blocked ? 'Blocked: edit this Frame first' : 'Not rendered yet'"
          :expected-size="session.imageSize"
          @open="viewingPicture = current!.index"
        >
          <div
            v-if="busy || selectedJob"
            class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            role="status"
          >
            <span class="animate-pulse">{{
              busy ? statusLabel : `${jobName(selectedJob!)} · ${jobStatus(selectedJob!)}`
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
              :busy="waitForText"
              button-class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              @queue="(kind) => queueSaved(kind, current!.index)"
              @view="(kind) => (open3d = { index: current!.index, kind })"
            />
            <RenderAllButton
              v-if="imagesOn && writingStarted"
              :count="toRender.length"
              :busy="waitForText"
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
            <!-- At the far end, away from Send and Render: it opens a new Session. -->
            <button
              v-if="current && currentWritten && !busy"
              type="button"
              class="ml-auto rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!!current.blocked || copying"
              :title="current.blocked
              ? 'Edit this Frame first: it crosses a limit'
              : `A new Chain of Frames 1 to ${current.index + 1}, with their pictures, to carry on from this Frame by Actions. This Storyboard stays as it is.`"
              data-continue-chain
              @click="continueAsChain(current.index)"
            >
              {{ copying ? 'Making…' : 'Chain from here' }}
            </button>
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
            <li
              v-for="(f, position) in listed"
              :key="f.index"
              class="flex"
              :class="{ 'opacity-60': draggingBeat === position }"
              data-frame-row
            >
              <!-- While the plan is reviewed: its grip, to drag the Beat up or down the list. -->
              <button
                v-if="canMoveBeats"
                type="button"
                class="flex shrink-0 cursor-grab touch-none items-center border-b border-line pl-1.5 text-muted hover:text-fg active:cursor-grabbing"
                :aria-label="`Move Frame ${f.index + 1}'s Beat (drag, or ↑ and ↓)`"
                :title="`Drag to move Frame ${f.index + 1}'s Beat`"
                data-move-beat
                v-on="beatGrip(position)"
                @keydown.up.prevent.stop="moveBeat(position, position - 1)"
                @keydown.down.prevent.stop="moveBeat(position, position + 1)"
              >
                <Icon name="grip" />
              </button>
              <button
                type="button"
                class="flex min-w-0 flex-1 gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
                :class="{ 'bg-surface': selected === f.index }"
                :aria-current="selected === f.index"
                data-frame
                @click="pick(f.index)"
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
                  :class="{ 'render-sweep': writingIndex === f.index }"
                  :data-writing-frame="writingIndex === f.index ? '' : undefined"
                >
                  {{ f.index + 1 }}
                </span>
                <span class="flex min-w-0 flex-col gap-1">
                  <span class="line-clamp-3">{{ f.beat }}</span>
                  <span v-if="'pending' in f" class="animate-pulse text-xs text-muted">Planning…</span>
                  <span
                    v-else-if="writingIndex === f.index"
                    class="animate-pulse text-xs text-info"
                    data-status
                  >
                    Writing…
                  </span>
                  <span v-else-if="waitingToWrite(f) && !isWritten(f)" class="text-xs text-muted" data-status>
                    Waiting
                  </span>
                  <span v-else class="text-xs font-medium" :class="status(f).tone" data-status>
                    {{ frameJob(f.index) ? `${JOB_NAMES[frameJob(f.index)!.kind]}…` : status(f).label }}
                  </span>
                </span>
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
              :fixed="writingStarted"
            >
              <template #actions>
                <RestartButton
                  v-if="writingStarted"
                  :disabled="busy"
                  title="The Look and Beats are fixed now that Frames are written. Restart to go back to the plan: every Frame's sentences and pictures are deleted, and the Look and Beats can be edited again"
                  @restart="restart"
                />
              </template>
            </LookForm>

            <form
              v-if="current && frameDraft"
              class="flex min-w-0 flex-col gap-2"
              data-frame-editor
              @submit.prevent="flushFrame"
              @focusout="onFrameFocusout"
            >
              <h3 class="text-base font-semibold">
                Frame {{ current.index + 1 }}
                <span v-if="currentWritten" class="text-sm font-normal text-muted">· {{ current.beat }}</span>
              </h3>
              <p v-if="current.timings" class="text-xs text-muted" data-timings>
                {{ timingsLabel(current) }}
              </p>
              <p v-if="current.blocked" class="text-xs text-danger">
                Crosses a limit ({{ current.blocked }}): edit it before rendering.
              </p>
              <div v-if="look?.subjects.length" class="flex flex-wrap items-center gap-1.5 text-xs" data-shown>
                <span class="text-muted">Shows</span>
                <button
                  v-for="subject in look.subjects"
                  :key="subject.name"
                  type="button"
                  class="rounded-full border border-line px-2 py-0.5 text-muted aria-pressed:bg-surface aria-pressed:text-fg disabled:opacity-50"
                  :aria-pressed="frameDraft.shown.includes(subject.name)"
                  :disabled="busy || renderingSelected || !frameEditable"
                  @click="toggleShown(subject.name)"
                >
                  {{ subject.name }}
                </button>
                <span v-if="!frameDraft.shown.length" class="text-muted">· the place alone</span>
                <span v-else-if="frameDraft.shown.length > MAX_SHOWN" class="text-muted">
                  · only the first {{ MAX_SHOWN }} are described
                </span>
              </div>
              <!-- Its border sweeps while an Action rewrites them, as the Action box's does. -->
              <div
                class="rounded-md"
                :class="{ 'render-sweep': editingHere || writingHere }"
                :data-rewriting="editingHere || writingHere ? '' : undefined"
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
              <details v-if="currentWritten" class="group/prompt text-muted" open>
                <summary class="flex cursor-pointer select-none items-baseline gap-1.5 text-xs hover:text-fg">
                  <span class="shrink-0 transition-transform group-open/prompt:rotate-90">›</span>
                  Full prompt
                </summary>
                <p class="mt-1 text-xs leading-relaxed" data-prompt-text>{{ current.prompt }}</p>
              </details>
            </form>
            <!-- While the plan is reviewed: a Beat added after the selected Frame, or it removed. -->
            <div v-if="reviewing && current" class="flex flex-col gap-2 text-xs" data-beat-actions>
              <form v-if="adding" class="flex flex-col gap-2" data-adding-beat @submit.prevent="addBeat">
                <label for="storyboard.new-beat" class="text-muted">
                  New Beat, as Frame {{ adding.at + 1 }}
                </label>
                <textarea
                  id="storyboard.new-beat"
                  ref="newBeat"
                  v-model="adding.text"
                  rows="3"
                  class="w-full resize-none rounded border border-line bg-surface px-2 py-1 text-sm"
                  placeholder="What happens in it, and who it shows… (Enter to add, Esc to cancel)"
                  :disabled="adding.saving"
                  @keydown.enter.exact.prevent="addBeat"
                  @keydown.esc="adding = null"
                />
                <div class="flex gap-2">
                  <button
                    type="submit"
                    class="rounded bg-fg px-2 py-1 font-medium text-canvas disabled:opacity-50"
                    :disabled="adding.saving || !adding.text.trim()"
                  >
                    {{ adding.saving ? 'Adding…' : 'Add' }}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-line px-2 py-1"
                    :disabled="adding.saving"
                    @click="adding = null"
                  >
                    Cancel
                  </button>
                </div>
              </form>
              <div v-else class="flex gap-2">
                <button
                  v-if="canAddBeat"
                  type="button"
                  class="flex items-center gap-1 rounded border border-line px-2 py-1 text-muted hover:text-fg"
                  :title="`Add a Beat after Frame ${current.index + 1}`"
                  data-add-beat
                  @click="startAdding(current.index + 1)"
                >
                  <Icon name="plus" /> Beat after
                </button>
                <button
                  v-if="session.frames.length > 1"
                  type="button"
                  class="rounded border border-line px-2 py-1 text-muted hover:text-danger disabled:opacity-50"
                  :disabled="removing"
                  title="Remove this Beat from the plan"
                  data-remove-beat
                  @click="removeFrameBeat(current)"
                >
                  Remove Beat
                </button>
              </div>
            </div>
          </div>
          <!-- Below the Look and Beats, where the review ends: write the Frames, or stop the plan or writing. -->
          <div
            v-if="(planned && !allWritten && !busy) || (busy && work?.kind !== 'edit' && !work?.detached)"
            class="flex shrink-0 flex-wrap items-center gap-2 border-t border-line p-4 text-sm"
            data-prompt-footer
          >
            <p v-if="!busy && !writingStarted" class="w-full text-xs text-muted" data-review>
              Review the Look, and each Frame's Beat and who it shows, then write the Frames.
            </p>
            <button
              v-if="!busy"
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
              v-else
              type="button"
              class="rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
              :disabled="work?.cancelling"
              data-prompt-cancel
              @click="cancel"
            >
              Cancel
            </button>
            <div
              v-if="work?.kind === 'write'"
              class="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted"
              role="progressbar"
              :aria-valuenow="writtenCount"
              :aria-valuemax="session.frames.length"
              data-write-progress
            >
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  class="h-full rounded-full bg-info transition-[width] duration-500"
                  :style="{ width: `${(100 * writtenCount) / session.frames.length}%` }"
                />
              </div>
              <span class="shrink-0">{{ writtenCount }} of {{ session.frames.length }} written</span>
            </div>
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
