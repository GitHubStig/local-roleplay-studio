<script setup lang="ts">
import { ask } from '../ask'
import { frameName } from '../frameName'
import { useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { type Activity, type Clip, getSession, imageUrl, type Look, type Made3d, restartSession } from '../api'
import { useSessionScreen } from '../composables/useSessionScreen'
import { useStoredFlag } from '../composables/useStoredFlag'
import { saveLine, useAutosave } from '../composables/useAutosave'
import SaveStatus from '../components/SaveStatus.vue'
import LookForm from '../components/LookForm.vue'
import RestartButton from '../components/RestartButton.vue'
import ComposeBox from '../components/ComposeBox.vue'
import FrameTab from '../components/FrameTab.vue'
import ClipOverlay from '../components/ClipOverlay.vue'
import FoldedPrompt from '../components/FoldedPrompt.vue'
import ShownPills from '../components/ShownPills.vue'
import { clipCount, clipsMaking, scrollToClips, usePlayingClip } from '../clips'
import FrameListItem from '../components/FrameListItem.vue'
import Icon from '../components/Icon.vue'
import ImageModelPicker from '../components/ImageModelPicker.vue'
import TextModelPicker from '../components/TextModelPicker.vue'
import ModelComparison from '../components/ModelComparison.vue'
import { useImageModels } from '../composables/useSettingsOptions'
import UndirectedNote from './UndirectedNote.vue'
import MusicTab from './MusicTab.vue'
import { useMusicPlayer } from './useMusicPlayer'
import { canSpeak, deliveryWords, partKey, useListening } from './useListening'
import { CAST_SECTION_IDS, type CastField, castSectionsOf, isList, LIST_NOUNS } from './castSections'
import CastFieldBox from './CastFieldBox.vue'
import ItemList from '../components/ItemList.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import EditedChip from '../components/EditedChip.vue'
import FrameViewer from '../components/FrameViewer.vue'
import FrameJobs from '../components/FrameJobs.vue'
import JobQueue from '../components/JobQueue.vue'
import PanelTabs from '../components/PanelTabs.vue'
import RenderAllButton from '../components/RenderAllButton.vue'
import { useJobs } from '../composables/useJobs'
import { useJobLink } from '../composables/useJobLink'
import { sessionPath } from '../sessionPath'
import { usePictureEditing } from '../composables/usePictureEditing'
import { useFeatures } from '../composables/useFeatures'
import { isOpen, jobForming, jobStatus, queueTab } from '../jobs'
import { useShownPreview } from '../composables/useShownPreview'
import {
  type Cast,
  type Reply,
  type RoleplayEvent,
  type RoleplaySession,
  type RoleplayFrame,
  beginRoleplay,
  type Job,
  type JobKind,
  saveCast,
  saveLook,
  saveVoice,
  sendMessage,
  suggestMessage,
  undoExchange,
  writeCast,
} from './api'

const props = defineProps<{ id: string }>()

/** Why the last message didn't go through: an error, or a Limit it crossed. */
const notice = ref<{ kind: 'error' | 'declined'; text: string } | null>(null)
const transcript = useTemplateRef<HTMLElement>('transcript')
/** The Frame whose picture is open in the viewer, if any. */
const viewing = ref<number | null>(null)

/** The exchange in progress: the message sent, and the reply as it arrives. */
interface Pending {
  kind: 'cast' | 'begin' | 'message' | 'suggest'
  message?: string
  reply: Partial<Reply>
  thinking?: string
  cancelling?: boolean
  /** Waiting for a render on the Text Model's machine to finish (`queued`), or writing. */
  phase?: Activity
  /** Started elsewhere (another tab); followed by polling. */
  detached?: boolean
}
const pending = ref<Pending | null>(null)
const { session, loadError, draft, busy, leave, cancel, onSwitched, onClipsModel, pictureOf, changed } =
  useSessionScreen(props.id, 'roleplay', {
    work: pending,
    // A new Roleplay has its Cast written.
    begin: (s) => (s.cast ? undefined : rewriteCast()),
    following: (_s, followed): Pending => followed ?? { kind: 'message', reply: {}, detached: true },
    refreshJobs: () => refreshJobs(),
  })
/** The Character is writing into the conversation (not picturing a Frame beside it). */
const replying = computed(() => {
  const kind = pending.value?.kind
  return !!pending.value && !pending.value.detached && (kind === 'message' || kind === 'begin')
})
/** A message is being suggested into the text box. */
const suggesting = computed(() => pending.value?.kind === 'suggest')
/** The Text Model is writing the Cast: the first time, or again on Rewrite Cast. */
const writingCast = computed(() => pending.value?.kind === 'cast')
// --- Background work: pictures, renders, upscales, voices and 3D, queued on the server.

const { jobs, runningJobs, runningJob, runningOn, jobsFor, hasJob, queue, queueEdit, queueClip, queueAll, dropJob, cancelAll, dismissFinished, retry, refreshJobs } = useJobs(
  props.id,
  {
    onSettled: () => reload(),
    onError: (text) => (notice.value = { kind: 'error', text }),
    imageModel: () => session.value?.settings.imageModel,
  },
)
/** A clip's Frame, at its Clip section on the picture it's made from. */
async function openClip(job: Job) {
  await onClipsModel(job, (text) => (notice.value = { kind: 'error', text }))
  goToFrame(job.frameIndex)
  narrowTab.value = 'frame'
  scrollToClips(transcript.value)
}
/** Editing a picture in the viewer (ADR 0021): painting an edit, or watching one being made. */
const { painting: paintingPicture, startEdit, showEdit, pick: pickVersion, deleteEdit, deleteUpscale } =
  usePictureEditing(props.id, session, viewing, (text) => (notice.value = { kind: 'error', text }))
// A job linked to from the queue page opens as this Session's Queue tab opens it.
useJobLink(() => sessionPath(props.id, 'roleplay'), () => !!session.value, jobs, refreshJobs, {
  go: goToFrame,
  edit: showEdit,
  clip: openClip,
  music: goToMusic,
  drop: drop,
})
/**
 * The picture forming, over the picture of the Frame a job renders (one at a time). The Frame is
 * kept once the job ends, while the last preview stays over it until the new picture is in.
 */
const formingIndex = ref<number | null>(null)
const forming = computed(() => jobForming(session.value, runningJob.value))
watch(forming, (now) => {
  if (now) formingIndex.value = runningJob.value!.frameIndex
})
const { byOf, renderedParts } = useImageModels()
/**
 * The Frames Render all would render: those with no picture by the Roleplay's Image Model, or one
 * changed since, unless their Image Prompt crosses a Limit or a render is queued.
 */
const toRender = computed(() =>
  (session.value?.frames ?? []).filter((f) =>
    !f.blocked && (!pictureOf(f) || changed(f)) && !hasJob(f.index, 'render')
  )
)
/**
 * Renders them all. A Frame without its Image Prompt yet (its picture failed, or was cancelled)
 * is pictured first; all the pictures are queued before the renders, so the Text Model is done
 * before the first render unloads it.
 */
async function renderAll() {
  if (!(await flushEdits('rendered'))) return
  const frames = toRender.value.slice()
  await queueAll(
    'picture',
    frames.filter((f) => !f.prompt && !hasJob(f.index, 'picture')).map((f) => f.index),
  )
  await queueAll('render', frames.map((f) => f.index))
}
const shownPreview = useShownPreview(
  () => forming.value,
  () => {
    const frame = session.value?.frames.find((f) => f.index === formingIndex.value)
    return frame && pictureOf(frame)?.image
  },
)
const previewOn = (index: number) => shownPreview.value && formingIndex.value === index

/**
 * New Replies are pictured as they arrive (their Image Prompt written), wherever pictures can be
 * made: on unless switched off. Rendering them too is slower, so it's a switch of its own, off
 * unless switched on, and only with picturing. Both remembered per browser; Write prompt and
 * Render stay for Replies made with them off.
 */
const renderReplies = useStoredFlag('roleplay-render-replies')
/**
 * Cancels a job, and with a picture the render queued behind it, which would only fail without
 * the picture.
 */
async function drop(job: Job) {
  const render = job.kind === 'picture' && job.status !== 'done' &&
    jobs.value.find((j) => j.kind === 'render' && j.frameIndex === job.frameIndex &&
      j.status === 'queued')
  await dropJob(job)
  if (render) await dropJob(render)
}

/**
 * A Frame's jobs; designing the voice and scoring the music with hindsight are the Roleplay's,
 * shown in the Voice panel and on Score the Roleplay instead.
 */
const frameJobs = (index: number) =>
  jobsFor(index).filter((j) => j.kind !== 'voice' && j.kind !== 'score-roleplay')
const voiceJob = computed(() => jobs.value.find((j) => j.kind === 'voice' && j.status !== 'done') ?? null)
/** The voice is being designed, or waits its turn to be. */
const designingVoice = computed(() =>
  voiceJob.value?.status === 'running' || voiceJob.value?.status === 'queued'
)

/** What a Roleplay's own work is doing, where it says more than `jobStatus`. */
function describeJob(job: Job): string | undefined {
  if (job.kind === 'voice' || job.kind === 'speak' || job.kind === 'speak-thought') {
    if (job.phase === 'queued') return 'Waiting for another render…'
    if (job.phase === 'text') return 'Describing the voice…'
    if (job.kind === 'voice' || !session.value?.voice?.ref) return 'Designing the voice…'
    return 'Speaking…'
  }
  if (job.kind === 'score-roleplay' && job.phase !== 'queued') {
    return session.value?.score ? 'Scoring the Roleplay…' : 'Writing the Score, then scoring…'
  }
  if (job.kind === 'direct' && job.phase !== 'queued') {
    return session.value?.score ? 'Directing the music…' : 'Writing the Score, then directing…'
  }
  if (job.kind === 'picture' && job.phase !== 'queued') {
    return currentLook.value ? 'Picturing this moment…' : 'Writing the Look, then picturing…'
  }
}

/** Reloads the Roleplay after background work, without disturbing a reply in progress. */
async function reload() {
  try {
    const loaded = await getSession(props.id)
    if (loaded.kind === 'roleplay') session.value = loaded
  } catch {
    // Picked up on the next change.
  }
}

/** The Frame the Queue tab last jumped to, highlighted for a moment. */
const highlighted = ref<number | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
/** Scrolls the conversation to Frame `index`. */
const scrollToFrame = (index: number) =>
  transcript.value?.querySelector(`[data-frame-index="${index}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
function goToFrame(index: number) {
  pick(index)
  scrollToFrame(index)
  highlighted.value = index
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlighted.value = null), 1600)
}

/** A Frame, with the music's side of it open. */
function goToMusic(index: number) {
  goToFrame(index)
  detail.value = 'music'
}

// --- 3D, by model (experimental): SHARP, TripoSplat and LiTo (PictureButtons).

/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)

// --- Voices: the Character speaks their lines.

/** New Replies are spoken as they arrive; remembered per browser. */
const autoplay = useStoredFlag('roleplay-voice-autoplay')
/** Whether each new Reply's music is directed (Music on), as the Speak replies switch is kept. */
const scoreAsYouPlay = useStoredFlag('roleplay-score-as-you-play')
/** Which extras are on: off, their buttons are hidden, but what they made still plays and opens. */
const { on: featureOn, settings: settingsNow } = useFeatures()
/** Music is being built (docs/design.md): its tab shows only while it's switched on. */
const musicOn = computed(() => !!settingsNow.value?.music)
/** Listening to the Character's lines and thoughts, and to the voice itself (`useListening`). */
const { canListen, spokenNow, playing, stopAudio, play, listen, playWhenSpoken } = useListening({
  sessionId: props.id,
  session,
  jobs,
  hasJob,
  queue: (kind, index) => queue(kind, index),
  voicesOn: () => featureOn.value('voices'),
})

/** The voice description as edited in the side panel. */
const voiceDraft = ref('')
/** The Voice section collapses to its heading and the description, remembered per browser. */
const voiceCollapsed = useStoredFlag('collapsed:roleplay.voice')
// As tall as its text, as the Cast's fields are, so the panel scrolls as one.
useTextareaAutosize({ element: useTemplateRef<HTMLTextAreaElement>('voiceTextarea'), input: voiceDraft })
watch(() => session.value?.voice?.description, (d) => (voiceDraft.value = d ?? ''), { immediate: true })
const voiceChanged = computed(() =>
  !!voiceDraft.value.trim() && voiceDraft.value.trim() !== (session.value?.voice?.description ?? '')
)
/** Saves an edited description, then designs the voice from it. */
async function saveVoiceDraft() {
  notice.value = null
  try {
    session.value = await saveVoice(props.id, voiceDraft.value)
    await queue('voice', 0)
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  }
}


const cast = computed(() => session.value?.cast ?? null)
/** The Frames as shown (the server tidies each Reply as it saves it). */
const shownFrames = computed(() => session.value?.frames ?? [])
/** The Cast is written but the scene hasn't begun: the player reviews it first. */
const reviewing = computed(() => !!cast.value && session.value!.frames.length === 0)
const begun = computed(() => (session.value?.frames.length ?? 0) > 0)

/** Score the Roleplay, the pass with hindsight: queued or running. */
const scoringAll = computed(() => hasJob(0, 'score-roleplay'))
/** Scores the whole Roleplay's music with hindsight, once confirmed if it replaces Cues. */
async function scoreAll() {
  const what = 'Score the whole Roleplay with hindsight? Its Cues, and how each Frame\'s music ' +
    'was directed, are replaced.'
  if (session.value?.cues.length && !(await ask(what, { action: 'Score', danger: true }))) return
  await queueSaved('score-roleplay', 0)
}

/**
 * The selected Frame: the one picked in the Frames list or the conversation, or else the newest,
 * which each new Reply moves on to. Its tab in the side panel has everything about it.
 */
const picked = ref<number | null>(null)
const selectedIndex = computed(() => {
  const frames = session.value?.frames ?? []
  return picked.value !== null && frames[picked.value] ? picked.value : frames.at(-1)?.index ?? null
})
const selectedFrame = computed(() =>
  selectedIndex.value === null ? undefined : session.value?.frames[selectedIndex.value]
)
/**
 * The music: it follows the Frame selected, or else the newest, and lowers while a line is spoken.
 * For the whole page, so a dialog or a tab doesn't touch it.
 */
const music = useMusicPlayer({
  sessionId: props.id,
  session,
  frame: computed(() => selectedFrame.value ?? session.value?.frames.at(-1)),
  speaking: computed(() => playing.value !== null),
})
const hasTracks = computed(() => !!session.value?.cues.some((c) => c.track))
/** A clip playing over its Frame's picture, from the Frame tab's Clip section. */
const playingClip = usePlayingClip(() => selectedIndex.value, () => session.value?.settings.imageModel)
/** Plays a clip over Frame `index`'s picture, scrolled into view: it starts once it's seen. */
function playClip(index: number, clip: Clip) {
  playingClip.value = { index, clip }
  transcript.value?.querySelector(`[data-frame-index="${index}"] [data-picture-image]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/** Picks Frame `index`; the newest, so the selection follows the Replies again. */
function pick(index: number) {
  picked.value = index === session.value?.frames.at(-1)?.index ? null : index
}
/** Picks a Frame from the list, and shows it in the conversation. */
function pickFromList(index: number) {
  pick(index)
  scrollToFrame(index)
}

/**
 * The side panel, as a Chain's: the Frames or the queue beside the detail (the selected Frame, or
 * the Look and Cast); on a narrow window, one of them at a time. Until picked: the Look and Cast
 * while it's reviewed, before the scene begins, and the Frames and the Frame once it has.
 */
const panelPicked = ref<'frames' | 'queue' | 'detail' | null>(null)
const panel = computed(() => panelPicked.value ?? (begun.value ? 'frames' : 'detail'))
const detailPicked = ref<'frame' | 'cast' | 'music' | null>(null)
const detail = computed({
  get: () =>
    (detailPicked.value === 'music' && !musicOn.value ? null : detailPicked.value) ??
      (begun.value ? 'frame' : 'cast'),
  set: (tab) => (detailPicked.value = tab),
})
const listTab = computed({
  get: () => (panel.value === 'queue' ? 'queue' : 'frames'),
  set: (tab: 'frames' | 'queue') => (panelPicked.value = tab),
})
/** A narrow window's one row of tabs: the Frame, the Look and Cast, and the Music are among them. */
const narrowTab = computed({
  get: () => (panel.value === 'detail' ? detail.value : listTab.value),
  set: (tab: 'frames' | 'queue' | 'frame' | 'cast' | 'music') => {
    if (tab === 'frame' || tab === 'cast' || tab === 'music') {
      panelPicked.value = 'detail'
      detail.value = tab
    } else panelPicked.value = tab
  },
})
const characterName = computed(() => cast.value?.character.name ?? 'The Character')
const personaName = computed(() => cast.value?.persona.name ?? 'You')

// --- Streamed work.

/**
 * What this browser's switches ask to follow a Reply, sent with it: its line spoken and its
 * picture rendered. The server queues them as it saves the Reply, after its Image Prompt, which is
 * always written while the Text Model is still loaded (so it can be rendered later, with no reload
 * between renders).
 */
const afterOf = () => ({
  speak: autoplay.value,
  render: renderReplies.value,
  direct: musicOn.value && scoreAsYouPlay.value,
})

/** A new Reply: its line is played once spoken, if autoplay asked for it; its jobs are queued. */
function afterReply(frame: RoleplayFrame) {
  if (autoplay.value && featureOn.value('voices') && canSpeak(frame)) {
    playWhenSpoken(frame.index, 'dialogue')
  }
  refreshJobs()
}

function onEvent(event: RoleplayEvent) {
  const p = pending.value
  if (!p) return
  switch (event.type) {
    case 'phase':
      pending.value = { ...p, phase: event.phase }
      break
    case 'thinking':
      pending.value = { ...p, thinking: (event.restart ? '' : p.thinking ?? '') + event.text }
      break
    case 'reply-part':
      pending.value = { ...p, reply: { ...p.reply, [event.key]: event.value } }
      break
    case 'cast':
      session.value = event.session
      break
    case 'replied':
      session.value = event.session
      // The message was used; a declined or failed one stays in the box to reword.
      if (p.kind === 'message') draft.value = ''
      afterReply(event.frame)
      break
    case 'suggestion-part':
    case 'suggestion':
      draft.value = event.text
      break
    case 'declined':
      notice.value = { kind: 'declined', text: event.message }
      break
    case 'failed':
      if (event.sessionDiscarded) leave({ error: event.message })
      else notice.value = { kind: 'error', text: event.message }
      break
    case 'cancelled':
      if (event.sessionDiscarded) leave()
      break
  }
}

async function run(next: Pending, call: () => Promise<void>) {
  pending.value = next
  notice.value = null
  try {
    await call()
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  } finally {
    pending.value = null
  }
}

/** Writes the Cast again, after saving edits (so they don't come back over the new one). */
async function rewriteCast() {
  if (!(await flushEdits('rewritten'))) return
  await run({ kind: 'cast', reply: {} }, () => writeCast(props.id, onEvent))
}

/** Begins the scene, saving any unsaved edits to the Cast first. */
async function begin() {
  if (busy.value || !(await flushEdits('begun'))) return
  await run({ kind: 'begin', reply: {} }, () => beginRoleplay(props.id, afterOf(), onEvent))
}

async function send() {
  const text = draft.value.trim()
  if (!text || busy.value || !begun.value || !(await flushEdits('sent'))) return
  run({ kind: 'message', message: text, reply: {} }, () => sendMessage(props.id, text, afterOf(), onEvent))
}

/** The last suggestion written into the box, to tell whether it's still there untouched. */
let lastSuggestion: string | null = null

/**
 * Writes a message into the box, from the story and whatever's typed there. A suggestion left as
 * it was isn't taken as notes: pressing Suggest again writes a new one from the story alone. If it
 * fails or is cancelled, the box gets back what was there.
 */
async function suggest() {
  if (busy.value || !begun.value || !(await flushEdits('suggested'))) return
  const typed = draft.value
  const notes = typed.trim() === lastSuggestion ? '' : typed
  let suggested = false
  await run({ kind: 'suggest', reply: {} }, () =>
    suggestMessage(props.id, notes, (event) => {
      if (event.type === 'suggestion') {
        suggested = true
        lastSuggestion = event.text.trim()
      }
      onEvent(event)
    }))
  if (!suggested) draft.value = typed
}

/** The latest exchange can be undone (never the opening): its message goes back in the box. */
const canUndo = computed(() => !busy.value && (session.value?.frames.at(-1)?.message ?? null) !== null)
async function undo() {
  const latest = session.value?.frames.at(-1)
  if (!canUndo.value || !latest) return
  try {
    session.value = await undoExchange(props.id, latest.index)
    if (!draft.value.trim()) draft.value = latest.message ?? ''
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  }
}

/** Back to the Cast, once confirmed: every exchange goes, the opening too; the Cast, Look and voice stay. */
async function restart() {
  if (busy.value) return
  const what =
    'Restart this Roleplay? Every exchange is deleted, the opening too, with its pictures and ' +
    "spoken lines; the Cast, Look and voice stay, to edit before beginning again. This can't be undone."
  if (!(await ask(what, { action: 'Restart', danger: true }))) return
  notice.value = null
  try {
    session.value = await restartSession<RoleplaySession>(props.id)
    refreshJobs()
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  }
}

// Keep the newest exchange in view as the conversation grows (not while picturing a Frame).
watch([
  () => session.value?.frames.length,
  () => (replying.value ? pending.value!.reply : null),
  () => (replying.value ? pending.value!.message : null),
], async () => {
  await nextTick()
  // Jump on opening; glide while a reply comes in.
  transcript.value?.scrollTo({
    top: transcript.value.scrollHeight,
    behavior: pending.value ? 'smooth' : 'auto',
  })
})

/**
 * Pictures load after the conversation has scrolled to its end, pushing the end out of view. Until
 * the player scrolls away from the end, keep it there as each picture loads.
 */
let atEnd = true
function onTranscriptScroll() {
  const list = transcript.value!
  atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40
}
function onPictureLoad() {
  const list = transcript.value
  if (list && atEnd) list.scrollTo({ top: list.scrollHeight, behavior: 'auto' })
}

const statusLabel = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.cancelling) return 'Cancelling…'
  if (p.detached) return 'A reply is being written in another tab…'
  if (p.phase === 'queued') return 'Waiting for another render…'
  if (p.kind === 'cast') return cast.value ? 'Rewriting the Cast…' : 'Writing the Cast…'
  if (p.kind === 'begin') return `${characterName.value} is starting the scene…`
  if (p.kind === 'suggest') return `Suggesting ${personaName.value}'s message…`
  return `${characterName.value} is replying…`
})

