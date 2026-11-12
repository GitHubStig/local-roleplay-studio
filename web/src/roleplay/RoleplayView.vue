<script setup lang="ts">
import { ask } from '../ask'
import { frameName, framesName } from '../frameName'
import { useDrawer } from '../composables/useDrawer'
import { useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { type Activity, chainFromFrame, type Clip, getSession, imageUrl, type Look, type Made3d, pickedEdit, restartSession } from '../api'
import { useSessionScreen } from '../composables/useSessionScreen'
import { useStoredFlag } from '../composables/useStoredFlag'
import { saveLine, useAutosave } from '../composables/useAutosave'
import SaveStatus from '../components/SaveStatus.vue'
import LookForm from '../components/LookForm.vue'
import RestartButton from '../components/RestartButton.vue'
import PutBackOffer from '../components/PutBackOffer.vue'
import { usePutBack } from '../composables/usePutBack'
import FoldedPrompt from '../components/FoldedPrompt.vue'
import ShownPills from '../components/ShownPills.vue'
import { clipCount, clipsMaking, usePlayingClip } from '../clips'
import FrameClips from '../components/FrameClips.vue'
import FrameStrip, { type StripTile } from '../components/FrameStrip.vue'
import FloatingBox from '../components/FloatingBox.vue'
import FrameJobs from '../components/FrameJobs.vue'
import PopMenu from '../components/PopMenu.vue'
import SessionBar from '../components/SessionBar.vue'
import SessionPicture from '../components/SessionPicture.vue'
import SessionSettings from '../components/SessionSettings.vue'
import SessionStage from '../components/SessionStage.vue'
import { imageRatioOf } from '../components/sessionPictureRatio'
import SessionDrawer from '../components/SessionDrawer.vue'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import Icon from '../components/Icon.vue'
import AllFrames from '../components/AllFrames.vue'
import { useImageModels } from '../composables/useSettingsOptions'
import UndirectedNote from './UndirectedNote.vue'
import MusicTab from './MusicTab.vue'
import { useMusicPlayer } from './useMusicPlayer'
import { canSpeak, deliveryWords, partKey, useListening } from './useListening'
import { CAST_SECTION_IDS, type CastField, castSectionsOf, isList, LIST_NOUNS } from './castSections'
import CastFieldBox from './CastFieldBox.vue'
import ItemList from '../components/ItemList.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import { useJobs } from '../composables/useJobs'
import { useJobLink } from '../composables/useJobLink'
import { sessionPath } from '../sessionPath'
import { usePictureEditing } from '../composables/usePictureEditing'
import { useFeatures } from '../composables/useFeatures'
import { isOpen, jobForming, jobStatus } from '../jobs'
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
  undoExchanges,
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
/** An undone exchange's Message, offered beside the box when it held a draft. */
const { offered, putBack, use: usePutBackText, dismiss: dismissPutBack } = usePutBack(draft)
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

const { jobs, runningJobs, runningJob, runningOn, jobsFor, hasJob, workOn, workOf, dropEach, queue, queueEdit, queueClip, queueAll, dropJob, retry, refreshJobs } = useJobs(
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
const { byOf, labelOf, renderedParts } = useImageModels()
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

/** Speaking a line or a thought: shown by the speaker beside the Reply, as it isn't about the picture. */
const SPOKEN: readonly JobKind[] = ['speak', 'speak-thought']
/**
 * A Frame's jobs, on its picture; designing the voice and scoring the music with hindsight are the
 * Roleplay's, shown in the Voice panel and on Score the Roleplay instead, and speaking is by its line.
 */
const frameJobs = (index: number) =>
  jobsFor(index).filter((j) =>
    j.kind !== 'voice' && j.kind !== 'score-roleplay' && !SPOKEN.includes(j.kind)
  )
const speakJobs = (index: number) => jobsFor(index).filter((j) => SPOKEN.includes(j.kind))
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
/** Scrolls the story so Frame `index`'s exchange starts at the picking line. */
function scrollToFrame(index: number) {
  const list = transcript.value
  const exchange = list?.querySelector(`[data-exchange="${index}"]`)
  if (!list || !exchange) return
  const top = exchange.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
  list.scrollTo({ top: top - list.clientHeight / 4 + 24, behavior: 'smooth' })
}
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
  drawer.value = 'music'
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

/** The voice description as edited in the drawer. */
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
 * which each new Reply moves on to. Its picture is beside the story, its Image Prompt in the drawer.
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
  allowed: musicOn,
})
const hasTracks = computed(() => !!session.value?.cues.some((c) => c.track))
/** A clip playing over its Frame's picture, from the Frame tab's Clip section. */
const playingClip = usePlayingClip(() => selectedIndex.value, () => session.value?.settings.imageModel)
/** Plays a clip over Frame `index`'s picture, beside the story. */
function playClip(index: number, clip: Clip) {
  playingClip.value = { index, clip }
}

