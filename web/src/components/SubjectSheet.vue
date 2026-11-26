<script setup lang="ts">
import { computed, ref } from 'vue'
import { changeSheet, imageUrl, type Job, type Sheet } from '../api'
import { diffWords } from '../diff'
import { jobStatus } from '../jobs'
import Icon from './Icon.vue'

/**
 * A Subject's reference sheet, under its identity in the Look (ADR 0045):
 * the sheet, or its job's state while it's made; Redo, and Change…, which has the Text Model
 * rewrite the identity with a note and shows it before the sheet is made again from it (`change`,
 * which the Look saves). Unticked, it greys with its buttons. Once the story has begun (`settled`),
 * it's shown alone, with how to change it.
 */
const props = defineProps<{
  sessionId: string
  /** The Subject's name, as saved in the Look. */
  subject: string
  /** Its identity as saved, which Change… rewrites. */
  identity: string
  sheet: Sheet
  /** Its sheet job, while it's queued, running or failed. */
  job?: Job
  /** The story has begun: no more changes. */
  settled: boolean
  /** How to change it once settled: "Restart to change it." */
  settledText: string
  disabled?: boolean
}>()
const emit = defineEmits<{ redo: []; change: [identity: string] }>()

const making = computed(() => !!props.job && props.job.status !== 'failed')
const failed = computed(() => (props.job?.status === 'failed' ? props.job.error : null))
const off = computed(() => !props.sheet.ticked)

/** What the job's doing, where the sheet will be. */
function describe(job: Job): string | undefined {
  if (job.phase !== 'queued' && job.phase !== 'image') return undefined
  return job.phase === 'queued' ? 'waiting for another render' : undefined
}
const makingText = computed(() => {
  const job = props.job!
  const state = job.status === 'queued' ? 'queued' : jobStatus(job, describe).replace('… ', ', ').replace(/…$/, '')
  return `Making ${props.subject}'s sheet · ${state.charAt(0).toLowerCase()}${state.slice(1)}`
})

// --- Change…

const changing = ref(false)
const note = ref('')
const rewriting = ref(false)
const rewritten = ref<string | null>(null)
const problem = ref('')
let stop: AbortController | null = null

function openChange() {
  changing.value = true
  note.value = ''
  rewritten.value = null
  problem.value = ''
}
function closeChange() {
  stop?.abort()
  changing.value = false
  rewriting.value = false
}

async function rewrite() {
  if (!note.value.trim() || rewriting.value) return
  rewriting.value = true
  problem.value = ''
  rewritten.value = null
  stop = new AbortController()
  const signal = stop.signal
  try {
    await changeSheet(props.sessionId, props.subject, note.value.trim(), (event) => {
      if (signal.aborted) return
      if (event.type === 'identity') rewritten.value = event.identity
      else if (event.type === 'failed') problem.value = event.message
    })
  } catch (err) {
    if (!signal.aborted) problem.value = (err as Error).message
  } finally {
    rewriting.value = false
  }
}

/** The rewritten identity, what's new in it marked. */
const parts = computed(() =>
  rewritten.value === null
    ? []
    : diffWords(props.identity, rewritten.value).filter((p) => p.kind !== 'removed')
)

function makeIt() {
  if (rewritten.value === null) return
  emit('change', rewritten.value)
  closeChange()
}
</script>

