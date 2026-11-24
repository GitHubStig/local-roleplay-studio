<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { imageUrl, KIND_LABELS } from '../api'
import { ago } from '../ago'
import Icon from '../components/Icon.vue'
import SplitHandle from '../components/SplitHandle.vue'
import StartSession from '../components/StartSession.vue'
import { tabStorage, useStoredString } from '../composables/storage'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useCurrentSession } from '../composables/useCurrentSession'
import { loadSessions, useSessionList } from '../composables/useSessionList'
import { sessionPath } from '../sessionPath'

const route = useRoute()
const router = useRouter()
const { currentSessionId } = useCurrentSession()

const { sessions, listError } = useSessionList()
const CARD_REM = 12
const GAP_REM = 1
/** Where the Sessions go: the page's width, or its left column in an ultrawide window. */
const sessionsArea = useTemplateRef('sessionsArea')
const { width: pageWidth } = useElementSize(sessionsArea)
/** The Sessions section is as wide as the columns that fit (or are needed), so it centres as a block. */
const sessionsWidth = computed(() => {
  if (phone.value) return undefined
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const fit = Math.floor((pageWidth.value / rem + GAP_REM) / (CARD_REM + GAP_REM))
  const columns = Math.min(fit, sessions.value?.length ?? 0)
  if (columns < 1) return undefined
  return `${columns * CARD_REM + (columns - 1) * GAP_REM}rem`
})
/** What's typed in the search over Your Sessions: a part of a title, or a kind. */
const search = ref('')
const shownSessions = computed(() => {
  const words = search.value.trim().toLowerCase()
  if (!words) return sessions.value ?? []
  return (sessions.value ?? []).filter((s) =>
    `${s.title} ${KIND_LABELS[s.kind]}`.toLowerCase().includes(words)
  )
})
/** Why the last Session failed to start: its Opening Frame errored. */
const startError = ref('')
/**
 * Home is wide enough (by its own width, not the window's: a maximised window on a 1920 screen is
 * often a little short of it) for Start a new Session to have a column of its own, always open.
 */
const home = useTemplateRef('home')
const { width: homeWidth } = useElementSize(home, undefined, { box: 'border-box' })
const WIDE_PX = 1000
const wide = computed(() => homeWidth.value >= WIDE_PX)
/** A phone's width: Sessions as many across as fit at 10rem or more (two on a phone), and starting one a screen of its own. */
const phone = computed(() => homeWidth.value > 0 && homeWidth.value < 640)
/**
 * No Sessions yet (as loaded, not while loading or failing): starting one is all there is, one
 * column in the middle, without the split, the fold or a phone's way back to the Sessions.
 */
const empty = computed(() => sessions.value?.length === 0 && !listError.value)
/** Two panes side by side: wide enough, and Sessions to show beside starting one. */
const split = computed(() => wide.value && !empty.value)
/**
 * There, the New Session pane's width in px, set by the splitter and remembered per browser;
 * double-clicking the splitter forgets it, back to the default.
 */
