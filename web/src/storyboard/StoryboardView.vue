<script setup lang="ts">
import SessionBar from '../components/SessionBar.vue'
import { ask } from '../ask'
import { frameName } from '../frameName'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  chainFromFrame,
  type Activity,
  DOWNLOADING,
  editStoryboardFrame,
  imageUrl,
  insertBeat,
  pickedEdit,
  isWritten,
  type Job,
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
import ShownPills from '../components/ShownPills.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import Icon from '../components/Icon.vue'
import LookForm from '../components/LookForm.vue'
import { clipCount, clipsMaking, usePlayingClip } from '../clips'
import FloatingBox from '../components/FloatingBox.vue'
import FrameClips from '../components/FrameClips.vue'
import FrameStrip, { type StripTile } from '../components/FrameStrip.vue'
import AllFrames from '../components/AllFrames.vue'
import PopMenu from '../components/PopMenu.vue'
import RestartButton from '../components/RestartButton.vue'
import SessionDrawer from '../components/SessionDrawer.vue'
import SessionPicture from '../components/SessionPicture.vue'
import SessionSettings from '../components/SessionSettings.vue'
import SessionStage from '../components/SessionStage.vue'
import { imageRatioOf } from '../components/sessionPictureRatio'
import { useDrawer } from '../composables/useDrawer'
import { useImageModels, writtenPart } from '../composables/useSettingsOptions'
import { useFeatures } from '../composables/useFeatures'
import { useJobs } from '../composables/useJobs'
import { useJobLink } from '../composables/useJobLink'
import { usePictureEditing } from '../composables/usePictureEditing'
import { useDragReorder } from '../composables/useDragReorder'
import { jobForming, sweepOf } from '../jobs'
import { useSessionScreen } from '../composables/useSessionScreen'
import { saveLine, useAutosave } from '../composables/useAutosave'
import SaveStatus from '../components/SaveStatus.vue'
import { sessionPath } from '../sessionPath'

const props = defineProps<{ id: string }>()
const router = useRouter()

/** The Frame shown in the main panel and edited in the Prompt panel. */
const selected = ref(0)
/** The plan's Beat cards, while it's reviewed: what scrolls, and what a dragged Beat moves among. */
const frameList = useTemplateRef<HTMLElement>('frameList')
/** The drawer beside the story, once Frames are written: the Frame's full prompt, or the Look. */
const { tab: drawer, toggle: toggleDrawer } = useDrawer<'prompt' | 'clip' | 'look'>(
  'storyboard-drawer',
  'prompt',
  (tab) => tab !== 'clip' || clipsMenu.value !== null,
)
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
const { session, loadError, draft, busy, load, leave, cancel, onSwitched, onClipsModel, pictureOf, changed } =
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
    refreshJobs: () => refreshJobs(),
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
/** A clip playing over its Frame's picture, from the drawer's Clips. */
const playingClip = usePlayingClip(() => current.value?.index, () => session.value?.settings.imageModel)

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
  if (!(await ask(what, { action: 'Restart', danger: true }))) return
  message.value = null
  try {
    session.value = await restartSession<StoryboardSession>(props.id)
    await load()
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  }
}

// --- Queued work: renders, upscales and 3D, each on its Frame.

const { jobs, runningJobs, jobsFor, hasJob, workOn, workOf, dropEach, queue, queueEdit, queueClip, queueAll, dropJob, retry, refreshJobs } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (text) => (message.value = { kind: 'error', text }),
  reportFailures: true,
  onFailureGone: (text) => {
    if (message.value?.text === text) message.value = null
  },
  imageModel: () => session.value?.settings.imageModel,
})
/** The picked Frame's running job, if any: its picture sweeps while it works. */
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
  if (removing.value || !(await ask(what, { action: 'Remove', danger: true }))) return
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
  axis: 'x',
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
  message.value = { kind: 'error', text: `Not ${what}: an edit isn't saved (see the Frame or the Look)` }
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
    const chain = await chainFromFrame(props.id, index)
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
  if (w.phase === 'queued') return 'Waiting for another render…'
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

