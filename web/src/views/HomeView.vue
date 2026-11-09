<script setup lang="ts">
import { useElementSize, useMediaQuery } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteSession,
  imageUrl,
  listSessions,
  KIND_LABELS,
  type SessionSummary,
} from '../api'
import { ago } from '../ago'
import { ask } from '../ask'
import Icon from '../components/Icon.vue'
import SplitHandle from '../components/SplitHandle.vue'
import StartSession from '../components/StartSession.vue'
import { tabStorage, useStoredString } from '../composables/storage'
import { clearCurrentSession, useCurrentSession } from '../composables/useCurrentSession'
import { sessionPath } from '../sessionPath'

const route = useRoute()
const router = useRouter()
const { currentSessionId } = useCurrentSession()

const sessions = ref<SessionSummary[] | null>(null)
const listError = ref('')
const CARD_REM = 12
const GAP_REM = 1
/** Where the Sessions go: the page's width, or its left column in an ultrawide window. */
const sessionsArea = useTemplateRef('sessionsArea')
const { width: pageWidth } = useElementSize(sessionsArea)
/** The Sessions section is as wide as the columns that fit (or are needed), so it centres as a block. */
const sessionsWidth = computed(() => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const fit = Math.floor((pageWidth.value / rem + GAP_REM) / (CARD_REM + GAP_REM))
  const columns = Math.min(fit, sessions.value?.length ?? 0)
  if (columns < 1) return undefined
  return `${columns * CARD_REM + (columns - 1) * GAP_REM}rem`
})
const deleteError = ref('')
/** Why the last Session failed to start: its Opening Frame errored. */
const startError = ref('')
/** An ultrawide window (Tailwind's `wide`), where Start a new Session has a pane of its own, always open. */
const wide = useMediaQuery('(min-width: 140rem)')
/**
 * There, the New Session pane's width in px, set by the splitter and remembered per browser;
 * double-clicking the splitter forgets it, back to the default.
 */
const START_WIDTH = 704
const START_MIN = 448
const SESSIONS_MIN = 480
const storedWidth = useStoredString('home.start-width')
const startWidth = computed({
  get: () => Number(storedWidth.value) || START_WIDTH,
  set: (px: number) => (storedWidth.value = String(px)),
})
/**
 * Whether Start a new Session is open under its button, remembered for this tab as it's opened or
 * closed; until then closed while there are Sessions, open when there are none yet (null until the
 * list first loads).
 */
const openStored = useStoredString('home.new-session-open', tabStorage())
const startOpen = computed<boolean | null>({
  get: () =>
    openStored.value !== null
      ? openStored.value === '1'
      : sessions.value && sessions.value.length === 0,
  set: (open) => (openStored.value = open ? '1' : '0'),
})

let poll: ReturnType<typeof setTimeout> | undefined
let alive = true

/** Loads the list; while any Session has a Frame running, refreshes every 2 s to track it. */
async function load() {
  clearTimeout(poll)
  try {
    const list = await listSessions()
    if (!alive) return
    sessions.value = list
    listError.value = ''
  } catch (err) {
    if (alive) listError.value = (err as Error).message
    return
  }
  if (sessions.value.some((s) => s.activity)) poll = setTimeout(load, 2000)
}

onMounted(load)
onBeforeUnmount(() => {
  alive = false
  clearTimeout(poll)
})

// A failed Opening Frame sends the player here with `?error=`, possibly while already on Home.
// It's shown once, then dropped from the address so a refresh doesn't bring it back.
watch(
  () => route.query.error,
  (error) => {
    if (typeof error !== 'string') return
    startError.value = error
    startOpen.value = true
    router.replace({ query: { ...route.query, error: undefined } })
    load()
  },
  { immediate: true },
)

async function remove(s: SessionSummary) {
  const what = `${s.title}, ${s.frames} ${s.frames === 1 ? 'Frame' : 'Frames'}`
  const question = `Delete this Session (${what}) and its images? This can't be undone.`
  if (!(await ask(question, { action: 'Delete', danger: true }))) return
  deleteError.value = ''
  try {
    await deleteSession(s.id)
    clearCurrentSession(s.id)
    try {
      localStorage.removeItem(`draft:${s.id}`)
    } catch {
      // Nothing stored.
    }
  } catch (err) {
    deleteError.value = (err as Error).message
  }
  await load()
}

