<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  toRaw,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import {
  ApiError,
  cancelFrame,
  type Activity,
  DOWNLOADING,
  editStoryboardFrame,
  getSession,
  imageUrl,
  type Look,
  type Made3d,
  MAX_SHOWN,
  type Outcome,
  planStoryboard,
  saveFrameBody,
  saveLook,
  type StoryboardEvent,
  type StoryboardFrame,
  type StoryboardSession,
} from '../api'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ComposeBox from '../components/ComposeBox.vue'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameImage from '../components/FrameImage.vue'
import FrameViewer from '../components/FrameViewer.vue'
import JobQueue from '../components/JobQueue.vue'
import LookPerson from '../components/LookPerson.vue'
import PictureButtons from '../components/PictureButtons.vue'
import { useFeatures } from '../composables/useFeatures'
import { useJobs } from '../composables/useJobs'
import { JOB_NAMES, jobForming, jobStatus, sweepOf } from '../jobs'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredText } from '../composables/useStoredText'
import { sessionPath } from '../sessionPath'

const props = defineProps<{ id: string }>()
const router = useRouter()

const session = ref<StoryboardSession | null>(null)
const loadError = ref('')
/** The Frame shown in the main panel and edited in the Prompt panel. */
const selected = ref(0)
const panel = ref<'frames' | 'prompt'>('frames')
const message = ref<{ kind: 'error' | Outcome; text: string } | null>(null)

/**
 * The Storyboard's own work in progress, which holds it until done: the plan, or an edit. Renders,
 * upscales and 3D are queued jobs instead (`useJobs`), so editing carries on beside them.
 */
interface Work {
  kind: 'plan' | 'edit'
  phase: Activity
  frameIndex: number | null
  progress?: { step: number; total: number }
  cancelling?: boolean
  /** Started elsewhere (another tab); followed by polling. */
  detached?: boolean
}
const work = ref<Work | null>(null)

/** What the plan has produced so far, shown while it streams in. */
const planning = ref<{ look: Look | null; beats: string[]; frames: StoryboardFrame[] } | null>(null)

const busy = computed(() => work.value !== null)
const planned = computed(() => (session.value?.frames.length ?? 0) > 0)

/** The Frames to list: the saved ones, or the plan as it arrives. */
const frames = computed<(StoryboardFrame | { index: number; beat: string; pending: true })[]>(() => {
  if (planned.value || !planning.value) return session.value?.frames ?? []
  return planning.value.beats.map((beat, index) =>
    planning.value!.frames[index] ?? { index, beat, pending: true as const }
  )
})
const current = computed(() => {
  const f = frames.value[selected.value]
  return f && !('pending' in f) ? f : null
})
const look = computed(() => session.value?.look ?? planning.value?.look ?? null)

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
  setCurrentSession(props.id, 'storyboard')
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
    kind: s.frames.length ? 'edit' : 'plan',
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
  planning.value = { look: null, beats: [], frames: [] }
  await run({ kind: 'plan', phase: 'text', frameIndex: null }, () =>
    planStoryboard(props.id, (event) => {
      if (track(event)) return
      const p = planning.value!
      // The Look comes first, so a new one means a retry started the plan over.
      if (event.type === 'look') planning.value = { look: event.look, beats: [], frames: [] }
      else if (event.type === 'beats') p.beats = event.beats
      else if (event.type === 'planned-frame') p.frames[event.frame.index] = event.frame
      else if (event.type === 'planned') {
        session.value = event.session
        planning.value = null
      }
    }))
}

// --- Queued work: renders, upscales and 3D, each on its Frame.

const { jobs, jobsFor, hasJob, queue, dropJob, retry } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (text) => (message.value = { kind: 'error', text }),
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
    !f.blocked && (!f.image || f.stale) && !hasJob(f.index, 'render')
  )
)
/** Queues a render of every Frame that needs one, in order. */
async function renderAll() {
  for (const frame of toRender.value.slice()) await queue('render', frame.index)
}

async function cancel() {
  if (work.value) work.value = { ...work.value, cancelling: true }
  await cancelFrame(props.id)
}

// --- Editing.