const { renderedParts, labelOf } = useImageModels()
/** Writing the Frame, then rendering the picture it shows, once it has one, and by which model. */
const timingsLabel = (f: StoryboardFrame) => {
  // Both are written with its sentences; none before.
  if (!f.timings || !f.textModel) return ''
  const picture = pictureOf(f)
  return [writtenPart({ timings: f.timings, textModel: f.textModel }), ...(picture ? renderedParts(picture) : [])]
    .join(' · ')
}

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Editing its picture there (ADR 0021): painting an edit, or watching one being made. */
/** A clip's Frame, at its Clip section on the picture it's made from. */
async function openClip(job: Job) {
  await onClipsModel(job, (text) => (message.value = { kind: 'error', text }))
  pick(job.frameIndex)
}
const { painting: paintingPicture, startEdit, showEdit, pick: pickVersion, deleteEdit, deleteUpscale } =
  usePictureEditing(props.id, session, viewingPicture, (text) => (message.value = { kind: 'error', text }))
// A job linked to from the queue page opens as this Session's Queue tab opens it.
useJobLink(() => sessionPath(props.id, 'storyboard'), () => !!session.value, jobs, refreshJobs, {
  go: (index) => pick(index),
  edit: showEdit,
  clip: openClip,
  drop: dropJob,
})
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)
const frameTitle = frameName
/** A Frame picked by the player: the one shown stops following the writing. */
function pick(index: number) {
  following = false
  selected.value = index
}
/** Rendering needs pictures on; off, a Storyboard's plan can still be read and edited. */
const { on: featureOn } = useFeatures()
const imagesOn = computed(() => featureOn.value('images'))

/**
 * The plan, as it's written and then reviewed: the Beats as cards to drag, the picked one's editor
 * and the Look beside it, Write Frames below. Once Frames are being written, the strip view.
 */
const planMode = computed(() => !writingStarted.value && work.value?.kind !== 'write')
/** The Frames as the strip shows them: each picture, or its Beat, and the work on it. */
const tiles = computed<StripTile[]>(() =>
  (session.value?.frames ?? []).map((f) => ({
    index: f.index,
    thumb: pictureOf(f) ? imageUrl(props.id, pictureOf(f)!.image) : null,
    words: f.beat,
    working: writingIndex.value === f.index ? 'running' : workOn(f.index),
    dimmed: changed(f),
    clips: clipCount(pictureOf(f), session.value!.settings.imageModel),
  }))
)
/** The picture shown is by the Storyboard's Image Model, so it can have clips. */
const ownPicture = computed(() =>
  !!picture.value && picture.value.imageModel === session.value?.settings.imageModel
)
/** How many clips the picture's Clip button says it has, or null for no Clip button. */
const clipsMenu = computed(() =>
  picture.value && featureOn.value('video')
    ? (pickedEdit(picture.value) ?? picture.value).clips?.length ?? 0
    : null
)
/** How the picked picture's edge sweeps: while a job renders it, slower while that waits. */
const sweep = computed(() =>
  writingHere.value ? 'running' : renderingHere.value === 'queued' ? 'queued' : renderingHere.value ? 'running' : null
)
/** The bar along the foot, in place of the text box: Write Frames, or the writing's progress. */
const writeBar = computed(() =>
  (planned.value && !allWritten.value && !busy.value) ||
  (busy.value && work.value?.kind !== 'edit' && !work.value?.detached)
)

