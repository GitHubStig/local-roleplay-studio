<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, cancelFrame, DOWNLOADING, getSession, imageUrl, type Made3d } from '../api'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredText } from '../composables/useStoredText'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import Frame3dButtons from '../components/Frame3dButtons.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import { cleanReply } from './reply'
import { sessionPath } from '../sessionPath'
import {
  type Cast,
  type Reply,
  type RoleplayEvent,
  type RoleplayLook,
  type RoleplaySession,
  type Shown,
  type RoleplayFrame,
  type Speech,
  beginRoleplay,
  cancelJob,
  type Job,
  type JobKind,
  listJobs,
  queueJob,
  retryJob,
  saveCast,
  saveLook,
  saveVoice,
  sendMessage,
  suggestMessage,
  undoExchange,
  writeCast,
} from './api'

const props = defineProps<{ id: string }>()
const router = useRouter()

const session = ref<RoleplaySession | null>(null)
const loadError = ref('')
/** Why the last message didn't go through: an error, or a Limit it crossed. */
const notice = ref<{ kind: 'error' | 'declined'; text: string } | null>(null)
/** The unsent message, remembered per Session so it survives a reload. */
const draft = useStoredText(`draft:${props.id}`)
const thoughtsHidden = useStoredFlag('roleplay-thoughts-hidden')
const transcript = ref<HTMLElement | null>(null)
/** The Frame whose picture is open in the viewer, if any. */
const viewing = ref<number | null>(null)

/** The exchange in progress: the message sent, and the reply as it arrives. */
interface Pending {
  kind: 'cast' | 'begin' | 'message' | 'suggest'
  message?: string
  reply: Partial<Reply>
  thinking?: string
  cancelling?: boolean
  /** Started elsewhere (another tab); followed by polling. */
  detached?: boolean
}
const pending = ref<Pending | null>(null)
const busy = computed(() => pending.value !== null)
/** The Character is writing into the conversation (not picturing a Frame beside it). */
const replying = computed(() => {
  const kind = pending.value?.kind
  return !!pending.value && !pending.value.detached && (kind === 'message' || kind === 'begin')
})
/** A message is being suggested into the text box. */
const suggesting = computed(() => pending.value?.kind === 'suggest')
// --- Background work: pictures, renders and upscales, queued on the server.

/** The Roleplay's jobs: running, then queued, then failed (until dismissed). */
const jobs = ref<Job[]>([])
const openJobs = computed(() => jobs.value.filter((j) => j.status !== 'failed'))
const runningJob = computed(() => jobs.value.find((j) => j.status === 'running') ?? null)
/** A Frame's jobs; designing the voice is the Roleplay's, shown in the Voice panel instead. */
const jobsFor = (index: number) =>
  jobs.value.filter((j) => j.frameIndex === index && j.kind !== 'voice')
const voiceJob = computed(() => jobs.value.find((j) => j.kind === 'voice') ?? null)
/** A job of this kind is already queued or running on this Frame. */
const hasJob = (index: number, kind: JobKind) =>
  openJobs.value.some((j) => j.frameIndex === index && j.kind === kind)

const JOB_NAMES: Record<JobKind, string> = {
  picture: 'Picture',
  render: 'Render',
  upscale: 'Upscale',
  voice: 'Voice',
  speak: 'Listen',
  'speak-thought': 'Listen to thought',
  scene: 'SHARP',
  figure: 'TripoSplat',
  lito: 'LiTo',
}

/** What a job is doing, in a few words. */
function jobStatus(job: Job): string {
  if (job.status === 'failed') return `Failed: ${job.error}`
  if (job.status === 'queued') return 'Queued'
  if (job.phase === 'download') return DOWNLOADING
  if (job.kind === 'voice' || job.kind === 'speak' || job.kind === 'speak-thought') {
    if (job.phase === 'queued') return 'Waiting for another render…'
    if (job.phase === 'text') return 'Describing the voice…'
    if (job.kind === 'voice' || !session.value?.voice?.ref) return 'Designing the voice…'
    return 'Speaking…'
  }
  if (job.kind === 'picture') {
    return currentLook.value ? 'Picturing this moment…' : 'Writing the Look, then picturing…'
  }
  if (job.phase === 'queued') return 'Waiting for another render…'
  if (job.kind === 'scene') return 'Making the 2.5D scene…'
  if (job.kind === 'figure' || job.kind === 'lito') return 'Making the 3D figure…'
  const doing = job.kind === 'upscale' ? 'Upscaling to 2048 px…' : 'Rendering…'
  return job.progress ? `${doing} step ${job.progress.step} of ${job.progress.total}` : doing
}

