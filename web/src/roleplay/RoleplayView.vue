<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, cancelFrame, getSession } from '../api'
import { clearCurrentSession, setCurrentSession } from '../composables/useCurrentSession'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredText } from '../composables/useStoredText'
import { sessionPath } from '../sessionPath'
import {
  type Cast,
  type Reply,
  type RoleplayEvent,
  type RoleplaySession,
  beginRoleplay,
  saveCast,
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

// Keep the newest exchange in view.
watch([() => session.value?.frames.length, () => pending.value?.reply, () => pending.value?.message], async () => {
  await nextTick()
  // Jump on opening; glide while a reply comes in.
  transcript.value?.scrollTo({
    top: transcript.value.scrollHeight,
    behavior: pending.value ? 'smooth' : 'auto',
  })
})

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
            <li class="flex flex-col gap-1.5" data-reply>
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
          <template v-if="pending && !pending.detached && pending.kind !== 'cast'">
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
            :class="{ 'render-sweep': busy && !pending?.cancelling }"
            :data-writing="busy ? '' : undefined"
          >
            <textarea
              v-model="draft"
              class="h-20 flex-1 resize-none rounded-lg border border-line bg-surface p-3 disabled:opacity-60"
              :placeholder="`What ${personaName} says or does… (Enter to send, Shift+Enter for a new line)`"
              :disabled="busy || !begun"
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

      <aside class="flex w-80 flex-col border-l border-line xl:w-96" data-cast-panel>
        <h2 class="border-b border-line px-4 py-2 text-sm font-medium">Cast</h2>
        <p v-if="!castDraft" class="p-4 text-sm text-muted">
          <span v-if="busy" class="animate-pulse">Writing the Cast from your Brief…</span>
          <template v-else>No Cast yet.</template>
        </p>
        <form v-else class="flex flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm" @submit.prevent="saveCastDraft">
          <fieldset v-for="g in GROUPS" :key="g.id" class="flex flex-col gap-2">
            <legend class="mb-1 font-medium">{{ g.title() }}</legend>
            <label v-for="f in CAST_FIELDS.filter((f) => f.group === g.id)" :key="f.key" class="flex flex-col gap-1 text-xs text-muted">
              {{ f.label }}
              <textarea
                v-if="f.long"
                :value="fieldValue(f)"
                rows="5"
                class="resize-y rounded border border-line bg-surface p-2 text-sm text-fg"
                :disabled="busy"
                :data-field="`${g.id}.${f.key}`"
                @input="setField(f, ($event.target as HTMLTextAreaElement).value)"
              />
              <input
                v-else
                :value="fieldValue(f)"
                :type="f.key === 'age' ? 'number' : 'text'"
                :min="f.key === 'age' ? 18 : undefined"
                class="rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
                :disabled="busy"
                :data-field="`${g.id}.${f.key}`"
                @input="setField(f, ($event.target as HTMLInputElement).value)"
              />
            </label>
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
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>
  </div>
</template>