/** The All Frames view, over the screen; a Frame picked there is shown here. */
const allFrames = ref(false)
const pickFromAll = (index: number) => pick(index)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-col">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Storyboard: {{ loadError }}</p>

    <template v-else-if="session">
      <SessionBar kind="Storyboard" :title="session.title ?? ''" :status="busy ? statusLabel : undefined">
        <span
          v-if="planMode && planned && !busy"
          class="rounded-full border border-line px-2 py-0.5 text-xs max-md:hidden"
        >The plan · not written yet</span>
        <template v-if="!planMode">
          <button
            v-if="imagesOn"
            type="button"
            class="rounded-md border border-line px-2 py-1 whitespace-nowrap hover:text-fg disabled:opacity-50"
            :disabled="!toRender.length || !!waitForText"
            :title="waitForText ?? 'Queue a render of every Frame not rendered yet, or changed since'"
            data-render-all
            @click="renderAll"
          >
            Render all<span v-if="toRender.length" data-render-count> ({{ toRender.length }})</span>
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 hover:bg-surface hover:text-fg"
            :class="{ 'bg-surface text-fg': drawer === 'look' }"
            title="The Look: who the Frames show, and the art style"
            data-open-look
            @click="toggleDrawer('look')"
          >
            Look
          </button>
        </template>
        <SessionSettings
          :session="session"
          title="This Storyboard"
          @switched="onSwitched"
          @failed="(text) => (message = { kind: 'error', text })"
        />
      </SessionBar>

      <!-- The plan: its Beats as cards, dragged to reorder while it's reviewed. -->
      <template v-if="planMode">
        <ol
          ref="frameList"
          class="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-3 [scrollbar-width:thin]"
          aria-label="The plan's Beats"
          data-beat-cards
        >
          <li
            v-for="(f, position) in listed"
            :key="f.index"
            class="flex w-36 shrink-0"
            :class="{ 'opacity-60': draggingBeat === position }"
            data-frame-row
          >
            <button
              type="button"
              class="flex h-20 min-w-0 flex-1 flex-col gap-1 rounded-lg border bg-surface p-2 text-left text-xs"
              :class="selected === f.index ? 'border-fg ring-1 ring-fg' : 'border-line hover:border-muted'"
              :aria-current="selected === f.index"
              data-frame
              @click="pick(f.index)"
            >
              <span class="flex items-center justify-between text-muted">
                <span>{{ f.index + 1 }}</span>
                <span v-if="'pending' in f" class="animate-pulse">Planning…</span>
              </span>
              <span class="line-clamp-2 text-fg" data-beat>{{ f.beat }}</span>
            </button>
            <!-- Its grip, to drag the Beat along the plan (or ← and →). -->
            <button
              v-if="canMoveBeats"
              type="button"
              class="-ml-6 mt-1.5 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center self-start rounded text-muted hover:text-fg active:cursor-grabbing"
              :aria-label="`Move Frame ${f.index + 1}'s Beat (drag, or ← and →)`"
              :title="`Drag to move Frame ${f.index + 1}'s Beat`"
              data-move-beat
              v-on="beatGrip(position)"
              @keydown.left.prevent.stop="moveBeat(position, position - 1)"
              @keydown.right.prevent.stop="moveBeat(position, position + 1)"
            >
              <Icon name="grip" />
            </button>
          </li>
          <li v-if="canAddBeat" class="shrink-0">
            <button
              type="button"
              class="grid h-20 w-24 place-items-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-muted hover:text-fg"
              title="Add a Beat at the end of the plan"
              data-add-beat-end
              @click="pick(session.frames.length - 1); startAdding(session.frames.length)"
            >
              + Beat
            </button>
          </li>
        </ol>

        <!-- The picked Beat, then the Look under it: who's in the Storyboard, a container each, and
             its art style. -->
        <div class="story flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-4 lg:px-8 lg:py-6">
          <section class="flex min-w-0 flex-col gap-4 text-sm" data-beat-editor>
            <p v-if="!current" class="text-muted">{{ busy ? 'The Beats appear as the plan is written.' : 'No Beats yet.' }}</p>
            <form
              v-if="frameDraft && current"
              class="flex min-w-0 flex-col gap-3"
              data-frame-editor
              @submit.prevent="flushFrame"
              @focusout="onFrameFocusout"
            >
              <CollapsibleTextarea
                id="storyboard.frame"
                v-model="frameDraft.text"
                section
                :label="`Beat ${current.index + 1}`"
                :disabled="busy || !frameEditable"
              />
              <div class="flex flex-col gap-1">
                <ShownPills
                  v-if="look?.subjects.length"
                  :names="look.subjects.map((s) => s.name)"
                  :shown="frameDraft.shown"
                  editable
                  :disabled="busy || renderingSelected || !frameEditable"
                  @toggle="toggleShown"
                >
                  <span v-if="frameDraft.shown.length > MAX_SHOWN" class="text-muted">
                    · only the first {{ MAX_SHOWN }} are described
                  </span>
                </ShownPills>
              </div>
              <SaveStatus
                :status="frameStatus"
                :can-revert="frameCanRevert"
                :disabled="busy"
                @revert="revertFrame"
              />
            </form>
            <!-- While the plan is reviewed: a Beat added after this one, or it removed. -->
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
              <div v-else class="flex gap-4">
                <button
                  v-if="canAddBeat"
                  type="button"
                  class="flex items-center gap-1 text-muted hover:text-fg"
                  :title="`Add a Beat after Frame ${current.index + 1}`"
                  data-add-beat
                  @click="startAdding(current.index + 1)"
                >
                  <Icon name="plus" /> A Beat after this
                </button>
                <button
                  v-if="session.frames.length > 1"
                  type="button"
                  class="text-danger hover:underline disabled:opacity-50"
                  :disabled="removing"
                  title="Remove this Beat from the plan"
                  data-remove-beat
                  @click="removeFrameBeat(current)"
                >
                  Remove this Beat
                </button>
              </div>
            </div>
          </section>
          <section class="min-w-0 border-t border-line pt-6 text-sm" data-plan-look>
            <p v-if="!look" class="text-muted">The Look appears as the plan is written.</p>
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
                cards
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
          </section>
        </div>
      </template>

      <!-- Written: the strip view, as a Chain's and a Roleplay's. -->
      <template v-else>
        <FrameStrip :tiles="tiles" :picked="selected" @pick="pick" @all="allFrames = true" />
        <div class="flex min-h-0 flex-1">
          <SessionStage side="notes" :ratio="imageRatioOf(session)" :pictured="imagesOn || !!picture">
            <template #picture>
              <SessionPicture
                v-if="current"
                :name="frameName(current.index)"
                :label="`${frameName(current.index)} of ${frames.length} · ${status(current).label}`"
                :src="picture ? imageUrl(session.id, picture.upscaled ?? picture.image) : null"
                :picture="picture"
                :dimmed="changed(current)"
                :preview="forming"
                :sweep="sweep"
                :jobs="jobsFor(current.index)"
                :has-job="(kind) => hasJob(current!.index, kind)"
                :working="workOf(current.index)"
                :can-render="currentWritten && !current.blocked"
                :busy="waitForText"
                :clips="clipsMenu"
                :clips-open="drawer === 'clip'"
                :playing="playingClip && playingClip.index === current.index ? { src: imageUrl(session.id, playingClip.clip.file), clip: playingClip.clip } : null"
                @queue="(kind) => queueSaved(kind, current!.index)"
                @view="(kind) => (open3d = { index: current!.index, kind })"
                @edit="startEdit(current!.index)"
                @open="viewingPicture = current!.index"
                @prompt="toggleDrawer('prompt')"
                @retry="retry"
                @drop="dropJob"
                @cancel-all="(list) => dropEach(list)"
                @stop-clip="playingClip = null"
                @clips="toggleDrawer('clip')"
              >
                <template #empty>
                  <span class="text-muted" data-empty>
                    <template v-if="writingHere">Writing its sentences…</template>
                    <template v-else-if="!currentWritten">{{ waitingToWrite(current) ? 'Waiting to be written' : 'Not written yet' }}</template>
                    <template v-else-if="current.blocked">Crosses a limit ({{ current.blocked }}): edit its sentences first</template>
                    <template v-else-if="workOn(current.index)">{{ frameName(current.index) }} is being rendered</template>
                    <template v-else>Not rendered yet</template>
                  </span>
                  <button
                    v-if="imagesOn && currentWritten && !current.blocked && !workOn(current.index)"
                    type="button"
                    class="rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas disabled:opacity-50"
                    :disabled="!!waitForText"
                    :title="waitForText"
                    data-render-it
                    @click="queueSaved('render', current.index)"
                  >
                    Render {{ frameName(current.index) }}
                  </button>
                </template>
              </SessionPicture>
            </template>

            <!-- Beside the picture: its Beat, who it shows, and its seven sentences. -->
            <template #side>
              <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2 text-sm" data-storyboard-side>
                <template v-if="current">
                  <section>
                    <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Beat {{ current.index + 1 }}</h3>
                    <p class="mt-1 text-lg font-medium" data-current-beat>{{ current.beat }}</p>
                  </section>
                  <form
                    v-if="frameDraft"
                    class="flex min-w-0 flex-col gap-3"
                    data-frame-editor
                    @submit.prevent="flushFrame"
                    @focusout="onFrameFocusout"
                  >
                    <ShownPills
                      v-if="look?.subjects.length"
                      :names="look.subjects.map((s) => s.name)"
                      :shown="frameDraft.shown"
                      editable
                      :disabled="busy || renderingSelected || !frameEditable"
                      @toggle="toggleShown"
                    >
                      <span v-if="frameDraft.shown.length > MAX_SHOWN" class="text-muted">
                        · only the first {{ MAX_SHOWN }} are described
                      </span>
                    </ShownPills>
                    <p v-if="current.blocked" class="text-xs text-danger">
                      Crosses a limit ({{ current.blocked }}): edit it before rendering.
                    </p>
                    <!-- Its border sweeps while an Action rewrites them, as the Action box's does. -->
                    <div
                      class="rounded-md"
                      :class="{ 'render-sweep': editingHere || writingHere }"
                      :data-rewriting="editingHere || writingHere ? '' : undefined"
                    >
                      <CollapsibleTextarea
                        v-if="currentWritten"
                        id="storyboard.frame"
                        v-model="frameDraft.text"
                        label="The Frame's seven sentences"
                        :disabled="busy || renderingSelected || !frameEditable"
                      />
                      <p v-else class="text-muted">{{ writingHere ? 'Writing its sentences…' : 'Its sentences are written from its Beat.' }}</p>
                    </div>
                    <p v-if="renderingSelected" class="text-xs text-muted">
                      Read-only while it renders, so its picture is of what it says.
                    </p>
                    <SaveStatus
                      v-else-if="currentWritten"
                      :status="frameStatus"
                      :can-revert="frameCanRevert"
                      :disabled="busy"
                      @revert="revertFrame"
                    />
                  </form>
                </template>
              </div>
            </template>

            <template v-if="!writeBar" #box>
              <FloatingBox
                v-model="draft"
                :placeholder="currentWritten ? `What to change in ${frameName(current!.index)}…` : 'Frames can be changed by Action once they\'re written'"
                :disabled="!currentWritten"
                :busy="busy"
                :detached="work?.detached"
                :cancelling="work?.cancelling"
                :working="editingHere"
                :data-writing="editingHere ? '' : undefined"
                @send="sendAction"
                @cancel="cancel"
              >
                <template #notice>
                  <p
                    v-if="message"
                    class="truncate px-2 text-sm"
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
                </template>
                <PopMenu v-if="!busy && current && currentWritten" align="end" side="above" panel-class="w-80 p-1 text-sm" data-more-menu>
                  <template #button="{ open, toggle }">
                    <button
                      type="button"
                      class="rounded-lg px-2 py-1.5 hover:bg-canvas hover:text-fg"
                      :class="{ 'bg-canvas text-fg': open }"
                      title="More"
                      aria-label="More"
                      data-more
                      @click="toggle"
                    >
                      <Icon name="dots" />
                    </button>
                  </template>
                  <template #default="{ close }">
                    <button
                      type="button"
                      class="menu-row"
                      :disabled="!!current.blocked || copying"
                      :title="current.blocked
                      ? 'Edit this Frame first: it crosses a limit'
                      : `A new Chain of Frames 1 to ${current.index + 1}, with their pictures, to carry on from this Frame by Actions. This Storyboard stays as it is.`"
                      data-continue-chain
                      @click="continueAsChain(current.index); close()"
                    >
                      {{ copying ? 'Making…' : `Chain from ${frameName(current.index)}` }}
                    </button>
                  </template>
                </PopMenu>
              </FloatingBox>
            </template>
          </SessionStage>

          <SessionDrawer
            v-model="drawer"
            :tabs="[
              { id: 'prompt', label: current ? `${frameName(current.index)}'s prompt` : 'Prompt' },
              ...(clipsMenu !== null ? [{ id: 'clip' as const, label: 'Clips' }] : []),
              { id: 'look', label: 'Look' },
            ]"
          >
            <template #prompt>
              <div class="flex flex-col gap-3 p-4 text-sm" data-prompt-panel>
                <template v-if="current">
                  <p v-if="current.timings" class="text-xs text-muted" data-timings>{{ timingsLabel(current) }}</p>
                  <p v-if="currentWritten" class="leading-relaxed" data-prompt-text>{{ current.prompt }}</p>
                  <p v-else class="text-muted">Its prompt is written with its sentences.</p>
                </template>
              </div>
            </template>
            <template #look>
              <div class="p-4 text-sm" data-look-panel>
                <LookForm
                v-if="look"
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
              </div>
            </template>
            <template #clip>
              <div class="flex flex-col gap-2 p-4 text-sm" data-clips-panel>
                <template v-if="current && picture">
                  <p v-if="!ownPicture" class="text-xs text-muted" data-clips-other-model>
                    Clips are made of a picture by {{ labelOf(session.settings.imageModel) }}: render this Frame with it first.
                  </p>
                  <FrameClips
                    v-else
                    :session-id="session.id"
                    :index="current.index"
                    :clips="(pickedEdit(picture) ?? picture).clips"
                    :next-pictured="!!session.frames[current.index + 1] && !!pictureOf(session.frames[current.index + 1])"
                    :next-name="frameName(current.index + 1)"
                    :making="clipsMaking(jobsFor(current.index), picture.imageModel)"
                    :playing="playingClip?.index === current.index ? playingClip.clip.file : undefined"
                    @make="(order) => queueClip(current!.index, order)"
                    @play="(clip) => (playingClip = { index: current!.index, clip })"
                    @stop="playingClip = null"
                  />
                </template>
              </div>
            </template>
          </SessionDrawer>
        </div>
      </template>

      <!-- In place of the text box while the plan isn't all written: write it, or watch it written. -->
      <div
        v-if="writeBar"
        class="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-canvas px-4 py-3 text-sm"
        data-prompt-footer
      >
        <p v-if="message" class="w-full truncate text-sm" :class="message.kind === 'error' ? 'text-danger' : 'text-muted'" :title="message.text" role="alert">
          {{ message.text }}
        </p>
        <p v-if="!busy && !writingStarted" class="min-w-0 flex-1 text-muted" data-review>
          Drag the Beats to reorder; nothing is written or rendered yet.
        </p>
        <div
          v-else-if="work?.kind === 'write'"
          class="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted"
          role="progressbar"
          :aria-valuenow="writtenCount"
          :aria-valuemax="session.frames.length"
          data-write-progress
        >
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div
              class="h-full rounded-full bg-fg transition-[width] duration-500"
              :style="{ width: `${(100 * writtenCount) / session.frames.length}%` }"
            />
          </div>
          <span class="shrink-0">{{ writtenCount }} of {{ session.frames.length }} written</span>
        </div>
        <span v-else class="min-w-0 flex-1" />
        <button
          v-if="!busy"
          type="button"
          class="ml-auto rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
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
          class="ml-auto rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
          :disabled="work?.cancelling"
          data-prompt-cancel
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>
    <AllFrames
      v-if="session"
      v-model:open="allFrames"
      :session-id="session.id"
      :frames="session.frames"
      :tiles="tiles"
      :text="(f) => `${f.beat} ${f.body}`"
      :picked="selected"
      :image-model="session.settings.imageModel"
      :thumbnail="session.thumbnail"
      :name="frameTitle"
      :caption="(f) => f.beat"
      one-style
      @pick="pickFromAll"
      @changed="load(); refreshJobs()"
    />
    <FrameViewer
      v-if="session"
      v-model:open="viewingPicture"
      v-model:painting="paintingPicture"
      :session-id="session.id"
      :frames="session.frames"
      :image-model="session.settings.imageModel"
      :name="frameTitle"
      :jobs="jobs"
      @edit="queueEdit"
      @pick="pickVersion"
      @delete-edit="deleteEdit"
      @delete-upscale="deleteUpscale"
      @drop-job="dropJob"
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