// --- The Cast, editable by hand.

/** The Cast's sections as edited: a group each in review, then how it started and what still steers. */
const castSections = computed(() =>
  castSectionsOf(castDraft.value, begun.value, {
    character: characterName.value,
    persona: personaName.value,
  })
)
/** The whole Cast collapses to its heading, as the Look and Voice do. */
const castCollapsed = useStoredFlag('collapsed:roleplay.cast')
/**
 * Each section collapses to its title and a preview (shown only while collapsed: open, its boxes say
 * it), remembered per browser; At the start begins collapsed.
 */
const sectionCollapsed = Object.fromEntries(
  CAST_SECTION_IDS.map((id) => [
    id,
    useStoredFlag(`collapsed:roleplay.cast.${id}`, id === 'start'),
  ]),
)

/**
 * Hand edits, saved as the focus leaves their panel (`useAutosave`), in one line: the Look and
 * the Cast.
 */
const line = saveLine()
const lookForm = useTemplateRef<InstanceType<typeof LookForm>>('lookForm')
const musicTab = useTemplateRef<InstanceType<typeof MusicTab>>('musicTab')
const {
  draft: castDraft,
  status: castStatus,
  canRevert: castCanRevert,
  flush: flushCast,
  revert: revertCast,
  onFocusout: onCastFocusout,
} = useAutosave<Cast>({
  source: () => cast.value,
  async save(draft) {
    session.value = await saveCast(props.id, draft)
    return session.value.cast!
  },
  line,
})