/** The unsent Action, remembered per Session so it survives a reload. */
const draft = useStoredText(`draft:${props.id}`)
async function sendAction() {
  const action = draft.value.trim()
  if (!action || busy.value || !current.value) return
  const index = current.value.index
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
 * Hand edits: the selected Frame's sentences and who it shows, and the Look. Reset when the source
 * changes.
 */
const bodyDraft = ref('')
const shownDraft = ref<string[]>([])
const lookDraft = ref<Look>({ people: [], style: '' })
const shownNow = computed(() => current.value?.shown ?? [])
watch(() => current.value?.body, (body) => (bodyDraft.value = body ?? ''), { immediate: true })
watch(shownNow, (shown) => (shownDraft.value = [...shown]), { immediate: true })
watch(look, (l) => (lookDraft.value = structuredClone(toRaw(l) ?? { people: [], style: '' })), {
  immediate: true,
})
const bodyChanged = computed(() =>
  !!current.value &&
  (bodyDraft.value.trim() !== current.value.body ||
    shownDraft.value.join('\n') !== shownNow.value.join('\n'))
)
const trimmed = (l: Look): Look => ({
  people: l.people.map((p) => ({ name: p.name.trim(), identity: p.identity.trim() })),
  style: l.style.trim(),
})
const lookChanged = computed(() =>
  !!look.value && JSON.stringify(trimmed(lookDraft.value)) !== JSON.stringify(look.value)
)
/** Shows or hides a person in the selected Frame; one added is the least prominent. */
function toggleShown(name: string) {
  const shown = shownDraft.value
  shownDraft.value = shown.includes(name) ? shown.filter((n) => n !== name) : [...shown, name]
}

async function save(call: () => Promise<StoryboardSession>, done: string) {
  message.value = null
  try {
    session.value = await call()
    message.value = { kind: 'done', text: done }
  } catch (err) {
    message.value = { kind: 'error', text: (err as Error).message }
  }
}
const saveBody = () =>
  save(
    () => saveFrameBody(props.id, current.value!.index, bodyDraft.value, shownDraft.value),
    `Frame ${current.value!.index + 1} saved.`,
  )
const saveLookDraft = () => save(() => saveLook(props.id, lookDraft.value), 'Look saved for every Frame.')

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
  if (f.blocked) return { label: 'Blocked', tone: 'text-danger' }
  if (!f.image) return { label: 'Draft', tone: 'text-muted' }
  if (f.stale) return { label: 'Changed since render', tone: 'text-warn' }
  if (f.upscaled) return { label: 'Upscaled', tone: 'text-ok' }
  return { label: 'Rendered', tone: 'text-ok' }
}

const statusLabel = computed(() => {
  const w = work.value
  if (!w) return ''
  if (w.cancelling) return 'Cancelling…'
  if (w.kind === 'plan') {
    const written = planning.value?.frames.filter(Boolean).length ?? 0
    const total = planning.value?.beats.length || session.value?.frameCount || 0
    if (!planning.value?.look) return 'Planning the Storyboard…'
    return `Writing Frame ${Math.min(written + 1, total)} of ${total}…`
  }
  if (w.phase === 'download') return DOWNLOADING
  return `Editing Frame ${(w.frameIndex ?? 0) + 1}…`
})

/** The image frame sweeps while a job makes the selected Frame's picture; the text box while it's edited. */
const renderingHere = computed(() => sweepOf(selectedJob.value?.phase))
/** The picture forming, over the frame, while a job renders the selected Frame. */
const forming = computed(() => jobForming(session.value, selectedJob.value))
const editingHere = computed(() => work.value?.kind === 'edit' && work.value.frameIndex === selected.value)