/** Picks Frame `index`; the newest, so the selection follows the Replies again. */
function pick(index: number) {
  picked.value = index === session.value?.frames.at(-1)?.index ? null : index
}
/** Picks a Frame from the strip, and shows it in the story. */
function pickFromStrip(index: number) {
  pick(index)
  scrollToFrame(index)
}

/**
 * The drawer beside the story (`SessionDrawer`): the picked Frame's Image Prompt, the Look and Cast,
 * or the Music; closed until asked for, and remembered per browser. The Cast opens it while it's
 * reviewed, before the scene begins.
 */
type DrawerTab = 'prompt' | 'cast' | 'music'
const { tab: drawer, toggle: toggleDrawer } = useDrawer<DrawerTab>(
  'roleplay-drawer',
  'prompt',
  (tab) => tab !== 'music' || musicOn.value,
)
watch(reviewing, (now, was) => {
  if (now) drawer.value = 'cast'
  // Begun: the drawer it opened for the review steps aside for the picture.
  else if (was && drawer.value === 'cast') drawer.value = null
}, { immediate: true })
const drawerTabs = computed(() => [
  { id: 'prompt' as const, label: selectedFrame.value ? `${frameName(selectedFrame.value.index)}'s prompt` : 'Prompt' },
  { id: 'cast' as const, label: 'Look & Cast' },
  ...(musicOn.value ? [{ id: 'music' as const, label: 'Music' }] : []),
])
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
  dismissPutBack()
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
  // The reply to it is the one to see.
  picked.value = null
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
/** An earlier Frame is selected: Undo takes back every exchange after it (Undo to a Frame). */
const selectedOlder = computed(() =>
  selectedIndex.value !== null && selectedIndex.value !== session.value?.frames.at(-1)?.index
)
/**
 * Undoes the latest exchange, or with an earlier Frame selected every one after it, once confirmed,
 * so it stops on the Frame in view; the first one's message goes back in the box.
 */