/** A third of Home at first, within these. */
const START_DEFAULT = { min: 360, max: 704 }
const START_MIN = 360
const SESSIONS_MIN = 480
const storedWidth = useStoredString('home.start-width')
/** There, Start something new folded to a strip at the edge by its caret, remembered per browser. */
const startFolded = useStoredFlag('home.start-folded')
const startWidth = computed({
  get: () =>
    Number(storedWidth.value) ||
    Math.round(Math.min(START_DEFAULT.max, Math.max(START_DEFAULT.min, homeWidth.value / 3))),
  set: (px: number) => (storedWidth.value = String(px)),
})
/**
 * On a phone, whether Start a new Session is open, a screen of its own, remembered for this tab as
 * it's opened or closed; until then closed while there are Sessions, open when there are none yet
 * (null until the list first loads). Wider, it's always there.
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
  await loadSessions()
  if (!alive || listError.value) return
  if (sessions.value?.some((s) => s.activity)) poll = setTimeout(load, 2000)
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

const ACTIVITY_LABELS = {
  text: 'Writing…',
  queued: 'Waiting for another render…',
  image: 'Rendering…',
  audio: 'Speaking…',
  download: 'Downloading a model…',
} as const

</script>

<template>
  <!-- Wide enough (Home's own width), two panes that scroll on their own, a splitter between them:
       the Sessions on the left, starting one on the right. Narrower, one column, New Session
       opening under its button; on a phone, opening as a screen of its own. With no Sessions yet,
       starting one alone, in the middle. -->
  <div
    ref="home"
    class="overflow-y-auto"
    :class="split ? 'flex flex-row-reverse overflow-hidden' : empty ? 'p-6 max-sm:px-4 max-sm:pt-4 sm:pt-[12vh]' : 'p-6 max-sm:px-4 max-sm:pt-4'"
  >
    <!-- Wide and folded: a strip at the edge, its name down it, to open it again. -->
    <button
      v-if="split && startFolded"
      type="button"
      class="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-line py-6 text-sm text-muted hover:bg-surface hover:text-fg"
      title="Open Start something new"
      aria-expanded="false"
      data-start-unfold
      @click="startFolded = false"
    >
      <Icon name="chevron-left" />
      <span class="[writing-mode:vertical-rl]">Start something new</span>
    </button>
    <div
      v-else
      :class="split ? 'shrink-0 overflow-y-auto p-6' : phone || empty ? '' : 'border-b border-line pb-6'"
      :style="split ? { width: `${startWidth}px` } : undefined"
      data-start-pane
    >
      <!-- Wide: a column of its own. Narrower: laid flat along the top, always there. On a phone:
           a New button, opening it as a screen of its own. With no Sessions, a column in the middle. -->
      <div
        class="flex w-full max-w-full flex-col gap-4"
        :class="{ 'mx-auto': !split, 'max-w-2xl!': empty }"
        :style="!wide && !phone && !empty ? { width: sessionsWidth } : undefined"
        data-start-column
      >
        <div v-if="!phone || empty" class="flex items-center gap-2">
          <h2 class="font-semibold" :class="empty ? 'text-2xl' : 'text-lg'">Start something new</h2>
          <button
            v-if="split"
            type="button"
            class="ml-auto rounded-md p-1 text-muted hover:bg-surface hover:text-fg"
            title="Fold it away, the Sessions taking the room"
            aria-label="Fold Start something new away"
            aria-expanded="true"
            data-start-fold
            @click="startFolded = true"
          >
            <Icon name="chevron-right" />
          </button>
        </div>
        <button
          v-else-if="startOpen"
          type="button"
          class="flex items-center gap-1 self-start text-sm text-muted hover:text-fg"
          data-new-session
          :aria-expanded="true"
          @click="startOpen = false"
        >
          <Icon name="chevron-left" />
          Your Sessions
        </button>
        <button
          v-else
          type="button"
          class="flex items-center justify-center gap-2 rounded-lg bg-fg px-4 py-2 font-medium text-canvas"
          :aria-expanded="false"
          data-new-session
          @click="startOpen = true"
        >
          <Icon name="plus" />
          New Session
        </button>
        <StartSession v-if="!phone || empty || startOpen" :error="startError" :flat="!wide && !phone && !empty" class="w-full" />
      </div>
    </div>
    <SplitHandle
      v-if="split && !startFolded"
      v-model="startWidth"
      :min="START_MIN"
      :leave="SESSIONS_MIN"
      label="Resize the Sessions and New Session"
      title="Drag to resize; double-click to reset"
      @dblclick="storedWidth = null"
    />
    <div
      v-show="!(phone && startOpen) && !empty"
      ref="sessionsArea"
      :class="split ?'min-w-0 flex-1 overflow-y-auto p-6' : 'mx-auto mt-6 max-w-[104rem]'"
    >
      <section
        v-if="listError || sessions?.length"
        class="mx-auto flex max-w-full flex-col gap-4"
        :style="{ width: sessionsWidth }"
      >
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-xl font-semibold">Your Sessions</h2>
          <label v-if="sessions && sessions.length > 1" class="ml-auto flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-muted focus-within:border-fg max-sm:w-full sm:w-64">
            <Icon name="search" class="shrink-0" />
            <input
              v-model="search"
              type="search"
              class="min-w-0 flex-1 bg-transparent text-fg placeholder:text-muted focus:outline-none"
              placeholder="Search"
              aria-label="Search your Sessions"
              data-session-search
            />
          </label>
        </div>
        <p v-if="listError" class="text-danger">Could not load your Sessions: {{ listError }}</p>
        <p v-if="sessions?.length && !shownSessions.length" class="text-sm text-muted" data-no-match>
          No Session matches “{{ search.trim() }}”.
        </p>

        <ul class="grid gap-4" :class="phone ? 'grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3' : 'grid-cols-[repeat(auto-fill,12rem)]'">
          <li v-for="s in shownSessions" :key="s.id" class="group relative" data-session>
            <!-- A card is its picture and a few lines under it, no border: a ring while pointed at,
                 and around the Session in progress. -->
            <RouterLink
              :to="sessionPath(s.id, s.kind)"
              class="flex h-full flex-col overflow-hidden rounded-lg bg-surface hover:ring-1 hover:ring-fg"
              :class="{ 'ring-2 ring-fg': s.id === currentSessionId }"
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
              <div class="flex flex-col gap-1 p-3 text-sm max-sm:p-2.5">
                <span class="line-clamp-2 font-medium">{{ s.title }}</span>
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
            <!-- Shown while pointed at, and always on a touch screen, which can't point. -->
            <RouterLink
              :to="{ path: '/sessions', query: { id: s.id } }"
              class="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-sm focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              title="Manage this Session: its size, renaming, deleting"
              data-manage
            >
              <Icon name="folder" />
              Manage
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