const timingsLabel = (f: StoryboardFrame) => {
  const t = f.timings
  if (!t) return ''
  const parts = [`Text ${t.text.toFixed(1)} s`]
  if (t.queued !== undefined) parts.push(`Waited ${t.queued.toFixed(1)} s`)
  if (t.image !== null) parts.push(`Image ${t.image.toFixed(1)} s`)
  return parts.join(' · ')
}

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)
const frameTitle = (index: number) => `Frame ${index + 1}`
/** Rendering needs pictures on; off, a Storyboard's plan can still be read and edited. */
const { on: featureOn } = useFeatures()
const imagesOn = computed(() => featureOn.value('images'))
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Storyboard: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <FrameImage
          :src="current?.image ? imageUrl(session.id, current.upscaled ?? current.image) : null"
          :alt="current?.prompt"
          :rendering="renderingHere"
          :preview="forming"
          :hide-size="busy"
          :empty-text="current ? (current.blocked ? 'Blocked: edit this Frame first' : 'Not rendered yet') : 'Planning…'"
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
              :placeholder="current
              ? `What to change in Frame ${current.index + 1}… (Enter to send, Shift+Enter for a new line)`
              : 'Frames can be edited once the plan is written.'"
              :disabled="busy || !current"
              @send="sendAction"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="!busy">
              <button
                type="button"
                class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
                :disabled="!draft.trim() || !current"
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
              v-if="current"
              :frame="current"
              :has-job="(kind) => hasJob(current!.index, kind)"
              :can-render="!current.blocked"
              button-class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              @queue="(kind) => queue(kind, current!.index)"
              @view="(kind) => (open3d = { index: current!.index, kind })"
            />
            <button
              v-if="imagesOn && planned"
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!toRender.length"
              title="Queue a render of every Frame not rendered yet, or changed since"
              data-render-all
              @click="renderAll"
            >
              Render all{{ toRender.length ? ` (${toRender.length})` : '' }}
            </button>
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

      <!-- Narrow windows: Frames and Prompt as tabs. From xl up: side by side, tabs hidden. -->
      <aside class="flex w-80 flex-col border-l border-line xl:w-auto xl:flex-row">
        <div role="tablist" class="flex border-b border-line text-sm xl:hidden">
          <button
            v-for="tab in [{ id: 'frames', label: 'Frames' }, { id: 'prompt', label: 'Prompt' }] as const"
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
          :class="panel === 'frames' ? 'flex' : 'hidden xl:flex'"
          data-frames-panel
        >
          <h2 class="hidden border-b border-line px-4 py-2 text-sm font-medium xl:block">Frames</h2>
          <!-- The queue, while there's any: what's running, queued and failed. -->
          <JobQueue
            v-if="jobs.length"
            class="max-h-48 shrink-0 overflow-y-auto border-b border-line"
            :jobs="jobs"
            :name="frameTitle"
            data-queue
            @go="(index) => (selected = index)"
            @retry="retry"
            @drop="dropJob"
          />
          <ol class="flex-1 overflow-y-auto" role="tabpanel">
            <li v-for="f in frames" :key="f.index">
              <button
                type="button"
                class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
                :class="{ 'bg-surface': selected === f.index }"
                :aria-current="selected === f.index"
                data-frame
                @click="selected = f.index"
              >
                <img
                  v-if="'image' in f && f.image"
                  :src="imageUrl(session.id, f.image)"
                  alt=""
                  class="h-20 w-14 shrink-0 rounded object-cover"
                  :class="{ 'opacity-50': f.stale }"
                />
                <span
                  v-else
                  class="flex h-20 w-14 shrink-0 items-center justify-center rounded border border-dashed border-line text-muted"
                >
                  {{ f.index + 1 }}
                </span>
                <span class="flex min-w-0 flex-col gap-1">
                  <span class="line-clamp-3">{{ f.beat }}</span>
                  <span v-if="'pending' in f" class="animate-pulse text-xs text-muted">Writing…</span>
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

            <form v-else class="flex min-w-0 flex-col gap-2" data-look @submit.prevent="saveLookDraft">
              <h3 class="font-medium">Look <span class="font-normal text-muted">· every Frame</span></h3>
              <LookPerson
                v-for="(person, i) in lookDraft.people"
                :id="`storyboard.look.person.${i}`"
                :key="i"
                v-model:name="person.name"
                v-model:identity="person.identity"
                :disabled="busy"
                @remove="lookDraft.people.splice(i, 1)"
              />
              <button
                type="button"
                class="w-fit text-xs text-muted hover:text-fg disabled:opacity-50"
                :disabled="busy"
                data-add-person
                @click="lookDraft.people.push({ name: '', identity: '' })"
              >
                + Add a person
              </button>
              <CollapsibleTextarea
                id="storyboard.look.style"
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

            <form v-if="current" class="flex min-w-0 flex-col gap-2" data-frame-editor @submit.prevent="saveBody">
              <h3 class="font-medium">
                Frame {{ current.index + 1 }}
                <span class="font-normal text-muted">· {{ current.beat }}</span>
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
                  :aria-pressed="shownDraft.includes(person.name)"
                  :disabled="busy"
                  @click="toggleShown(person.name)"
                >
                  {{ person.name }}
                </button>
                <span v-if="!shownDraft.length" class="text-muted">· the place alone</span>
                <span v-else-if="shownDraft.length > MAX_SHOWN" class="text-muted">
                  · only the first {{ MAX_SHOWN }} are described
                </span>
              </div>
              <CollapsibleTextarea
                id="storyboard.frame"
                v-model="bodyDraft"
                label="The Frame's seven sentences"
                :disabled="busy"
              />
              <button
                v-if="bodyChanged"
                type="submit"
                class="w-fit rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
                :disabled="busy"
              >
                Save Frame {{ current.index + 1 }}
              </button>
              <details class="text-muted" open>
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