async function undo() {
  const latest = session.value?.frames.at(-1)
  if (!canUndo.value || !latest) return
  const from = selectedOlder.value ? selectedIndex.value! + 1 : latest.index
  const first = session.value!.frames[from]
  if (selectedOlder.value) {
    const what = `Undo ${framesName(from, latest.index)}, back to ${frameName(from - 1)}, and put ` +
      'your message back in the box? Their pictures and spoken lines are deleted.'
    if (!(await ask(what, { action: 'Undo', danger: true }))) return
  }
  try {
    session.value = await undoExchanges(props.id, from, latest.index)
    picked.value = null
    putBack(`${frameName(from)}'s Message`, first.message)
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

/**
 * Opened afresh (not come back to, which keeps the screen as it was), a Roleplay starts at its
 * start: Frame 1 picked, the story at its top, the strip at its first tile. Until then, nothing
 * else here scrolls it.
 */
let opened = false
watch(session, async (s) => {
  if (!s || opened) return
  opened = true
  if (s.frames.length > 1) picked.value = s.frames[0].index
  await nextTick()
  transcript.value?.scrollTo({ top: 0, behavior: 'auto' })
}, { immediate: true })

// Keep the newest exchange in view as the conversation grows (not while picturing a Frame).
watch([
  () => session.value?.frames.length,
  () => (replying.value ? pending.value!.reply : null),
  () => (replying.value ? pending.value!.message : null),
], async (_now, before) => {
  // The first load is the opening's, above.
  if (before[0] === undefined) return
  await nextTick()
  transcript.value?.scrollTo({
    top: transcript.value.scrollHeight,
    behavior: pending.value ? 'smooth' : 'auto',
  })
})

/** The story is scrolled to its end, where it stays as Replies come in. */
let atEnd = true
/**
 * Until then, the player is scrolling the story themselves (a wheel, a touch, the scrollbar, a
 * key): only that picks. Scrolling for them (to a Frame, to the end) and the story narrowing as
 * the drawer opens don't.
 */
let playerScrollsUntil = 0
const playerScrolls = () => (playerScrollsUntil = Date.now() + 800)
/**
 * Scrolling the story picks the exchange nearest a line a quarter of the way down its view (where
 * the eye rests reading on, the owner found the middle too low), so the picture beside it and the
 * strip follow what's being read; at the end, the newest, which new Replies move on to.
 */
function onTranscriptScroll() {
  const list = transcript.value!
  atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40
  if (Date.now() > playerScrollsUntil) return
  if (atEnd) return (picked.value = null)
  const middle = list.getBoundingClientRect().top + list.clientHeight / 4
  let nearest: { index: number; distance: number } | null = null
  for (const el of list.querySelectorAll<HTMLElement>('[data-exchange]')) {
    const box = el.getBoundingClientRect()
    const distance = middle < box.top ? box.top - middle : middle > box.bottom ? middle - box.bottom : 0
    if (!nearest || distance < nearest.distance) nearest = { index: Number(el.dataset.exchange), distance }
  }
  if (nearest) pick(nearest.index)
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

/** A new Chain opening on Frame `index`'s picture, opened to carry on from it by Actions. */
const router = useRouter()
const copying = ref(false)
async function continueAsChain(index: number) {
  if (copying.value || !(await flushEdits('copied'))) return
  copying.value = true
  notice.value = null
  try {
    const chain = await chainFromFrame(props.id, index)
    router.push(sessionPath(chain.id, 'chain'))
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  } finally {
    copying.value = false
  }
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
// --- The strip and the picture beside the story.

/** What a Frame's tile and picture show of the work on it: running, or waiting its turn. */
const workingOn = (index: number) => workOn(index, frameJobs(index))
const tiles = computed<StripTile[]>(() =>
  shownFrames.value.map((f) => ({
    index: f.index,
    thumb: pictureOf(f) ? imageUrl(props.id, pictureOf(f)!.image) : null,
    words: f.message ?? 'Opening',
    working: workingOn(f.index),
    dimmed: changed(f),
    clips: clipCount(pictureOf(f), session.value!.settings.imageModel),
  }))
)
/** The picked Frame's picture, if it has one by the Roleplay's Image Model. */
const selectedPicture = computed(() => selectedFrame.value && pictureOf(selectedFrame.value))
/** The picture shown is by the Session's Image Model, so it can have clips. */
const ownPicture = computed(() =>
  !!selectedPicture.value && selectedPicture.value.imageModel === session.value?.settings.imageModel
)
/** How many clips the Clip menu says the picture has, or null for no Clip menu. */
const clipsMenu = computed(() =>
  selectedPicture.value && featureOn.value('video')
    ? (pickedEdit(selectedPicture.value) ?? selectedPicture.value).clips?.length ?? 0
    : null
)
/** The picked Frame can be pictured now: Picture it writes its Image Prompt if need be, then renders. */
const canPicture = computed(() =>
  !!selectedFrame.value && !selectedFrame.value.blocked && featureOn.value('images') &&
  !hasJob(selectedFrame.value.index, 'picture') && !hasJob(selectedFrame.value.index, 'render')
)
/** The picture's side shows once the scene has begun, where there are pictures, or work on one. */
const pictureShown = computed(() =>
  begun.value && !!selectedFrame.value &&
  (featureOn.value('images') || !!selectedPicture.value || frameJobs(selectedFrame.value.index).length > 0)
)

async function pictureIt(index: number) {
  if (!(await flushEdits('pictured'))) return
  const frame = session.value?.frames[index]
  if (!frame) return
  if (!frame.prompt) await queueAll('picture', [index])
  await queueAll('render', [index])
}

const lookSavingText = computed(() =>
  runningJobs.value.some((j) => j.kind === 'render')
    ? 'Saving once the picture rendering is done…'
    : undefined
)

/** The All Frames view, over the screen; a Frame picked there is shown here. */
const allFrames = ref(false)
const pickFromAll = (index: number) => pickFromStrip(index)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-col">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Roleplay: {{ loadError }}</p>

    <template v-else-if="session">
      <SessionBar kind="Roleplay" :title="session.title ?? ''" :status="busy ? statusLabel : undefined">
        <template v-if="musicOn">
          <span v-if="hasTracks" class="flex items-center gap-1" data-music-player>
            <button
              type="button"
              class="rounded-md p-1.5 hover:bg-surface hover:text-fg"
              :class="{ 'text-fg': music.on.value }"
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
              class="w-14 max-md:hidden"
              aria-label="Music volume"
              data-music-volume
            />
          </span>
          <button
            type="button"
            class="rounded-md px-2 py-1 hover:bg-surface hover:text-fg"
            :class="{ 'bg-surface text-fg': drawer === 'music' }"
            title="The Score, its Cues, and this Frame's music"
            data-open-music
            @click="toggleDrawer('music')"
          >
            <span class="max-sm:hidden">Music</span><Icon name="music" class="sm:hidden" /><span class="sr-only sm:hidden">Music</span>
          </button>
        </template>
        <button
          type="button"
          class="rounded-md px-2 py-1 whitespace-nowrap hover:bg-surface hover:text-fg"
          :class="{ 'bg-surface text-fg': drawer === 'cast' }"
          title="The Look, the Cast and the voice"
          data-open-cast
          @click="toggleDrawer('cast')"
        >
          <span class="max-sm:hidden">Look & Cast</span><Icon name="cast" class="sm:hidden" /><span class="sr-only sm:hidden">Look & Cast</span>
        </button>
        <SessionSettings
          :session="session"
          title="This Roleplay"
          @switched="onSwitched"
          @failed="(text) => (notice = { kind: 'error', text })"
        >
          <ToggleSwitch v-if="featureOn('images')" v-model="renderReplies" title="Render replies" data-render-replies>
            Each new Reply's picture is rendered as its Image Prompt is written (slower)
          </ToggleSwitch>
          <ToggleSwitch v-if="featureOn('voices')" v-model="autoplay" title="Speak replies" data-autoplay>
            Each new Reply is spoken in {{ characterName }}'s voice
          </ToggleSwitch>
          <ToggleSwitch v-if="musicOn" v-model="scoreAsYouPlay" title="Score as you play" data-score-as-you-play>
            Each new Reply's music is directed: it continues, changes or falls silent
          </ToggleSwitch>
        </SessionSettings>
      </SessionBar>

      <FrameStrip v-if="begun" :tiles="tiles" :picked="selectedIndex" @pick="pickFromStrip" @all="allFrames = true">
        <template #end>
          <span
            v-if="replying"
            class="grid h-12 w-20 shrink-0 place-items-center rounded border border-dashed border-line text-muted render-sweep [@media(max-height:640px)]:h-6 [@media(max-height:640px)]:w-9"
            title="The next exchange, being written"
            data-strip-next
          ><Icon name="spinner" class="animate-spin" /></span>
        </template>
      </FrameStrip>

      <div class="flex min-h-0 flex-1">
        <!-- The story: the picked Frame's picture on the left (above, on a phone), the exchanges
             beside it, the text box at its foot. -->
        <SessionStage :ratio="imageRatioOf(session)" :pictured="!!pictureShown">
          <template #picture>
              <SessionPicture
                v-if="selectedFrame"
                :name="frameName(selectedFrame.index)"
                :label="selectedPicture ? `${frameName(selectedFrame.index)} of ${shownFrames.length}${changed(selectedFrame) ? ` · changed since render ${byOf(selectedPicture)}` : ''}` : undefined"
                :src="selectedPicture ? imageUrl(session.id, selectedPicture.image) : null"
                :picture="selectedPicture"
                :dimmed="changed(selectedFrame)"
                :preview="previewOn(selectedFrame.index) ? shownPreview : null"
                :sweep="runningOn(selectedFrame.index) && runningOn(selectedFrame.index)!.kind !== 'voice' ? (runningOn(selectedFrame.index)!.phase === 'queued' ? 'queued' : 'running') : null"
                :jobs="frameJobs(selectedFrame.index)"
                :describe="describeJob"
                :has-job="(kind) => hasJob(selectedFrame!.index, kind)"
                :working="workOf(selectedFrame.index)"
                :can-render="!!selectedFrame.prompt && !selectedFrame.blocked"
                :clips="clipsMenu"
                :playing="playingClip && playingClip.index === selectedFrame.index ? { src: imageUrl(session.id, playingClip.clip.file), clip: playingClip.clip } : null"
                @queue="(kind) => queueSaved(kind, selectedFrame!.index)"
                @view="(kind) => (open3d = { index: selectedFrame!.index, kind })"
                @edit="startEdit(selectedFrame!.index)"
                @open="viewing = selectedFrame.index"
                @prompt="toggleDrawer('prompt')"
                @retry="retry"
                @drop="drop"
                @cancel-all="(list) => dropEach(list, drop)"
                @stop-clip="playingClip = null"
              >
                <template #clip>
                  <p v-if="!ownPicture" class="text-xs text-muted" data-clips-other-model>
                    Clips are made of a picture by {{ labelOf(session.settings.imageModel) }}: render this Frame with it first.
                  </p>
                  <FrameClips
                    v-else-if="selectedPicture"
                    :session-id="session.id"
                    :index="selectedFrame.index"
                    :clips="(pickedEdit(selectedPicture) ?? selectedPicture).clips"
                    :next-pictured="!!session.frames[selectedFrame.index + 1] && !!pictureOf(session.frames[selectedFrame.index + 1])"
                    :next-name="frameName(selectedFrame.index + 1)"
                    :making="clipsMaking(jobsFor(selectedFrame.index), selectedPicture.imageModel)"
                    :playing="playingClip?.index === selectedFrame.index ? playingClip.clip.file : undefined"
                    @make="(order) => queueClip(selectedFrame!.index, order)"
                    @play="(clip) => playClip(selectedFrame!.index, clip)"
                    @stop="playingClip = null"
                  />
                </template>
                <template #empty>
                  <span class="text-muted">
                    <template v-if="workingOn(selectedFrame.index)">{{ frameName(selectedFrame.index) }} is being pictured</template>
                    <template v-else-if="selectedFrame.blocked">{{ frameName(selectedFrame.index) }}'s Image Prompt crosses a limit ({{ selectedFrame.blocked }})</template>
                    <template v-else>{{ frameName(selectedFrame.index) }} isn't pictured</template>
                  </span>
                  <button
                    v-if="canPicture"
                    type="button"
                    class="rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas"
                    :title="selectedFrame.prompt ? 'Render its Image Prompt' : 'The Art Agent writes its Image Prompt, then it\'s rendered'"
                    data-picture-it
                    @click="pictureIt(selectedFrame.index)"
                  >
                    Picture it
                  </button>
                </template>
              </SessionPicture>
          </template>

          <template #side>
            <ol
              ref="transcript"
              @scroll.passive="onTranscriptScroll"
              @wheel.passive="playerScrolls"
              @touchmove.passive="playerScrolls"
              @pointerdown="playerScrolls"
              @keydown="playerScrolls"
              class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2"
              data-transcript
            >
              <template v-for="frame in shownFrames" :key="frame.index">
                <li
                  class="flex cursor-pointer flex-col gap-2 rounded-xl px-3 py-2 transition-shadow duration-500"
                  :class="{
                    'ring-2 ring-info': highlighted === frame.index,
                    'bg-surface': selectedIndex === frame.index && highlighted !== frame.index && begun,
                  }"
                  :aria-current="selectedIndex === frame.index"
                  :data-exchange="frame.index"
                  @click="pick(frame.index)"
                >
                  <!-- The player's Message to the right and the Reply to the left, each leaving a margin on
                       the other side, as a chat's do. -->
                  <div v-if="frame.message !== null" class="flex flex-col items-end gap-1 pl-[12%]" data-message>
                    <span class="text-xs text-muted">{{ personaName }}</span>
                    <p class="max-w-prose whitespace-pre-wrap rounded-2xl rounded-br-md bg-fg px-3 py-2 text-canvas">
                      {{ frame.message }}
                    </p>
                  </div>
                  <div class="pr-[12%]" :data-frame-index="frame.index" data-reply>
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
                    <FrameJobs
                      class="mt-1.5 max-w-sm text-xs"
                      :jobs="speakJobs(frame.index)"
                      :describe="describeJob"
                      @retry="retry"
                      @drop="drop"
                    />
                  </div>
                </li>
              </template>

              <!-- The Cast is written: review it, then begin. -->
              <li v-if="reviewing && !busy" class="m-auto flex max-w-md flex-col items-center gap-3 text-center" data-review>
                <p class="text-muted">
                  Review the Cast in Look & Cast: who {{ characterName }} is, who you play, and where it
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
                <li v-if="pending.message" class="flex flex-col items-end gap-1 pl-[12%]" data-pending-message>
                  <span class="text-xs text-muted">{{ personaName }}</span>
                  <p class="max-w-prose whitespace-pre-wrap rounded-lg bg-fg/80 px-3 py-2 text-canvas">
                    {{ pending.message }}
                  </p>
                </li>
                <li class="flex flex-col gap-1.5 pr-[12%] opacity-80" data-pending-reply>
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
          </template>

          <template #box>
            <FloatingBox
              v-model="draft"
              :placeholder="`What ${personaName} says or does…`"
              :disabled="!begun"
              :busy="busy"
              :detached="pending?.detached"
              :cancelling="pending?.cancelling"
              :working="replying || suggesting"
              :data-writing="replying ? '' : undefined"
              :data-suggesting="suggesting ? '' : undefined"
              @send="send"
              @cancel="cancel"
            >
              <template #notice>
                <PutBackOffer
                  v-if="offered && !notice"
                  :offered="offered"
                  @use="usePutBackText"
                  @dismiss="dismissPutBack"
                />
                <p
                  v-else-if="notice"
                  class="truncate px-2 text-sm"
                  :class="notice.kind === 'declined' ? 'text-warn' : 'text-danger'"
                  :title="notice.text"
                  role="alert"
                >
                  {{ notice.text }}
                </p>
              </template>
              <template v-if="!busy">
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-canvas hover:text-fg disabled:opacity-50"
                  :disabled="!begun"
                  :title="draft.trim()
                    ? `Write ${personaName}'s message out from what you've typed`
                    : `Suggest what ${personaName} might say or do next`"
                  data-suggest
                  @click="suggest"
                >
                  <Icon name="spark" /><span class="max-sm:hidden">Suggest</span>
                </button>
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-canvas hover:text-fg disabled:opacity-50"
                  :disabled="!canUndo"
                  :title="selectedOlder
                    ? `Undo every exchange after ${frameName(selectedIndex!)}, back to it, and put the next message back in the box`
                    : 'Undo the latest exchange and put your message back in the box'"
                  :aria-label="selectedOlder ? `Undo to ${frameName(selectedIndex!)}` : 'Undo'"
                  data-undo
                  @click="undo"
                >
                  <Icon name="undo" /><span v-if="selectedOlder" class="max-sm:hidden">to {{ frameName(selectedIndex!) }}</span>
                </button>
                <PopMenu v-if="begun" align="end" side="above" panel-class="w-72 p-1 text-sm" data-more-menu>
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
                      v-if="featureOn('images')"
                      type="button"
                      class="menu-row"
                      :disabled="!toRender.length"
                      title="Queue a render of every Frame not rendered yet by this Image Model, or changed since"
                      data-render-all
                      @click="renderAll(); close()"
                    >
                      Render all<span v-if="toRender.length" class="ml-auto text-muted tabular-nums" data-render-count>{{ toRender.length }}</span>
                    </button>
                    <button
                      v-if="musicOn"
                      type="button"
                      class="menu-row"
                      :disabled="scoringAll"
                      title="Score every Frame's music again with hindsight, as a film is scored once it's cut: its Cues are replaced"
                      data-score-all
                      @click="scoreAll(); close()"
                    >
                      {{ scoringAll ? 'Scoring…' : 'Score the Roleplay' }}
                    </button>
                    <button
                      v-if="selectedFrame"
                      type="button"
                      class="menu-row"
                      :disabled="!selectedFrame.prompt || !!selectedFrame.blocked || copying"
                      :title="!selectedFrame.prompt
                      ? `Picture ${frameName(selectedFrame.index)} first: a Chain starts from its Image Prompt`
                      : selectedFrame.blocked
                      ? `Picture ${frameName(selectedFrame.index)} again first: it crosses a limit`
                      : `A new Chain opening on ${frameName(selectedFrame.index)}'s Image Prompt and picture, to carry on from it by Actions. This Roleplay stays as it is.`"
                      data-continue-chain
                      @click="continueAsChain(selectedFrame.index); close()"
                    >
                      {{ copying ? 'Making…' : `Chain from ${frameName(selectedFrame.index)}` }}
                    </button>
                  </template>
                </PopMenu>
              </template>
            </FloatingBox>
          </template>
        </SessionStage>

        <SessionDrawer v-model="drawer" :tabs="drawerTabs">
          <template #prompt>
            <div class="p-4 text-sm" data-frame-panel>
              <div v-if="selectedFrame" class="flex flex-col gap-2">
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
              <p v-if="!selectedFrame" class="text-muted">The Frames appear once the scene begins.</p>
            </div>
          </template>
          <template #cast>
            <div data-cast-panel>
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
          </template>
          <template v-if="musicOn" #music>
            <div data-music-panel>
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
          </template>
        </SessionDrawer>
      </div>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>

    <AllFrames
      v-if="session"
      v-model:open="allFrames"
      :session-id="session.id"
      :frames="session.frames"
      :tiles="tiles"
      :text="(f) => [f.message, f.reply.internal, f.reply.actions, f.reply.dialogue].filter(Boolean).join(' ')"
      :picked="selectedIndex"
      :image-model="session.settings.imageModel"
      :thumbnail="session.thumbnail"
      :caption="(f) => f.reply.actions"
      one-style
      @pick="pickFromAll"
      @changed="reload(); refreshJobs()"
    />
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
