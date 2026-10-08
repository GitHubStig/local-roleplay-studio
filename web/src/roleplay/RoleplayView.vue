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
import { useRouter } from 'vue-router'
import { ApiError, cancelFrame, getSession, imageUrl, type Made3d } from '../api'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredText } from '../composables/useStoredText'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ComposeBox from '../components/ComposeBox.vue'
import PictureButtons from '../components/PictureButtons.vue'
import UndirectedNote from './UndirectedNote.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import FrameJobs from '../components/FrameJobs.vue'
import JobQueue from '../components/JobQueue.vue'
import { useJobs } from '../composables/useJobs'
import { useFeatures } from '../composables/useFeatures'
import { jobStatus } from '../jobs'
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
  type Job,
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
/** The Text Model is writing the Cast: the first time, or again on Rewrite Cast. */
const writingCast = computed(() => pending.value?.kind === 'cast')
// --- Background work: pictures, renders, upscales, voices and 3D, queued on the server.

const { jobs, openJobs, runningJob, jobsFor, hasJob, queue, dropJob, retry, refreshJobs } = useJobs(
  props.id,
  {
    onSettled: () => reload(),
    onError: (text) => (notice.value = { kind: 'error', text }),
  },
)
/** A Frame's jobs; designing the voice is the Roleplay's, shown in the Voice panel instead. */
const frameJobs = (index: number) => jobsFor(index).filter((j) => j.kind !== 'voice')
const voiceJob = computed(() => jobs.value.find((j) => j.kind === 'voice') ?? null)
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
  if (job.kind === 'picture') {
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
function goToFrame(index: number) {
  transcript.value?.querySelector(`[data-frame-index="${index}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlighted.value = index
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlighted.value = null), 1600)
}

// --- 3D, by model (experimental): SHARP, TripoSplat and LiTo (PictureButtons).

/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)

// --- Voices: the Character speaks their lines.

/** New Replies are spoken as they arrive; remembered per browser. */
const autoplay = useStoredFlag('roleplay-voice-autoplay')
/** Which extras are on: off, their buttons are hidden, but what they made still plays and opens. */
const { on: featureOn } = useFeatures()
/** A line can be listened to: voices are on, or it was already spoken. */
const canListen = (speech: Speech | undefined) => featureOn.value('voices') || spokenNow(speech)
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
/** The Frames as shown (the server tidies each Reply as it saves it). */
const shownFrames = computed(() => session.value?.frames ?? [])
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
      if (autoplay.value && featureOn.value('voices') && canSpeak(event.frame)) {
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
              v-if="featureOn('voices')"
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
                      v-if="canSpeak(frame, 'thought') && canListen(frame.thoughtSpeech)"
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
                    <UndirectedNote
                      v-if="spokenNow(frame.thoughtSpeech) && frame.thoughtSpeech?.undirected"
                      class="ml-1.5"
                      :reason="frame.thoughtSpeech.undirected"
                      :busy="hasJob(frame.index, 'speak-thought')"
                      @again="queue('speak-thought', frame.index)"
                    />
                  </p>
                  <p v-if="frame.reply.actions" class="max-w-prose italic" data-actions>
                    {{ frame.reply.actions }}
                  </p>
                  <p v-if="frame.reply.dialogue" class="max-w-prose text-lg" data-dialogue>
                    “{{ frame.reply.dialogue }}”
                  </p>
                  <div class="flex max-w-prose flex-col gap-1 text-xs" data-picture>
                    <FrameJobs
                      :jobs="frameJobs(frame.index)"
                      :describe="describeJob"
                      @retry="retry"
                      @drop="dropJob"
                    />
                    <p class="flex flex-wrap items-center gap-1.5">
                      <button
                        v-if="canSpeak(frame) && canListen(frame.speech)"
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
                      <UndirectedNote
                        v-if="spokenNow(frame.speech) && frame.speech?.undirected"
                        class="mr-1.5"
                        :reason="frame.speech.undirected"
                        :busy="hasJob(frame.index, 'speak')"
                        @again="queue('speak', frame.index)"
                      />
                      <button
                        v-if="featureOn('images')"
                        type="button"
                        class="action"
                        :disabled="hasJob(frame.index, 'picture')"
                        data-picture-button
                        @click="queue('picture', frame.index)"
                      >
                        {{ frame.promptText ? 'Picture again' : 'Picture this' }}
                      </button>
                      <PictureButtons
                        :frame="frame"
                        :has-job="(kind) => hasJob(frame.index, kind)"
                        :can-render="(!!frame.promptText && !frame.blocked) || hasJob(frame.index, 'picture')"
                        @queue="(kind) => queue(kind, frame.index)"
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
          <JobQueue
            v-else
            :jobs="jobs"
            :describe="describeJob"
            @go="goToFrame"
            @retry="retry"
            @drop="dropJob"
          />
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
        <!-- Its border sweeps while the voice is designed, slower while that waits its turn. -->
        <form
          v-if="cast && featureOn('voices')"
          class="flex flex-col gap-2 border-b border-line p-4 text-sm"
          :class="{ 'render-sweep': designingVoice }"
          :data-rendering="voiceJob?.status === 'queued' ? 'queued' : undefined"
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
            >{{ jobStatus(voiceJob, describeJob) }}</span>
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
        <!-- Its border sweeps while the Cast is written, or written again. -->
        <section class="rounded-md" :class="{ 'render-sweep': writingCast }" data-cast>
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
        </section>
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