async function queue(kind: JobKind, index: number) {
  try {
    jobs.value = await queueJob(props.id, kind, index)
    watchJobs()
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  }
}

/** Cancels a queued or running job, or dismisses a failed one. */
async function dropJob(job: Job) {
  try {
    jobs.value = await cancelJob(props.id, job.id)
  } catch {
    await refreshJobs()
  }
}

/** Puts a failed job back in the queue. */
async function retry(job: Job) {
  try {
    jobs.value = await retryJob(props.id, job.id)
    watchJobs()
  } catch {
    await refreshJobs()
  }
}

/**
 * Follows the queue while anything is queued or running: a job that finishes (or fails) has
 * changed the Roleplay, so it's reloaded.
 */
let jobTimer: ReturnType<typeof setTimeout> | undefined
async function refreshJobs() {
  clearTimeout(jobTimer)
  let now: Job[]
  try {
    now = await listJobs(props.id)
  } catch {
    return
  }
  const settled = openJobs.value.some((j) =>
    !now.some((n) => n.id === j.id && n.status !== 'failed')
  )
  jobs.value = now
  if (settled) await reload()
  watchJobs()
}
function watchJobs() {
  clearTimeout(jobTimer)
  if (openJobs.value.length) jobTimer = setTimeout(refreshJobs, 1000)
}
onBeforeUnmount(() => clearTimeout(jobTimer))

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
function goToFrame(index: number) {
  transcript.value?.querySelector(`[data-frame-index="${index}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlighted.value = index
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlighted.value = null), 1600)
}

// --- 3D, by model (experimental): SHARP, TripoSplat and LiTo (Frame3dButtons).

/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)

// --- Voices: the Character speaks their lines.

/** New Replies are spoken as they arrive; remembered per browser. */
const autoplay = useStoredFlag('roleplay-voice-autoplay')
/** What of a Reply is spoken: its dialogue, or the Character's thought (whispered). */
type Part = 'dialogue' | 'thought'
const SPEAK_JOB = { dialogue: 'speak', thought: 'speak-thought' } as const
const speechOf = (frame: RoleplayFrame, part: Part) =>
  part === 'thought' ? frame.thoughtSpeech : frame.speech
/** Whether a part has words to say aloud (a Reply of only "…" doesn't). */
const canSpeak = (frame: { reply: Reply }, part: Part = 'dialogue') =>
  /[A-Za-z]/.test(part === 'thought' ? frame.reply.internal : frame.reply.dialogue)
/** How a spoken line was directed, in a few words: "slowly, with a sigh"; '' if plainly. */
function deliveryWords(speech?: Speech): string {
  const d = speech?.delivery
  if (!d) return ''
  const pace = { normal: '', slow: 'slowly', fast: 'quickly' }[d.pace]
  const sound = { none: '', sigh: 'a sigh', laughter: 'a laugh', cough: 'a cough' }[d.sound]
  return [pace, sound && `with ${sound}`].filter(Boolean).join(', ')
}
/** A part's audio is in the Character's voice as it is now. */
const spokenNow = (speech?: Speech) => !!speech && speech.ref === session.value?.voice?.ref

const player = new Audio()
/** What's playing: a Frame's part (`3`, `3:thought`), or 'voice' for the voice's reference clip. */
const playing = ref<string | null>(null)
const partKey = (index: number, part: Part) => (part === 'thought' ? `${index}:thought` : `${index}`)
function stopAudio() {
  player.pause()
  playing.value = null
}
useEventListener(player, 'ended', () => (playing.value = null))
function play(file: string, what: string) {
  stopAudio()
  player.src = imageUrl(props.id, file)
  // Browsers return a promise; some test environments return nothing.
  Promise.resolve(player.play()).then(() => (playing.value = what), () => (playing.value = null))
}

/** Parts to play once they've been spoken: asked to Listen to, or new while autoplay is on. */
const toPlay = new Map<string, { index: number; part: Part }>()
/**
 * Plays a Frame's line or thought, speaking it first (in the voice as it is now) if it hasn't
 * been, or was spoken in an earlier voice.
 */
function listen(index: number, part: Part = 'dialogue') {
  const frame = session.value?.frames[index]
  if (!frame) return
  const key = partKey(index, part)
  if (playing.value === key) return stopAudio()
  const speech = speechOf(frame, part)
  if (speech && spokenNow(speech)) return play(speech.file, key)
  toPlay.set(key, { index, part })
  if (!hasJob(index, SPEAK_JOB[part])) queue(SPEAK_JOB[part], index)
}
// Play what was waiting to be spoken, once it is; forget it if speaking failed or it was undone.
watch([() => session.value?.frames, jobs], () => {
  for (const [key, { index, part }] of [...toPlay]) {
    const frame = session.value?.frames[index]
    const failed = jobs.value.some((j) =>
      j.frameIndex === index && j.kind === SPEAK_JOB[part] && j.status === 'failed'
    )
    const speech = frame && speechOf(frame, part)
    if (!frame || failed) toPlay.delete(key)
    else if (speech && spokenNow(speech) && !hasJob(index, SPEAK_JOB[part])) {
      toPlay.delete(key)
      play(speech.file, key)
    }
  }
})

/** The voice description as edited in the side panel. */
const voiceDraft = ref('')
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

/** The side panel's tab: the Look and Cast, or the queue. */
const sideTab = ref<'cast' | 'queue'>('cast')

const cast = computed(() => session.value?.cast ?? null)
/** The Frames as shown: Replies tidied of stray quote marks and JSON fragments. */
const shownFrames = computed(() =>
  (session.value?.frames ?? []).map((f) => ({ ...f, reply: cleanReply(f.reply) }))
)
/** The Cast is written but the scene hasn't begun: the player reviews it first. */
const reviewing = computed(() => !!cast.value && session.value!.frames.length === 0)
const begun = computed(() => (session.value?.frames.length ?? 0) > 0)
const characterName = computed(() => cast.value?.character.name ?? 'The Character')
const personaName = computed(() => cast.value?.persona.name ?? 'You')

// --- Loading, and setting up on first open.

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
    if (loaded.kind !== 'roleplay') {
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
  setCurrentSession(props.id, 'roleplay')
  return true
}

let started = false
async function start() {
  if (started) return
  if (!(await load())) return
  started = true
  refreshJobs()
  if (session.value!.activity) follow()
  else if (!session.value!.cast) await rewriteCast()
}
onMounted(start)

let firstActivation = true
onActivated(async () => {
  onScreen = true
  if (firstActivation) return (firstActivation = false)
  if (leaveOnReturn) return router.replace(leaveOnReturn)
  if (!started) return start()
  refreshJobs()
  if (!busy.value && (await load()) && session.value!.activity) follow()
})
onDeactivated(() => (onScreen = false))

// Work started in another tab: show it, and poll until it's done.
let followTimer: ReturnType<typeof setTimeout> | undefined
function follow() {
  pending.value = { kind: 'message', reply: {}, detached: true }
  const poll = async () => {
    if (!(await load())) return (pending.value = null)
    if (session.value!.activity) followTimer = setTimeout(poll, 1500)
    else pending.value = null
  }
  followTimer = setTimeout(poll, 1500)
}
onBeforeUnmount(() => clearTimeout(followTimer))

// --- Streamed work.

function onEvent(event: RoleplayEvent) {
  const p = pending.value
  if (!p) return
  switch (event.type) {
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
      if (autoplay.value && canSpeak(event.frame)) {
        toPlay.set(partKey(event.frame.index, 'dialogue'), { index: event.frame.index, part: 'dialogue' })
        queue('speak', event.frame.index)
      }
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

const rewriteCast = () => run({ kind: 'cast', reply: {} }, () => writeCast(props.id, onEvent))

/** Begins the scene, saving any unsaved edits to the Cast first. */
async function begin() {
  if (busy.value) return
  if (castChanged.value && !(await saveCastDraft())) return
  await run({ kind: 'begin', reply: {} }, () => beginRoleplay(props.id, onEvent))
}

function send() {
  const text = draft.value.trim()
  if (!text || busy.value || !begun.value) return
  run({ kind: 'message', message: text, reply: {} }, () => sendMessage(props.id, text, onEvent))
}

/**
 * Writes a message into the box, from the story and whatever's typed there. If it fails or is
 * cancelled, the box gets back what was typed.
 */
async function suggest() {
  if (busy.value || !begun.value) return
  const typed = draft.value
  let suggested = false
  await run({ kind: 'suggest', reply: {} }, () =>
    suggestMessage(props.id, typed, (event) => {
      if (event.type === 'suggestion') suggested = true
      onEvent(event)
    }))
  if (!suggested) draft.value = typed
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

async function cancel() {
  if (pending.value) pending.value = { ...pending.value, cancelling: true }
  await cancelFrame(props.id)
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

// Leaving the site or reloading drops the connection to running work, which cancels it.
function warnBeforeUnload(e: BeforeUnloadEvent) {
  if (busy.value && !pending.value?.detached) {
    e.preventDefault()
    e.returnValue = ''
  }
}
useEventListener(window, 'beforeunload', warnBeforeUnload)

const statusLabel = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.cancelling) return 'Cancelling…'
  if (p.detached) return 'A reply is being written in another tab…'
  if (p.kind === 'cast') return cast.value ? 'Rewriting the Cast…' : 'Writing the Cast…'
  if (p.kind === 'begin') return `${characterName.value} is starting the scene…`
  if (p.kind === 'suggest') return `Suggesting ${personaName.value}'s message…`
  return `${characterName.value} is replying…`
})

