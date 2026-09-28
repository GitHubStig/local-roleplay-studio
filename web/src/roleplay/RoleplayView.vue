<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, cancelFrame, getSession, imageUrl } from '../api'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredText } from '../composables/useStoredText'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ImageViewer from '../components/ImageViewer.vue'
import { sessionPath } from '../sessionPath'
import {
  type Cast,
  type Reply,
  type RoleplayEvent,
  type RoleplayLook,
  type RoleplaySession,
  type Shown,
  beginRoleplay,
  cancelJob,
  type Job,
  type JobKind,
  listJobs,
  queueJob,
  retryJob,
  saveCast,
  saveLook,
  sendMessage,
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
  kind: 'cast' | 'begin' | 'message'
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
// --- Background work: pictures, renders and upscales, queued on the server.

/** The Roleplay's jobs: running, then queued, then failed (until dismissed). */
const jobs = ref<Job[]>([])
const openJobs = computed(() => jobs.value.filter((j) => j.status !== 'failed'))
const runningJob = computed(() => jobs.value.find((j) => j.status === 'running') ?? null)
const jobsFor = (index: number) => jobs.value.filter((j) => j.frameIndex === index)
/** A job of this kind is already queued or running on this Frame. */
const hasJob = (index: number, kind: JobKind) =>
  openJobs.value.some((j) => j.frameIndex === index && j.kind === kind)

const JOB_NAMES: Record<JobKind, string> = {
  picture: 'Picture',
  render: 'Render',
  upscale: 'Upscale',
}

/** What a job is doing, in a few words. */
function jobStatus(job: Job): string {
  if (job.status === 'failed') return `Failed: ${job.error}`
  if (job.status === 'queued') return 'Queued'
  if (job.kind === 'picture') {
    return currentLook.value ? 'Picturing this moment…' : 'Writing the Look, then picturing…'
  }
  if (job.phase === 'queued') return 'Waiting for another render…'
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

// --- The picture viewer: ← and → step through the rendered Frames.

/** The Frames with a rendered picture, in order. */
const rendered = computed(() => (session.value?.frames ?? []).filter((f) => f.image))
const viewed = computed(() => rendered.value.findIndex((f) => f.index === viewing.value))
const viewer = computed(() => {
  const frame = viewed.value >= 0 ? rendered.value[viewed.value] : null
  if (!frame || !session.value) return null
  return {
    src: imageUrl(session.value.id, frame.upscaled ?? frame.image!),
    alt: `Picture of Frame ${frame.index}`,
    label: `Frame ${frame.index} · ${viewed.value + 1} of ${rendered.value.length}`,
  }
})
/** Shows the rendered Frame `step` places away, and scrolls the conversation behind to it. */
function stepViewer(step: number) {
  const frame = rendered.value[viewed.value + step]
  if (!frame) return
  viewing.value = frame.index
  goToFrame(frame.index)
}

/** The side panel's tab: the Look and Cast, or the queue. */
const sideTab = ref<'cast' | 'queue'>('cast')

const cast = computed(() => session.value?.cast ?? null)
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
window.addEventListener('beforeunload', warnBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

const statusLabel = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.cancelling) return 'Cancelling…'
  if (p.detached) return 'A reply is being written in another tab…'
  if (p.kind === 'cast') return cast.value ? 'Rewriting the Cast…' : 'Writing the Cast…'
  if (p.kind === 'begin') return `${characterName.value} is starting the scene…`
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
  { group: 'setting', key: 'time', label: 'Time' },
  { group: 'setting', key: 'weather', label: 'Weather' },
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
          <label class="flex shrink-0 cursor-pointer items-center gap-1.5 text-muted">
            <input v-model="thoughtsHidden" type="checkbox" data-hide-thoughts />
            Hide thoughts
          </label>
        </div>

        <ol
          ref="transcript"
          @scroll.passive="onTranscriptScroll"
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface p-4"
          data-transcript
        >
          <template v-for="frame in session.frames" :key="frame.index">
            <li v-if="frame.message !== null" class="flex flex-col items-end gap-1" data-message>
              <span class="text-xs text-muted">{{ personaName }}</span>
              <p class="max-w-prose whitespace-pre-wrap rounded-lg bg-fg px-3 py-2 text-canvas">
                {{ frame.message }}
              </p>
            </li>
            <li
              class="-mx-2 rounded-lg p-2 transition-shadow duration-500"
              :class="{
                'render-sweep': runningJob?.frameIndex === frame.index,
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
                    <p class="flex flex-wrap items-center gap-x-3">
                      <button
                        type="button"
                        class="text-muted underline-offset-2 hover:text-fg hover:underline disabled:opacity-50"
                        :disabled="hasJob(frame.index, 'picture')"
                        data-picture-button
                        @click="queue('picture', frame.index)"
                      >
                        {{ frame.promptText ? 'Picture again' : 'Picture this' }}
                      </button>
                      <button
                        v-if="(frame.promptText && !frame.blocked) || hasJob(frame.index, 'picture')"
                        type="button"
                        class="text-muted underline-offset-2 hover:text-fg hover:underline disabled:opacity-50"
                        :disabled="hasJob(frame.index, 'render')"
                        data-render-button
                        @click="queue('render', frame.index)"
                      >
                        {{ frame.image ? 'Re-render' : 'Render' }}
                      </button>
                      <button
                        v-if="frame.image || hasJob(frame.index, 'render')"
                        type="button"
                        class="text-muted underline-offset-2 hover:text-fg hover:underline disabled:opacity-50"
                        :disabled="!!frame.upscaled || hasJob(frame.index, 'upscale')"
                        :title="frame.upscaled ? 'Upscaled to 2048 px' : 'Upscale to 2048 px with SeedVR2'"
                        data-upscale-button
                        @click="queue('upscale', frame.index)"
                      >
                        {{ frame.upscaled ? 'Upscaled' : 'Upscale' }}
                      </button>
                    </p>
                    <details v-if="frame.promptText" class="text-muted" data-image-prompt>
                      <summary class="cursor-pointer select-none">
                        Image Prompt
                        <span v-if="frame.blocked" class="text-warn">· crosses a limit ({{ frame.blocked }})</span>
                      </summary>
                      <p class="mt-1" data-shown>Shows {{ shownNames(frame.shown) }}</p>
                      <p class="mt-1 leading-relaxed">{{ frame.promptText }}</p>
                      <p v-if="frame.pictureTimings" class="mt-1" data-picture-timings>
                        Pictured in {{ frame.pictureTimings.text.toFixed(1) }} s
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
          <template
            v-if="pending && !pending.detached && pending.kind !== 'cast'"
          >
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
            :class="{ 'render-sweep': replying && !pending?.cancelling }"
            :data-writing="replying ? '' : undefined"
          >
            <textarea
              v-model="draft"
              class="h-20 flex-1 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
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
        <h2 class="border-b border-line px-4 py-2 text-sm font-medium">Cast</h2>
        <p v-if="!castDraft" class="p-4 text-sm text-muted">
          <span v-if="busy" class="animate-pulse">Writing the Cast from your Brief…</span>
          <template v-else>No Cast yet.</template>
        </p>
        <form v-else class="flex flex-col gap-5 p-4 text-sm" @submit.prevent="saveCastDraft">
          <fieldset v-for="g in GROUPS" :key="g.id" class="flex flex-col gap-2">
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

    <ImageViewer
      :src="viewer?.src ?? null"
      :alt="viewer?.alt"
      :label="viewer?.label"
      :has-previous="viewed > 0"
      :has-next="viewed >= 0 && viewed < rendered.length - 1"
      @previous="stepViewer(-1)"
      @next="stepViewer(1)"
      @close="viewing = null"
    />
  </div>
</template>