/** Saves what's edited by hand, before work that reads it; false, saying why, if it can't. */
async function flushEdits(what: string): Promise<boolean> {
  if (
    (await (lookForm.value?.flush() ?? true)) && (await flushCast()) &&
    (await (musicTab.value?.flush() ?? true))
  ) return true
  notice.value = { kind: 'error', text: `Not ${what}: an edit isn't saved (see Look & Cast)` }
  return false
}
async function queueSaved(kind: JobKind, index: number) {
  if (await flushEdits('queued')) queue(kind, index)
}

const fieldValue = (f: CastField) =>
  String((castDraft.value![f.group] as unknown as Record<string, unknown>)[f.key] ?? '')
function setField(f: CastField, value: string) {
  const group = castDraft.value![f.group] as unknown as Record<string, unknown>
  group[f.key] = f.key === 'age' ? Number(value) : value
}

// --- The Look, editable by hand once written.

/** The Look to edit; one from before it listed Subjects isn't shown, since the next picture replaces it. */
const currentLook = computed(() => {
  const look = session.value?.look
  return look && Array.isArray(look.subjects) ? look : null
})

/** "Kael, Elara Vance and the barkeep", "no one": who a picture shows. */
async function saveLookDraft(draft: Look): Promise<Look> {
  session.value = await saveLook(props.id, draft)
  return session.value.look!
}
/** A Look saved while a picture renders waits for it, so the renders queued behind it have it. */
const lookSavingText = computed(() =>
  runningJobs.value.some((j) => j.kind === 'render')
    ? 'Saving once the picture rendering is done…'
    : undefined
)
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Roleplay: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p class="min-w-0 flex-1 basis-40 truncate text-muted" role="status">
            <span v-if="busy" class="animate-pulse">{{ statusLabel }}</span>
            <template v-else-if="cast">
              {{ characterName }} and {{ personaName }} · {{ cast.setting.place }}
            </template>
          </p>
          <div class="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-1">
            <label
              v-if="musicOn"
              class="flex cursor-pointer items-center gap-1.5 text-muted"
              title="Direct each new reply's music: whether it continues, changes or falls silent"
            >
              <input v-model="scoreAsYouPlay" type="checkbox" data-score-as-you-play />
              Score as you play
            </label>
            <span v-if="musicOn && hasTracks" class="flex items-center gap-1.5 text-muted" data-music-player>
              <button
                type="button"
                class="action flex items-center gap-1"
                :class="{ 'action-on': music.on.value }"
                :aria-pressed="music.on.value"
                :data-music-file="music.on.value ? music.target.value?.file ?? undefined : undefined"
                :title="music.on.value ? 'Turn the music off' : 'Play the music of the Frame you\'re on'"
                data-music-toggle
                @click="music.on.value = !music.on.value"
              >
                <Icon :name="music.on.value ? 'music' : 'music-off'" />
                <span class="sr-only">{{ music.on.value ? 'Music on' : 'Music off' }}</span>
              </button>
              <input
                v-model.number="music.volume.value"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-16"
                aria-label="Music volume"
                data-music-volume
              />
            </span>
            <label
              v-if="featureOn('voices')"
              class="flex cursor-pointer items-center gap-1.5 text-muted"
              :title="`Speak each new reply in ${characterName}'s voice`"
            >
              <input v-model="autoplay" type="checkbox" data-autoplay />
              Speak replies
            </label>
            <TextModelPicker
              :session="session"
              @switched="onSwitched"
              @failed="(text) => (notice = { kind: 'error', text })"
            />
            <template v-if="featureOn('images')">
              <ImageModelPicker
                :session="session"
                @switched="onSwitched"
                @failed="(text) => (notice = { kind: 'error', text })"
              />
              <ModelComparison
                :session-id="session.id"
                :frames="session.frames"
                :image-model="session.settings.imageModel"
                :thumbnail="session.thumbnail"
                :caption="(f) => f.reply.actions"
                @changed="reload(); refreshJobs()"
                one-style
              />
              <label
                class="flex cursor-pointer items-center gap-1.5 text-muted"
                title="Render each new reply's picture as its Image Prompt is written (slower)"
              >
                <input v-model="renderReplies" type="checkbox" data-render-replies />
                Render replies
              </label>
            </template>
          </div>
        </div>

        <ol
          ref="transcript"
          @scroll.passive="onTranscriptScroll"
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface p-4"
          data-transcript
        >
          <template v-for="frame in shownFrames" :key="frame.index">
            <li v-if="frame.message !== null" class="flex flex-col items-end gap-1" data-message>
              <span class="text-xs text-muted">{{ personaName }}</span>
              <p class="max-w-prose whitespace-pre-wrap rounded-lg bg-fg px-3 py-2 text-canvas">
                {{ frame.message }}
              </p>
            </li>
            <li
              class="-mx-2 rounded-lg p-2 transition-shadow duration-500"
              :class="{
                'render-sweep': runningOn(frame.index) && runningOn(frame.index)!.kind !== 'voice',
                'ring-2 ring-info': highlighted === frame.index,
                'bg-canvas ring-1 ring-line': selectedIndex === frame.index && highlighted !== frame.index,
              }"
              :aria-current="selectedIndex === frame.index"
              @click="pick(frame.index)"
              :data-rendering="runningOn(frame.index)?.phase === 'queued'
              ? 'queued'
              : undefined"
              :data-frame-index="frame.index"
              data-reply
            >
              <!-- Text on the left, its picture beside it on wide windows (stacked on narrow ones):
                   three fifths of the row, between its old size and double it. -->
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span class="text-xs text-muted">{{ characterName }}</span>
                  <p
                    v-if="frame.reply.internal"
                    class="max-w-prose text-sm italic text-muted"
                    data-internal
                  >
                    {{ frame.reply.internal }}
                    <button
                      v-if="canSpeak(frame, 'thought') && canListen(frame.thoughtSpeech)"
                      type="button"
                      class="ml-1 inline-flex align-[-0.1em] text-muted not-italic hover:text-fg disabled:opacity-50"
                      :class="{ 'text-info': playing === partKey(frame.index, 'thought') }"
                      :disabled="hasJob(frame.index, 'speak-thought')"
                      :aria-label="playing === partKey(frame.index, 'thought') ? 'Stop' : 'Listen'"
                      :title="frame.thoughtSpeech && !spokenNow(frame.thoughtSpeech)
                        ? 'Spoken in an earlier voice: Listen speaks it again'
                        : `Hear ${characterName} think it, whispered`"
                      data-listen-thought
                      @click.stop="listen(frame.index, 'thought')"
                    >
                      <Icon :name="playing === partKey(frame.index, 'thought') ? 'stop' : 'speaker'" />
                    </button>
                    <UndirectedNote
                      v-if="spokenNow(frame.thoughtSpeech) && frame.thoughtSpeech?.undirected"
                      class="ml-1.5 not-italic"
                      :reason="frame.thoughtSpeech.undirected"
                      :busy="hasJob(frame.index, 'speak-thought')"
                      @again="queue('speak-thought', frame.index)"
                    />
                  </p>
                  <p v-if="frame.reply.actions" class="max-w-prose italic" data-actions>
                    {{ frame.reply.actions }}
                  </p>
                  <p
                    v-if="frame.reply.dialogue"
                    class="max-w-prose text-lg"
                    data-dialogue
                  >
                    “{{ frame.reply.dialogue }}”
                    <button
                      v-if="canSpeak(frame) && canListen(frame.speech)"
                      type="button"
                      class="ml-1 inline-flex align-[-0.1em] text-muted not-italic hover:text-fg disabled:opacity-50"
                      :class="{ 'text-info': playing === partKey(frame.index, 'dialogue') }"
                      :disabled="hasJob(frame.index, 'speak')"
                      :aria-label="playing === partKey(frame.index, 'dialogue') ? 'Stop' : 'Listen'"
                      :title="frame.speech && !spokenNow(frame.speech)
                        ? 'Spoken in an earlier voice: Listen speaks it again'
                        : `Hear ${characterName} say it`"
                      data-listen
                      @click.stop="listen(frame.index)"
                    >
                      <Icon :name="playing === partKey(frame.index, 'dialogue') ? 'stop' : 'speaker'" />
                    </button>
                    <span
                      v-if="spokenNow(frame.speech) && deliveryWords(frame.speech)"
                      class="ml-1 text-xs text-muted"
                      data-delivery
                    >· {{ deliveryWords(frame.speech) }}</span>
                    <UndirectedNote
                      v-if="spokenNow(frame.speech) && frame.speech?.undirected"
                      class="ml-1.5 text-xs"
                      :reason="frame.speech.undirected"
                      :busy="hasJob(frame.index, 'speak')"
                      @again="queue('speak', frame.index)"
                    />
                  </p>
                </div>
                <button
                  v-if="pictureOf(frame) || previewOn(frame.index)"
                  type="button"
                  class="relative block w-full max-w-2xl shrink-0 lg:w-3/5 lg:min-w-72 lg:max-w-[40rem] xl:min-w-80"
                  title="Look closer"
                  data-picture-image
                  @click="pictureOf(frame) && (viewing = frame.index)"
                >
                  <img
                    v-if="pictureOf(frame)"
                    :src="imageUrl(session.id, pictureOf(frame)!.image)"
                    :alt="`Picture of ${frameName(frame.index)}`"
                    class="w-full rounded-md"
                    :class="{ 'opacity-50': changed(frame) }"
                    @load="onPictureLoad"
                  />
                  <!-- The picture forming: over the old one, or alone for a first render. -->
                  <img
                    v-if="previewOn(frame.index)"
                    :src="shownPreview!.src"
                    alt=""
                    class="w-full rounded-md transition-opacity duration-500"
                    :class="{ 'absolute inset-0 h-full object-cover': pictureOf(frame) }"
                    :style="{ opacity: pictureOf(frame) ? shownPreview!.opacity : 1 }"
                    data-preview
                  />
                  <span
                    v-if="changed(frame)"
                    class="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-white"
                  >Changed since render · {{ byOf(pictureOf(frame)!) }}</span>
                  <EditedChip :picture="pictureOf(frame)" class="absolute right-2 top-2" />
                  <ClipOverlay
                    v-if="playingClip && playingClip.index === frame.index"
                    :src="imageUrl(session.id, playingClip.clip.file)"
                    :clip="playingClip.clip"
                    @close="playingClip = null"
                    @click.stop
                  />
                </button>
              </div>
            </li>
          </template>

          <!-- The Cast is written: review it, then begin. -->
          <li v-if="reviewing && !busy" class="m-auto flex max-w-md flex-col items-center gap-3 text-center" data-review>
            <p class="text-muted">
              Review the Cast on the right: who {{ characterName }} is, who you play, and where it
              starts. Edit anything you like, then begin; {{ characterName }} speaks first.
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
                data-begin
                @click="begin"
              >
                Begin
              </button>
              <button
                type="button"
                class="rounded-lg border border-line px-3 py-2 text-sm"
                title="Write a new Cast from the Brief"
                data-rewrite
                @click="rewriteCast"
              >
                Rewrite Cast
              </button>
            </div>
          </li>

          <!-- The exchange in progress. -->
          <template v-if="pending && replying">
            <li v-if="pending.message" class="flex flex-col items-end gap-1" data-pending-message>
              <span class="text-xs text-muted">{{ personaName }}</span>
              <p class="max-w-prose whitespace-pre-wrap rounded-lg bg-fg/80 px-3 py-2 text-canvas">
                {{ pending.message }}
              </p>
            </li>
            <li class="flex flex-col gap-1.5 opacity-80" data-pending-reply>
              <span class="text-xs text-muted">{{ characterName }}</span>
              <p v-if="pending.reply.internal" class="max-w-prose text-sm italic text-muted">
                {{ pending.reply.internal }}
              </p>
              <p v-if="pending.reply.actions" class="max-w-prose italic">{{ pending.reply.actions }}</p>
              <p v-if="pending.reply.dialogue" class="max-w-prose text-lg">“{{ pending.reply.dialogue }}”</p>
              <p
                v-if="!pending.reply.actions && !pending.reply.dialogue"
                class="max-w-prose whitespace-pre-wrap text-sm text-muted"
              >
                <span class="animate-pulse">…</span>
                <template v-if="pending.thinking"> {{ pending.thinking }}</template>
              </p>
            </li>
          </template>
        </ol>

        <div class="flex shrink-0 flex-col gap-2">
          <div
            class="flex rounded-lg"
            :class="{ 'render-sweep': (replying || suggesting) && !pending?.cancelling }"
            :data-writing="replying ? '' : undefined"
            :data-suggesting="suggesting ? '' : undefined"
          >
            <ComposeBox
              v-model="draft"
              :placeholder="`What ${personaName} says or does… (Enter to send, Shift+Enter for a new line)`"
              :disabled="!begun || busy"
              @send="send"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!busy"
              type="button"
              class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
              :disabled="!draft.trim() || !begun"
              @click="send"
            >
              Send
            </button>
            <button
              v-if="!busy"
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!begun"
              :title="draft.trim()
                ? `Write ${personaName}'s message out from what you've typed`
                : `Suggest what ${personaName} might say or do next`"
              data-suggest
              @click="suggest"
            >
              Suggest
            </button>
            <button
              v-else-if="!pending?.detached"
              type="button"
              class="rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
              :disabled="pending?.cancelling"
              @click="cancel"
            >
              Cancel
            </button>
            <RenderAllButton
              v-if="featureOn('images') && begun"
              :count="toRender.length"
              title="Queue a render of every Frame not rendered yet by this Image Model, or changed since"
              @render="renderAll"
            />
            <button
              v-if="musicOn && begun"
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="scoringAll"
              title="Score every Frame's music again with hindsight, as a film is scored once it's cut: its Cues are replaced"
              data-score-all
              @click="scoreAll"
            >
              {{ scoringAll ? 'Scoring…' : 'Score the Roleplay' }}
            </button>
            <p
              class="min-w-0 flex-1 truncate text-sm"
              :class="notice?.kind === 'declined' ? 'text-warn' : 'text-danger'"
              :title="notice?.text"
              role="alert"
            >
              {{ notice?.text }}
            </p>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!canUndo"
              title="Undo the latest exchange and put your message back in the box"
              @click="undo"
            >
              Undo
            </button>
          </div>
        </div>
      </main>

      <aside class="flex w-80 flex-col border-l border-line xl:w-auto xl:flex-row" data-side-panel>
        <!-- Narrow windows: one panel at a time. From xl up: the detail beside the others. -->
        <div class="xl:hidden">
          <PanelTabs
            v-model="narrowTab"
            :tabs="[
              { id: 'frames', label: 'Frames' },
              { id: 'queue', ...queueTab(jobs) },
              { id: 'frame', label: 'Frame' },
              { id: 'cast', label: 'Look & Cast' },
              ...(musicOn ? [{ id: 'music' as const, label: 'Music' }] : []),
            ]"
          />
        </div>

        <section
          class="min-h-0 flex-1 flex-col xl:w-72 xl:flex-none xl:border-r xl:border-line"
          :class="panel === 'detail' ? 'hidden xl:flex' : 'flex'"
          data-list-panel
        >
          <div class="hidden xl:block">
            <PanelTabs
              v-model="listTab"
              :tabs="[{ id: 'frames', label: 'Frames' }, { id: 'queue', ...queueTab(jobs) }]"
            />
          </div>
          <!-- The queue: what's running, queued and failed; click one to go to its Frame. -->
          <section v-if="listTab === 'queue'" class="min-h-0 flex-1 overflow-y-auto" data-queue>
            <JobQueue
              :jobs="jobs"
              empty="Nothing queued. Picture, Render and Upscale in a Frame's tab add work here, to run while you carry on."
              :describe="describeJob"
              @go="goToFrame"
              @music="goToMusic"
              @clip="openClip"
              @edit="showEdit"
              @retry="retry"
              @drop="drop"
              @cancel-all="cancelAll"
              @dismiss-finished="dismissFinished"
            />
          </section>

          <ol v-else class="min-h-0 flex-1 overflow-y-auto" data-frames-list>
            <li v-for="frame in shownFrames" :key="frame.index">
              <FrameListItem
                :thumb="pictureOf(frame) && imageUrl(session.id, pictureOf(frame)!.image)"
                :number="frame.index + 1"
                :current="selectedIndex === frame.index"
                :dimmed="changed(frame)"
                :clips="clipCount(pictureOf(frame), session.settings.imageModel)"
                data-frame
                @click="pickFromList(frame.index)"
              >
                <span class="line-clamp-2 font-medium">{{ frame.message ?? 'Opening' }}</span>
                <span class="line-clamp-3 text-muted">{{ frame.reply.actions }}</span>
              </FrameListItem>
            </li>
          </ol>
        </section>

        <section
          class="min-h-0 flex-1 flex-col xl:w-[28rem] xl:flex-none"
          :class="panel === 'detail' ? 'flex' : 'hidden xl:flex'"
          data-detail-panel
        >
          <div class="hidden xl:block">
            <PanelTabs
              v-model="detail"
              :tabs="[
                { id: 'frame', label: selectedFrame ? frameName(selectedFrame.index) : 'Frame' },
                { id: 'cast', label: 'Look & Cast' },
                ...(musicOn ? [{ id: 'music' as const, label: 'Music' }] : []),
              ]"
            />
          </div>
          <div v-show="detail === 'frame'" class="min-h-0 flex-1 overflow-y-auto p-4 text-sm" data-frame-panel>
            <FrameTab
              v-if="selectedFrame"
              :picture="pictureOf(selectedFrame)"
              :has-job="(kind) => hasJob(selectedFrame!.index, kind)"
              :can-render="(!!selectedFrame.prompt && !selectedFrame.blocked) || hasJob(selectedFrame.index, 'picture')"
              @queue="(kind) => queueSaved(kind, selectedFrame!.index)"
              @view="(kind) => (open3d = { index: selectedFrame!.index, kind })"
              @edit="startEdit(selectedFrame!.index)"
              :clips="{
                sessionId: session.id,
                index: selectedFrame.index,
                nextPictured: !!session.frames[selectedFrame.index + 1] && !!pictureOf(session.frames[selectedFrame.index + 1]),
                nextName: frameName(selectedFrame.index + 1),
                imageModel: session.settings.imageModel,
                making: clipsMaking(jobsFor(selectedFrame.index), pictureOf(selectedFrame)?.imageModel),
                playing: playingClip?.index === selectedFrame.index ? playingClip.clip.file : undefined,
              }"
              @clip="(order) => queueClip(selectedFrame!.index, order)"
              @play="(clip) => playClip(selectedFrame!.index, clip)"
              @stop="playingClip = null"
            >
              <div class="flex flex-col gap-2">
                <h3 class="text-base font-semibold">{{ frameName(selectedFrame.index) }}</h3>
                <!-- Under the heading, as on a Chain's and a Storyboard's, whether the prompt is folded. -->
                <p class="text-xs text-muted" data-reply-timings>
                  Replied in {{ selectedFrame.timings.text.toFixed(1) }} s by {{ selectedFrame.textModel }}
                </p>
                <p v-if="selectedFrame.prompt && selectedFrame.pictureTimings" class="text-xs text-muted" data-picture-timings>
                  Pictured in {{ selectedFrame.pictureTimings.text.toFixed(1) }} s<template
                    v-if="selectedFrame.pictureModel"
                  > by {{ selectedFrame.pictureModel }}</template>
                </p>
                <p v-if="pictureOf(selectedFrame)" class="text-xs text-muted" data-render-timings>
                  Rendered: {{ renderedParts(pictureOf(selectedFrame)!).join(' · ') }}
                </p>
                <ShownPills
                  v-if="selectedFrame.prompt"
                  :names="selectedFrame.shown ?? []"
                  :shown="selectedFrame.shown ?? []"
                />
                <FrameJobs
                  :jobs="frameJobs(selectedFrame.index)"
                  :describe="describeJob"
                  @retry="retry"
                  @drop="drop"
                />
                <FoldedPrompt :preview="selectedFrame.prompt">
                  <template v-if="selectedFrame.blocked" #note>
                    <span class="shrink-0 text-warn">· crosses a limit ({{ selectedFrame.blocked }})</span>
                  </template>
                  <template #actions>
                      <button
                        type="button"
                        class="action"
                        :disabled="hasJob(selectedFrame.index, 'picture')"
                        data-picture-button
                        @click="queueSaved('picture', selectedFrame.index)"
                      >
                        {{ selectedFrame.prompt ? 'Write again' : 'Write prompt' }}
                      </button>
                  </template>
                  <template v-if="selectedFrame.prompt">
                    <p class="leading-relaxed">{{ selectedFrame.prompt }}</p>
                    <details v-if="selectedFrame.pictureThinking" class="text-xs text-muted">
                      <summary class="cursor-pointer select-none">Reasoning</summary>
                      <p class="mt-1 whitespace-pre-wrap leading-relaxed">{{ selectedFrame.pictureThinking }}</p>
                    </details>
                  </template>
                  <p v-else class="text-xs text-muted">
                    Not pictured yet: Write prompt has the Art Agent write its Image Prompt.
                  </p>
                </FoldedPrompt>
              </div>
            </FrameTab>
            <p v-else class="text-muted">The Frames appear once the scene begins.</p>
          </div>
        <div v-show="detail === 'cast'" class="min-h-0 flex-1 overflow-y-auto" data-cast-panel>
        <!-- Its border sweeps while the Cast is written, or written again. -->
        <section
          class="rounded-md border-b border-line p-4 text-sm"
          :class="{ 'render-sweep': writingCast }"
          data-cast
        >
        <details
          class="group/castsection"
          :open="!castCollapsed"
          data-collapsible="roleplay.cast"
          @toggle="castCollapsed = !($event.target as HTMLDetailsElement).open"
        >
        <summary class="flex cursor-pointer select-none items-baseline gap-1.5 hover:text-fg">
          <span class="shrink-0 text-muted transition-transform group-open/castsection:rotate-90">›</span>
          <h2 class="shrink-0 text-base font-semibold">Cast</h2>
          <span class="min-w-0 truncate text-muted">· for {{ characterName }}'s replies</span>
          <RestartButton
            v-if="begun && castDraft"
            :disabled="busy"
            title="Begin the scene again: every exchange is deleted, the opening too, and the Cast, Look and voice stay"
            @restart="restart"
          />
        </summary>
        <p v-if="!castDraft" class="mt-3 text-muted">
          <span v-if="busy" class="animate-pulse">Writing the Cast from your Brief…</span>
          <template v-else>No Cast yet.</template>
        </p>
        <form
          v-else
          class="mt-3 flex flex-col gap-3"
          data-cast-form
          @submit.prevent="flushCast"
          @focusout="onCastFocusout"
        >
          <!-- min-w-0: a fieldset is otherwise as wide as its widest unwrappable line, which a
               collapsed field's one-line preview is -->
          <details
            v-for="sec in castSections"
            :key="sec.id"
            class="group/cast min-w-0"
            :open="!sectionCollapsed[sec.id].value"
            :data-collapsible="`roleplay.cast.${sec.id}`"
            :data-cast-start="sec.locked || undefined"
            @toggle="sectionCollapsed[sec.id].value = !($event.target as HTMLDetailsElement).open"
          >
            <summary class="mb-1 flex cursor-pointer select-none items-baseline gap-1.5 hover:text-fg">
              <span class="shrink-0 text-muted transition-transform group-open/cast:rotate-90">›</span>
              <h3 class="shrink-0 font-medium">{{ sec.title }}</h3>
              <span v-if="sectionCollapsed[sec.id].value" class="min-w-0 truncate text-muted">· {{ sec.preview }}</span>
            </summary>
            <template v-for="(part, i) in sec.parts" :key="i">
              <details
                v-if="part.id"
                class="group/part mb-2 min-w-0"
                :open="!sectionCollapsed[part.id].value"
                :data-collapsible="`roleplay.cast.${part.id}`"
                @toggle="sectionCollapsed[part.id!].value = !($event.target as HTMLDetailsElement).open"
              >
                <summary class="mb-1 flex cursor-pointer select-none items-baseline gap-1.5 text-xs hover:text-fg">
                  <span class="shrink-0 text-muted transition-transform group-open/part:rotate-90">›</span>
                  <h4 class="shrink-0 font-medium">{{ part.title }}</h4>
                  <span v-if="sectionCollapsed[part.id].value" class="min-w-0 truncate text-muted">· {{ part.preview }}</span>
                </summary>
                <fieldset class="flex min-w-0 flex-col gap-2">
                  <CastFieldBox
                    v-for="f in part.fields"
                    :id="`${f.group}.${f.key}`"
                    :key="f.key"
                    :label="f.label"
                    :long="f.long"
                    :value="fieldValue(f)"
                    :disabled="busy || sec.locked"
                    always-open
                    @input="setField(f, $event)"
                  />
                </fieldset>
              </details>
              <fieldset v-else class="mb-3 flex min-w-0 flex-col gap-2">
                <template v-for="f in part.fields" :key="f.key">
                  <!-- A blank box stays as added; the server drops it once saved. -->
                  <ItemList
                    v-if="isList(f.group)"
                    :model-value="castDraft![f.group] ?? []"
                    :label="f.label"
                    :noun="LIST_NOUNS[f.group]"
                    :disabled="busy"
                    :data-cast-list="f.group"
                    @update:model-value="castDraft![f.group] = $event"
                    @removed="flushCast"
                  />
                  <CastFieldBox
                    v-else
                    :id="`${f.group}.${f.key}`"
                    :label="f.label"
                    :long="f.long"
                    :value="fieldValue(f)"
                    :disabled="busy || sec.locked"
                    @input="setField(f, $event)"
                  />
                </template>
              </fieldset>
            </template>
          </details>
          <SaveStatus
            :status="castStatus"
            :can-revert="castCanRevert"
            :disabled="busy"
            :saved-text="begun ? 'applies from the next reply' : undefined"
            @revert="revertCast"
          />
        </form>
        </details>
        </section>
        <LookForm
          v-if="currentLook"
          ref="lookForm"
          class="border-b border-line p-4 text-sm"
          :look="currentLook"
          :save="saveLookDraft"
          :line="line"
          id-prefix="roleplay.look"
          every="for every picture"
          :kept="[characterName, personaName]"
          :disabled="busy"
          :saving-text="lookSavingText"
        />
        <!-- Its border sweeps while the voice is designed, slower while that waits its turn. -->
        <form
          v-if="cast && featureOn('voices')"
          class="flex flex-col gap-2 border-b border-line p-4 text-sm"
          :class="{ 'render-sweep': designingVoice }"
          :data-rendering="voiceJob?.status === 'queued' ? 'queued' : undefined"
          data-voice
          @submit.prevent="saveVoiceDraft"
        >
          <details
            class="group/voice min-w-0"
            :open="!voiceCollapsed"
            data-collapsible="roleplay.voice"
            @toggle="voiceCollapsed = !($event.target as HTMLDetailsElement).open"
          >
          <summary class="flex cursor-pointer select-none items-baseline gap-1.5 hover:text-fg">
            <span class="shrink-0 text-muted transition-transform group-open/voice:rotate-90">›</span>
            <h2 class="shrink-0 text-base font-semibold">Voice</h2>
            <span class="min-w-0 truncate text-muted">
              · {{ voiceCollapsed && voiceDraft.trim() ? voiceDraft : `how ${characterName} sounds aloud` }}
            </span>
          </summary>
          <div class="mt-3 flex flex-col gap-2">
          <!-- The section's only field, so it doesn't collapse on its own as the Cast's do. -->
          <textarea
            ref="voiceTextarea"
            v-model="voiceDraft"
            rows="1"
            aria-label="Voice description"
            class="w-full resize-none overflow-hidden rounded border border-line bg-surface p-2 text-sm text-fg"
            :placeholder="`Described from the Cast the first time ${characterName} speaks, or describe it yourself: age, pitch, texture, manner.`"
            :disabled="!!voiceJob && voiceJob.status !== 'failed'"
            data-field="voice.description"
          />
          <p v-if="voiceJob" class="flex items-center gap-2 text-xs" data-voice-job>
            <span
              :class="{
                'animate-pulse text-info': voiceJob.status === 'running',
                'text-muted': voiceJob.status === 'queued',
                'text-danger': voiceJob.status === 'failed',
              }"
            >{{ jobStatus(voiceJob, describeJob) }}</span>
            <button
              type="button"
              class="text-danger underline-offset-2 hover:underline"
              @click="drop(voiceJob)"
            >
              {{ voiceJob.status === 'failed' ? 'Dismiss' : 'Cancel' }}
            </button>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="voiceChanged"
              type="submit"
              class="rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
              :disabled="!!voiceJob && voiceJob.status !== 'failed'"
            >
              Save and design
            </button>
            <button
              v-if="session.voice?.ref"
              type="button"
              class="rounded border border-line px-3 py-1 text-xs"
              :class="{ 'text-info': playing === 'voice' }"
              data-play-voice
              @click="playing === 'voice' ? stopAudio() : play(session.voice.ref, 'voice')"
            >
              {{ playing === 'voice' ? 'Stop' : 'Play voice' }}
            </button>
            <button
              v-if="!voiceChanged"
              type="button"
              class="rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
              :disabled="!!voiceJob && voiceJob.status !== 'failed'"
              :title="session.voice?.ref
                ? 'Design the voice again from this description: lines already spoken keep the old one'
                : 'Design the voice now'"
              data-new-take
              @click="queue('voice', 0)"
            >
              {{ session.voice?.ref ? 'New take' : 'Design voice' }}
            </button>
          </div>
          </div>
          </details>
        </form>
        </div>
        <div v-if="musicOn" v-show="detail === 'music'" class="min-h-0 flex-1 overflow-y-auto" data-music-panel>
          <MusicTab
            ref="musicTab"
            :session="session"
            :line="line"
            :disabled="busy"
            :frame="selectedFrame ?? null"
            :directing="!!selectedFrame && hasJob(selectedFrame.index, 'direct')"
            :track-position="music.position.value"
            :making-music="jobs.filter((j) => (j.kind === 'music' || j.kind === 'steer') && isOpen(j)).map((j) => j.frameIndex)"
            @saved="(s) => (session = s)"
            @direct="(index) => queueSaved('direct', index)"
            @take="(index) => queueSaved('music', index)"
            @steered="(index) => queueSaved('steer', index)"
            @go="goToMusic"
          />
        </div>
        </section>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>

    <FrameViewer
      v-if="session"
      v-model:open="viewing"
      v-model:painting="paintingPicture"
      :session-id="session.id"
      :frames="session.frames"
      :image-model="session.settings.imageModel"
      :jobs="jobs"
      @step="goToFrame"
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
    />
  </div>
</template>