// --- The Cast, editable by hand.

type CastField = { group: keyof Cast; key: string; label: string; long?: boolean }
const CAST_FIELDS: CastField[] = [
  { group: 'character', key: 'name', label: 'Name' },
  { group: 'character', key: 'age', label: 'Age' },
  { group: 'character', key: 'appearance', label: 'Appearance', long: true },
  { group: 'character', key: 'personality', label: 'Personality', long: true },
  { group: 'character', key: 'voice', label: 'Voice', long: true },
  { group: 'character', key: 'background', label: 'Background', long: true },
  { group: 'character', key: 'goal', label: 'Goal', long: true },
  { group: 'persona', key: 'name', label: 'Name' },
  { group: 'persona', key: 'role', label: 'Who they are to the Character', long: true },
  { group: 'persona', key: 'appearance', label: 'Appearance', long: true },
  { group: 'setting', key: 'place', label: 'Place', long: true },
  { group: 'setting', key: 'time', label: 'Time', long: true },
  { group: 'setting', key: 'weather', label: 'Weather', long: true },
]
const GROUPS: { id: keyof Cast; title: () => string }[] = [
  { id: 'character', title: () => `Character · ${characterName.value}` },
  { id: 'persona', title: () => `You play · ${personaName.value}` },
  { id: 'setting', title: () => 'Where it starts' },
]