const ACTIVITY_LABELS = {
  text: 'Writing…',
  queued: 'Waiting for another render…',
  image: 'Rendering…',
  audio: 'Speaking…',
  download: 'Downloading a model…',
} as const

</script>

<template>
  <!-- In an ultrawide window, two panes that scroll on their own, a splitter between them: the
       Sessions on the left, starting one on the right, each centred in its pane. -->
  <div class="overflow-y-auto p-6 wide:flex wide:flex-row-reverse wide:overflow-hidden wide:p-0">
    <div
      class="wide:shrink-0 wide:overflow-y-auto wide:p-6"
      :style="wide ? { width: `${startWidth}px` } : undefined"
      data-start-pane
    >
      <div class="mx-auto flex w-full max-w-4xl flex-col items-center gap-6">
        <button
          v-if="!wide"
          type="button"
          class="flex items-center gap-2 rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
          :aria-expanded="!!startOpen"
          data-new-session
          @click="startOpen = !startOpen"
        >
          <Icon :name="startOpen ? 'chevron-up' : 'plus'" />
          New Session
        </button>
        <StartSession v-if="wide || startOpen" :error="startError" class="w-full" />
      </div>
    </div>
    <SplitHandle
      v-if="wide"
      v-model="startWidth"
      :min="START_MIN"
      :leave="SESSIONS_MIN"
      label="Resize the Sessions and New Session"
      title="Drag to resize; double-click to reset"
      @dblclick="storedWidth = null"
    />
    <div ref="sessionsArea" class="mx-auto mt-10 max-w-[104rem] wide:mt-0 wide:min-w-0 wide:max-w-none wide:flex-1 wide:overflow-y-auto wide:p-6">
      <section
        v-if="listError || sessions?.length"
        class="mx-auto flex max-w-full flex-col gap-4"
        :style="{ width: sessionsWidth }"
      >
        <h2 class="text-xl font-semibold">Your Sessions</h2>
        <p v-if="listError" class="text-danger">Could not load your Sessions: {{ listError }}</p>
        <p v-if="deleteError" class="text-sm text-danger" role="alert">{{ deleteError }}</p>

        <ul class="grid grid-cols-[repeat(auto-fill,12rem)] gap-4">
          <li v-for="s in sessions" :key="s.id" class="group relative" data-session>
            <RouterLink
              :to="sessionPath(s.id, s.kind)"
              class="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-fg"
              :class="{ 'border-fg': s.id === currentSessionId }"
            >
              <div class="aspect-[3/4] bg-canvas">
                <img
                  v-if="s.thumbnail"
                  :src="imageUrl(s.id, s.thumbnail)"
                  alt=""
                  class="h-full w-full object-cover"
                />
                <p
                  v-else-if="s.excerpt"
                  class="line-clamp-[9] p-4 font-serif text-sm italic leading-relaxed text-muted"
                  data-excerpt
                >
                  {{ s.kind === 'roleplay' ? `“${s.excerpt}”` : s.excerpt }}
                </p>
              </div>
              <div class="flex flex-col gap-1 p-3 text-sm">
                <span class="font-medium">{{ s.title }}</span>
                <span class="text-xs uppercase tracking-wide text-muted" data-kind>
                  {{ KIND_LABELS[s.kind] }}
                </span>
                <span class="text-muted">
                  {{ s.frames }} {{ s.frames === 1 ? 'Frame' : 'Frames' }} · {{ ago(s.updatedAt) }}
                </span>
                <span v-if="s.activity" class="animate-pulse text-info" data-activity>
                  {{ ACTIVITY_LABELS[s.activity] }}
                </span>
                <span v-else-if="s.id === currentSessionId" class="text-muted">Current</span>
              </div>
            </RouterLink>
            <button
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas/90 px-2 py-0.5 text-xs text-danger opacity-0 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:text-muted"
              :disabled="s.activity !== null"
              :title="s.activity ? 'A Frame is running in this Session' : 'Delete this Session'"
              data-delete
              @click="remove(s)"
            >
              Delete
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