<template>
  <div class="flex flex-col gap-1.5" :data-sheet="subject">
    <!-- The sheet: three views side by side, so as wide as the panel lets it be. -->
    <div
      class="relative grid aspect-[1536/640] w-full place-items-center overflow-hidden rounded-lg border border-line bg-canvas"
      :class="{ 'opacity-45 grayscale': off && !settled, 'render-sweep': making }"
      :data-rendering="job?.status === 'queued' ? 'queued' : undefined"
    >
      <img
        v-if="sheet.made"
        :src="imageUrl(sessionId, sheet.made.file)"
        :alt="`${subject}'s reference sheet: front, three-quarter and profile`"
        class="absolute inset-0 h-full w-full object-cover"
        data-sheet-image
      >
      <span v-if="making" class="relative flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-xs text-muted" data-sheet-making>
        <Icon name="spinner" class="animate-spin" />{{ makingText }}
      </span>
      <span v-else-if="failed" class="relative px-3 text-center text-xs text-danger" data-sheet-failed>
        Couldn't make it: {{ failed }}
      </span>
      <span v-else-if="!sheet.made" class="relative text-xs text-muted" data-sheet-none>
        {{ off ? 'No sheet' : 'Not made yet' }}
      </span>
    </div>

    <!-- Made twice and found unfit both times (`flaw`): kept, as the player may want it anyway. -->
    <p v-if="sheet.made?.flaw && !making" class="text-xs text-warn" data-sheet-flaw>
      Made twice, and unfit both times: {{ sheet.made.flaw }}
      <template v-if="!settled">The faces are repainted from it as it is: Redo, or Change… it.</template>
    </p>

    <p v-if="settled" class="text-xs text-muted" data-sheet-settled>{{ settledText }}</p>

    <div v-else-if="!changing" class="flex gap-1.5 max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center max-sm:[&>button]:py-2">
      <button
        type="button"
        class="flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs text-fg hover:border-fg disabled:opacity-50"
        :disabled="disabled || off || making"
        title="Make it again with another seed"
        data-sheet-redo
        @click="emit('redo')"
      >
        <Icon name="retry" />Redo
      </button>
      <button
        type="button"
        class="flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs text-fg hover:border-fg disabled:opacity-50"
        :disabled="disabled || off"
        :title="`Say what to change about ${subject}: the identity is rewritten with it, then the sheet made again`"
        data-sheet-change
        @click="openChange"
      >
        <Icon name="brush" />Change…
      </button>
    </div>

    <!-- Change…: a note, the identity rewritten with it, then the sheet made again from it. -->
    <form v-else class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2.5 text-xs" data-sheet-changing @submit.prevent="rewritten === null ? rewrite() : makeIt()">
      <b class="text-sm text-fg">Change {{ subject }}</b>
      <input
        v-model="note"
        class="field text-sm"
        placeholder="fewer scars, green eyes, longer hair…"
        maxlength="500"
        :disabled="rewriting"
        aria-label="What to change"
        data-sheet-note
        @input="rewritten = null"
      >
      <template v-if="rewritten !== null">
        <span class="text-muted">The identity becomes:</span>
        <p class="rounded border border-line bg-canvas p-2 text-sm text-fg" data-sheet-rewritten>
          <template v-for="(part, i) in parts" :key="i">
            <u v-if="part.kind === 'added'" class="decoration-info decoration-2 underline-offset-2" data-diff="added">{{ part.text }}</u>
            <template v-else>{{ part.text }}</template>{{ i < parts.length - 1 ? ' ' : '' }}
          </template>
        </p>
      </template>
      <p v-if="rewriting" class="animate-pulse text-info">Rewriting the identity…</p>
      <p v-if="problem" class="text-danger" role="alert">{{ problem }}</p>
      <div class="flex justify-end gap-1.5">
        <button type="button" class="rounded border border-line px-2.5 py-1 hover:border-fg" data-sheet-change-cancel @click="closeChange">
          Cancel
        </button>
        <button
          v-if="rewritten === null"
          type="submit"
          class="rounded bg-fg px-2.5 py-1 font-medium text-canvas disabled:opacity-50"
          :disabled="!note.trim() || rewriting || disabled"
          data-sheet-rewrite
        >
          Rewrite
        </button>
        <button
          v-else
          type="submit"
          class="rounded bg-fg px-2.5 py-1 font-medium text-canvas disabled:opacity-50"
          :disabled="disabled"
          data-sheet-make
        >
          Make the sheet
        </button>
      </div>
    </form>
  </div>
</template>