const castDraft = ref<Cast | null>(null)
// A plain copy to edit (structuredClone can't copy Vue's reactive proxies).
watch(cast, (c) => (castDraft.value = c ? JSON.parse(JSON.stringify(c)) : null), {
  immediate: true,
})
const castChanged = computed(() => JSON.stringify(castDraft.value) !== JSON.stringify(cast.value))
const castSaved = ref(false)

const fieldValue = (f: CastField) =>
  String((castDraft.value![f.group] as unknown as Record<string, unknown>)[f.key] ?? '')
function setField(f: CastField, value: string) {
  const group = castDraft.value![f.group] as unknown as Record<string, unknown>
  group[f.key] = f.key === 'age' ? Number(value) : value
  castSaved.value = false
}

// --- The Look, editable by hand once written.

/** The Look to edit; an older single-sentence Look isn't shown, since the next picture replaces it. */
const currentLook = computed(() => {
  const look = session.value?.look
  return look && 'character' in look ? look : null
})
const lookDraft = ref<RoleplayLook | null>(null)
watch(currentLook, (l) => (lookDraft.value = l ? { ...l } : null), { immediate: true })
const lookChanged = computed(() =>
  !!lookDraft.value && !!currentLook.value &&
  (['character', 'persona', 'style'] as const).some((k) =>
    lookDraft.value![k].trim() !== currentLook.value![k]
  )
)

/** "Kael and Elara Vance", "Kael", …: who a picture shows. */
function shownNames(shown: Shown | undefined): string {
  if (shown === 'none') return 'no one'
  if (shown === 'character') return characterName.value
  if (shown === 'persona') return personaName.value
  return `${characterName.value} and ${personaName.value}`
}
async function saveLookDraft() {
  if (!lookDraft.value) return
  notice.value = null
  try {
    session.value = await saveLook(props.id, lookDraft.value)
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
  }
}

/** Saves the edited Cast; false if it was refused. */
async function saveCastDraft(): Promise<boolean> {
  if (!castDraft.value) return false
  notice.value = null
  try {
    session.value = await saveCast(props.id, castDraft.value)
    castSaved.value = true
    return true
  } catch (err) {
    notice.value = { kind: 'error', text: (err as Error).message }
    return false
  }
}
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Roleplay: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div class="flex items-center justify-between gap-3 text-sm">
          <p class="min-w-0 truncate text-muted" role="status">
            <span v-if="busy" class="animate-pulse">{{ statusLabel }}</span>
            <template v-else-if="cast">
              {{ characterName }} and {{ personaName }} · {{ cast.setting.place }}
            </template>
          </p>
          <div class="flex shrink-0 items-center gap-4">
            <label
              class="flex cursor-pointer items-center gap-1.5 text-muted"
              :title="`Speak each new reply in ${characterName}'s voice`"
            >
              <input v-model="autoplay" type="checkbox" data-autoplay />
              Speak replies
            </label>
            <label class="flex cursor-pointer items-center gap-1.5 text-muted">
              <input v-model="thoughtsHidden" type="checkbox" data-hide-thoughts />
              Hide thoughts
            </label>
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
                'render-sweep': runningJob?.frameIndex === frame.index && runningJob.kind !== 'voice',
                'ring-2 ring-info': highlighted === frame.index,
              }"
              :data-rendering="runningJob?.frameIndex === frame.index && runningJob.phase === 'queued'
              ? 'queued'
              : undefined"
              :data-frame-index="frame.index"
              data-reply
            >
              <!-- Text on the left, its picture beside it on wide windows (stacked on narrow ones). -->
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span class="text-xs text-muted">{{ characterName }}</span>
                  <p
                    v-if="frame.reply.internal && !thoughtsHidden"
                    class="max-w-prose text-sm italic text-muted"
                    data-internal
                  >
                    {{ frame.reply.internal }}
                    <button
                      v-if="canSpeak(frame, 'thought')"
                      type="button"
                      class="action ml-1.5 not-italic align-middle"
                      :class="{ 'action-on': playing === partKey(frame.index, 'thought') }"
                      :disabled="hasJob(frame.index, 'speak-thought')"
                      :title="frame.thoughtSpeech && !spokenNow(frame.thoughtSpeech)
                        ? 'Spoken in an earlier voice: Listen speaks it again'
                        : `Hear ${characterName} think it, whispered`"
                      data-listen-thought
                      @click="listen(frame.index, 'thought')"
                    >
                      {{ playing === partKey(frame.index, 'thought') ? '■ Stop' : '▶ Listen' }}
                    </button>
                  </p>
                  <p v-if="frame.reply.actions" class="max-w-prose italic" data-actions>
                    {{ frame.reply.actions }}
                  </p>
                  <p v-if="frame.reply.dialogue" class="max-w-prose text-lg" data-dialogue>
                    “{{ frame.reply.dialogue }}”
                  </p>
                  <div class="flex max-w-prose flex-col gap-1 text-xs" data-picture>
                    <!-- This Frame's queued, running and failed jobs, each cancellable in place. -->
                    <p
                      v-for="job in jobsFor(frame.index)"
                      :key="job.id"
                      class="flex items-center gap-2"
                      data-frame-job
                    >
                      <span
                        :class="{
                          'animate-pulse text-info': job.status === 'running',
                          'text-muted': job.status === 'queued',
                          'text-danger': job.status === 'failed',
                        }"
                      >
                        {{ JOB_NAMES[job.kind] }} · {{ jobStatus(job) }}
                      </span>
                      <button
                        v-if="job.status === 'failed'"
                        type="button"
                        class="text-fg underline-offset-2 hover:underline"
                        data-retry
                        @click="retry(job)"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        class="text-danger underline-offset-2 hover:underline"
                        @click="dropJob(job)"
                      >
                        {{ job.status === 'failed' ? 'Dismiss' : 'Cancel' }}
                      </button>
                    </p>
                    <p class="flex flex-wrap items-center gap-1.5">
                      <button
                        v-if="canSpeak(frame)"
                        type="button"
                        class="action"
                        :class="{ 'action-on': playing === partKey(frame.index, 'dialogue') }"
                        :disabled="hasJob(frame.index, 'speak')"
                        :title="frame.speech && !spokenNow(frame.speech)
                          ? 'Spoken in an earlier voice: Listen speaks it again'
                          : `Hear ${characterName} say it`"
                        data-listen
                        @click="listen(frame.index)"
                      >
                        {{ playing === partKey(frame.index, 'dialogue') ? '■ Stop' : '▶ Listen' }}
                      </button>
                      <span
                        v-if="spokenNow(frame.speech) && deliveryWords(frame.speech)"
                        class="mr-1.5 text-muted"
                        data-delivery
                      >· {{ deliveryWords(frame.speech) }}</span>
                      <button
                        type="button"
                        class="action"
                        :disabled="hasJob(frame.index, 'picture')"
                        data-picture-button
                        @click="queue('picture', frame.index)"
                      >
                        {{ frame.promptText ? 'Picture again' : 'Picture this' }}
                      </button>
                      <button
                        v-if="(frame.promptText && !frame.blocked) || hasJob(frame.index, 'picture')"
                        type="button"
                        class="action"
                        :disabled="hasJob(frame.index, 'render')"
                        data-render-button
                        @click="queue('render', frame.index)"
                      >
                        {{ frame.image ? 'Re-render' : 'Render' }}
                      </button>
                      <button
                        v-if="frame.image || hasJob(frame.index, 'render')"
                        type="button"
                        class="action"
                        :disabled="!!frame.upscaled || hasJob(frame.index, 'upscale')"
                        :title="frame.upscaled ? 'Upscaled to 2048 px' : 'Upscale to 2048 px with SeedVR2'"
                        data-upscale-button
                        @click="queue('upscale', frame.index)"
                      >
                        {{ frame.upscaled ? 'Upscaled' : 'Upscale' }}
                      </button>
                      <Frame3dButtons
                        :frame="frame"
                        :disabled="(kind) => hasJob(frame.index, kind)"
                        @make="(kind) => queue(kind, frame.index)"
                        @view="(kind) => (open3d = { index: frame.index, kind })"
                      />
                    </p>
                    <details v-if="frame.promptText" class="text-muted" data-image-prompt>
                      <summary class="cursor-pointer select-none">
                        Image Prompt
                        <span v-if="frame.blocked" class="text-warn">· crosses a limit ({{ frame.blocked }})</span>
                      </summary>
                      <p class="mt-1" data-shown>Shows {{ shownNames(frame.shown) }}</p>
                      <p class="mt-1 leading-relaxed">{{ frame.promptText }}</p>
                      <p v-if="frame.pictureTimings" class="mt-1" data-picture-timings>
                        Pictured in {{ frame.pictureTimings.text.toFixed(1) }} s<template
                          v-if="frame.pictureModel"
                        > by {{ frame.pictureModel }}</template><template
                          v-if="frame.pictureStyle"
                        >, as tags</template>
                      </p>
                      <details v-if="frame.pictureThinking" class="mt-1">
                        <summary class="cursor-pointer select-none">Reasoning</summary>
                        <p class="mt-1 whitespace-pre-wrap leading-relaxed">{{ frame.pictureThinking }}</p>
                      </details>
                    </details>
                  </div>
                </div>
                <button
                  v-if="frame.image"
                  type="button"
                  class="relative block w-full max-w-sm shrink-0 lg:w-72 lg:max-w-none xl:w-80"
                  title="Look closer"
                  data-picture-image
                  @click="viewing = frame.index"
                >
                  <img
                    :src="imageUrl(session.id, frame.image)"
                    :alt="`Picture of Frame ${frame.index}`"
                    class="w-full rounded-md"
                    :class="{ 'opacity-50': frame.stale }"
                    @load="onPictureLoad"
                  />
                  <span
                    v-if="frame.stale"
                    class="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-white"
                  >Changed since render</span>
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
              <p v-if="pending.reply.internal && !thoughtsHidden" class="max-w-prose text-sm italic text-muted">
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
            <textarea
              v-model="draft"
              rows="5"
              class="flex-1 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
              :placeholder="`What ${personaName} says or does… (Enter to send, Shift+Enter for a new line)`"
              :disabled="!begun || busy"
              @keydown="onKeydown"
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

      <aside class="flex w-80 flex-col border-l border-line xl:w-96" data-side-panel>
        <div role="tablist" class="flex shrink-0 border-b border-line text-sm">
          <button
            v-for="tab in [
              { id: 'cast', label: 'Look & Cast' },
              { id: 'queue', label: openJobs.length ? `Queue (${openJobs.length})` : 'Queue' },
            ] as const"
            :key="tab.id"
            type="button"
            role="tab"
            class="flex-1 px-4 py-2 text-muted aria-selected:border-b-2 aria-selected:border-fg aria-selected:font-medium aria-selected:text-fg"
            :aria-selected="sideTab === tab.id"
            :data-tab="tab.id"
            @click="sideTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- The queue: what's running, queued and failed; click one to go to its Frame. -->
        <section v-if="sideTab === 'queue'" class="min-h-0 flex-1 overflow-y-auto" data-queue>
          <p v-if="!jobs.length" class="p-4 text-sm text-muted">
            Nothing queued. Picture, Render and Upscale under a Reply add work here, to run while
            you carry on.
          </p>
          <ol v-else>
            <li
              v-for="job in jobs"
              :key="job.id"
              class="flex items-start gap-2 border-b border-line p-3 text-sm hover:bg-surface"
              data-queue-item
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                :title="`Go to Frame ${job.frameIndex}`"
                @click="goToFrame(job.frameIndex)"
              >
                <span class="font-medium">{{ JOB_NAMES[job.kind] }} · Frame {{ job.frameIndex }}</span>
                <span
                  class="text-xs"
                  :class="{
                    'animate-pulse text-info': job.status === 'running',
                    'text-muted': job.status === 'queued',
                    'text-danger': job.status === 'failed',
                  }"
                >
                  {{ jobStatus(job) }}
                </span>
              </button>
              <button
                v-if="job.status === 'failed'"
                type="button"
                class="shrink-0 text-xs text-fg underline-offset-2 hover:underline"
                data-retry
                @click="retry(job)"
              >
                Retry
              </button>
              <button
                type="button"
                class="shrink-0 text-xs text-danger underline-offset-2 hover:underline"
                @click="dropJob(job)"
              >
                {{ job.status === 'failed' ? 'Dismiss' : 'Cancel' }}
              </button>
            </li>
          </ol>
        </section>

        <div v-else class="min-h-0 flex-1 overflow-y-auto" data-cast-panel>
        <form
          v-if="lookDraft"
          class="flex flex-col gap-2 border-b border-line p-4 text-sm"
          data-look
          @submit.prevent="saveLookDraft"
        >
          <h2 class="font-medium">Look <span class="font-normal text-muted">· every picture</span></h2>
          <CollapsibleTextarea
            id="look.character"
            v-model="lookDraft.character"
            :label="characterName"
            :disabled="busy"
          />
          <CollapsibleTextarea
            id="look.persona"
            v-model="lookDraft.persona"
            :label="personaName"
            :disabled="busy"
          />
          <CollapsibleTextarea
            id="look.style"
            v-model="lookDraft.style"
            label="Art style and medium"
            :disabled="busy"
          />
          <button
            v-if="lookChanged"
            type="submit"
            class="w-fit rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
            :disabled="busy"
          >
            Save Look
          </button>
        </form>
        <form
          v-if="cast"
          class="flex flex-col gap-2 border-b border-line p-4 text-sm"
          data-voice
          @submit.prevent="saveVoiceDraft"
        >
          <h2 class="font-medium">
            Voice <span class="font-normal text-muted">· how {{ characterName }} sounds</span>
          </h2>
          <textarea
            v-model="voiceDraft"
            rows="3"
            class="resize-y rounded border border-line bg-surface p-2 text-sm text-fg"
            :placeholder="`Described from the Cast the first time ${characterName} speaks, or describe it yourself: age, pitch, texture, manner.`"
            :disabled="!!voiceJob && voiceJob.status !== 'failed'"
            data-voice-description
          />
          <p v-if="voiceJob" class="flex items-center gap-2 text-xs" data-voice-job>
            <span
              :class="{
                'animate-pulse text-info': voiceJob.status === 'running',
                'text-muted': voiceJob.status === 'queued',
                'text-danger': voiceJob.status === 'failed',
              }"
            >{{ jobStatus(voiceJob) }}</span>
            <button
              type="button"
              class="text-danger underline-offset-2 hover:underline"
              @click="dropJob(voiceJob)"
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
        </form>
        <h2 class="border-b border-line px-4 py-2 text-sm font-medium">Cast</h2>
        <p v-if="!castDraft" class="p-4 text-sm text-muted">
          <span v-if="busy" class="animate-pulse">Writing the Cast from your Brief…</span>
          <template v-else>No Cast yet.</template>
        </p>
        <form v-else class="flex flex-col gap-5 p-4 text-sm" data-cast-form @submit.prevent="saveCastDraft">
          <!-- min-w-0: a fieldset is otherwise as wide as its widest unwrappable line, which a
               collapsed field's one-line preview is -->
          <fieldset v-for="g in GROUPS" :key="g.id" class="flex min-w-0 flex-col gap-2">
            <legend class="mb-1 font-medium">{{ g.title() }}</legend>
            <template v-for="f in CAST_FIELDS.filter((f) => f.group === g.id)" :key="f.key">
            <CollapsibleTextarea
              v-if="f.long"
              :id="`${g.id}.${f.key}`"
              :model-value="fieldValue(f)"
              :label="f.label"
              :disabled="busy"
              @update:model-value="setField(f, $event)"
            />
            <label v-else class="flex flex-col gap-1 text-xs text-muted">
              {{ f.label }}
              <input
                :value="fieldValue(f)"
                :type="f.key === 'age' ? 'number' : 'text'"
                :min="f.key === 'age' ? 18 : undefined"
                class="rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
                :disabled="busy"
                :data-field="`${g.id}.${f.key}`"
                @input="setField(f, ($event.target as HTMLInputElement).value)"
              />
            </label>
            </template>
          </fieldset>
          <div class="flex items-center gap-3">
            <button
              type="submit"
              class="w-fit rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
              :disabled="busy || !castChanged"
            >
              Save Cast
            </button>
            <span v-if="castSaved && !castChanged && begun" class="text-xs text-muted">
              Applies from the next reply.
            </span>
          </div>
        </form>
        </div>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>

    <FrameViewer
      v-if="session"
      v-model:open="viewing"
      :session-id="session.id"
      :frames="session.frames"
      @step="goToFrame"
    />
    <Frame3dViewers
      v-if="session"
      v-model:open="open3d"
      :session-id="session.id"
      :frames="session.frames"
    />
  </div>
</template>
