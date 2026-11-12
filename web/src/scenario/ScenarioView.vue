<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createScenario,
  createSession,
  expandScenario,
  getScenario,
  MAX_FRAMES,
  type Person,
  saveScenario,
  type Scenario,
  type SessionKind,
  type SessionStart,
  suggestPart,
  type Suggestion,
} from '../api'
import Icon from '../components/Icon.vue'
import SaveStatus from '../components/SaveStatus.vue'
import type { AutosaveStatus } from '../composables/useAutosave'
import PopMenu from '../components/PopMenu.vue'
import { useStoredString } from '../composables/storage'
import {
  clearScenarioDraft,
  sameSource,
  saveScenarioDraft,
  type ScenarioSource,
  useScenarioDraft,
} from '../composables/useScenarioDraft'
import { useFeatures } from '../composables/useFeatures'
import { useTextModelReady } from '../composables/useTextModelReady'
import { sessionPath } from '../sessionPath'
import ScenarioField from './ScenarioField.vue'
import type { Hint } from './SuggestButton.vue'
import TruthList from './TruthList.vue'

/**
 * The Scenario page (ADR 0032): a Scenario picked on Home (`id`), or a typed Brief (`?brief=`),
 * expanded as it opens, edited by hand, and started as a Session. Edits go to the Session, not to
 * the Scenario's file; until it starts, they're kept per browser (`useScenarioDraft`), so the page
 * can be left and come back to.
 */
const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const { blocker: textModelBlocker } = useTextModelReady()

const brief = computed(() => (typeof route.query.brief === 'string' ? route.query.brief : ''))
const source = computed<ScenarioSource>(() =>
  props.id ? { scenarioId: props.id } : { brief: brief.value }
)
const { scenarioDraft } = useScenarioDraft()
/** The Scenario as it's being edited; null until it loads (or, for a Brief, until it's expanded). */
const draft = ref<Scenario | null>(null)
/** A draft saved before Scenarios had Music has none: blank, for the Text Model to pick. */
const withMusic = (s: Scenario): Scenario => ({ ...s, music: s.music ?? '' })
/** The Music field shows while Settings' Music is on, or when the Scenario has some already. */
const musicOn = computed(() => useFeatures().settings.value?.music ?? false)
const suggestions = ref<Suggestion[]>([])
/** The description, a box as tall as its text. */
useTextareaAutosize({
  element: useTemplateRef<HTMLTextAreaElement>('description'),
  input: computed(() => draft.value?.description ?? ''),
})
const loadError = ref('')
const expanding = ref(false)
const expandError = ref('')
const startError = ref('')
const starting = ref(false)
let expandCall: AbortController | undefined

/**
 * Expand: names the People and who's who, and suggests for blanks. It's sent the Scenario as it
 * stands when there is one (a Retry keeps the edits made since), else the Brief.
 */
async function expand() {
  expandCall?.abort()
  const call = (expandCall = new AbortController())
  expanding.value = true
  expandError.value = ''
  try {
    const result = await expandScenario(
      draft.value ? { scenario: draft.value } : source.value,
      call.signal,
    )
    draft.value = withMusic(result.scenario)
    suggestions.value = result.suggestions
    lastSuggestion = {}
  } catch (err) {
    if (!call.signal.aborted) expandError.value = (err as Error).message
  } finally {
    if (expandCall === call) expanding.value = false
  }
}

onMounted(async () => {
  // Back to the Scenario being set up: as it was left, without expanding it again.
  const saved = scenarioDraft.value
  if (saved?.scenario && sameSource(saved.from, source.value)) {
    draft.value = withMusic(saved.scenario)
    suggestions.value = saved.suggestions
    return
  }
  if (props.id) {
    try {
      draft.value = withMusic(await getScenario(props.id))
    } catch (err) {
      loadError.value = (err as Error).message
      return
    }
  } else if (!brief.value) {
    router.replace('/')
    return
  }
  await expand()
})
onBeforeUnmount(() => expandCall?.abort())

// Every edit kept as it's made, once there's something to keep: not while it's expanding, or
// coming back would bring the Scenario back unexpanded.
watch(
  [draft, suggestions, expanding],
  () => {
    if (!draft.value || expanding.value) return
    saveScenarioDraft({ from: source.value, scenario: draft.value, suggestions: suggestions.value })
  },
  { deep: true },
)

/** The parts a suggestion is being asked for, and why the last ask for each failed. */
const suggesting = ref<string[]>([])
const suggestErrors = ref<Record<string, string>>({})
/** The suggestion each part was given last, to tell whether it's still there untouched. */
let lastSuggestion: Record<string, string> = {}

/** The object holding a part (`place`, `people.<id>.goal`), and the part's key in it. */
function holder(field: string): [Record<string, unknown>, string] {
  const [, id, key] = field.match(/^people\.([^.]+)\.(\w+)$/) ?? []
  if (!id) return [draft.value as unknown as Record<string, unknown>, field]
  const person = draft.value!.people.find((p) => p.id === id)!
  return [person as unknown as Record<string, unknown>, key]
}

/** Expand's suggestion for a part, taken: it's used once. */
function takeOffer(field: string): string | undefined {
  const offer = suggestions.value.find((s) => s.field === field)
  if (offer) suggestions.value = suggestions.value.filter((s) => s !== offer)
  return offer?.text
}

/**
 * Writes a suggestion into a part, as Roleplay's Suggest writes a message: Expand's, if it made
 * one for the part and the part is empty; otherwise one from the Text Model, building on what's
 * typed there, unless that's the last suggestion untouched (pressed again, it writes a new one).
 * A list of Truths gets a new Truth, in place of the last suggested one if that's untouched.
 */
async function suggest(field: string) {
  const [part, key] = holder(field)
  const current = part[key] as string | string[]
  const list = Array.isArray(current)
  const typed = list ? '' : current.trim()
  const replacing = list && current.length > 0 && current.at(-1) === lastSuggestion[field]
  const offered = !typed && !replacing ? takeOffer(field) : undefined
  let text = offered
  if (!text) {
    suggesting.value = [...suggesting.value, field]
    delete suggestErrors.value[field]
    try {
      const notes = typed === lastSuggestion[field] ? '' : typed
      text = (await suggestPart(draft.value!, field, notes)).text
    } catch (err) {
      suggestErrors.value[field] = (err as Error).message
      return
    } finally {
      suggesting.value = suggesting.value.filter((f) => f !== field)
    }
  }
  if (!list) part[key] = text
  else {
    // As the list is now: it may have been edited while the suggestion was written.
    const now = part[key] as string[]
    const untouched = replacing && now.at(-1) === lastSuggestion[field]
    part[key] = [...(untouched ? now.slice(0, -1) : now), text]
  }
  lastSuggestion[field] = text
}

const hintFor = (field: string): Hint => ({
  offer: suggestions.value.find((s) => s.field === field)?.text,
  busy: suggesting.value.includes(field),
  error: suggestErrors.value[field] ?? '',
})

type PersonPart = Exclude<keyof Person, 'id' | 'name' | 'truths'>
const PERSON_FIELDS: { key: PersonPart; label: string; guide: string }[] = [
  { key: 'looks', label: 'Looks', guide: 'What doesn’t change: no clothing, no art style' },
  { key: 'wears', label: 'Wears', guide: 'What they wear at the start' },
  { key: 'personality', label: 'Personality', guide: 'Their nature, and their mood as it starts' },
  { key: 'speaks', label: 'Speaks', guide: 'How they talk' },
  { key: 'background', label: 'Background', guide: 'Who they are, where they come from' },
  { key: 'goal', label: 'Goal', guide: 'What they want' },
]
/** The story's parts that can be left blank, for the Text Model to fill (the Music while it's on). */
type StoryPart = 'place' | 'time' | 'style' | 'music'
const storyParts = computed((): { key: StoryPart; label: string; guide: string }[] => [
  { key: 'place', label: 'Place', guide: 'Where it happens' },
  { key: 'time', label: 'Time', guide: 'When it happens, and the weather' },
  { key: 'style', label: 'Style', guide: 'The art style of every picture (blank, and the Look picks one)' },
  ...(musicOn.value || draft.value?.music
    ? [{ key: 'music' as const, label: 'Music', guide: "What the story's music is like (blank, and the Text Model picks)" }]
    : []),
])

/**
 * The parts opened from the line of chips this visit: a blank part with nothing suggested folds
 * into that line ("Left to the Text Model: + Wears + Goal") rather than taking a row, until it's
 * opened, typed in or suggested for.
 */
const opened = reactive(new Set<string>())
function shows(field: string): boolean {
  const [part, key] = holder(field)
  const value = part[key] as string | string[]
  const filled = Array.isArray(value) ? value.length > 0 : value.trim() !== ''
  return filled || opened.has(field) || suggestions.value.some((s) => s.field === field)
}
/** Opens a folded part, the focus in it. */
async function openPart(field: string) {
  opened.add(field)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus()
}
const folded = (parts: readonly { field: string; label: string }[]) => parts.filter((p) => !shows(p.field))
const storyFolded = computed(() => folded(storyParts.value.map((p) => ({ field: p.key, label: p.label }))))
const personFolded = (person: Person) =>
  folded([
    ...PERSON_FIELDS.map((f) => ({ field: `people.${person.id}.${f.key}`, label: f.label })),
    { field: `people.${person.id}.truths`, label: 'Truths' },
  ])

function addPerson() {
  const s = draft.value!
  let n = s.people.length + 1
  while (s.people.some((p) => p.id === `person-${n}`)) n++
  s.people.push({
    id: `person-${n}`,
    name: '',
    looks: '',
    wears: '',
    personality: '',
    speaks: '',
    background: '',
    goal: '',
    truths: [],
  })
}

function removePerson(person: Person) {
  const s = draft.value!
  s.people = s.people.filter((p) => p !== person)
  if (s.player === person.id) s.player = undefined
  if (s.character === person.id) s.character = undefined
}

/** Who plays whom in a Roleplay: '' leaves it to the Cast. Picking the other role's Person clears that role. */
const role = (key: 'player' | 'character', other: 'player' | 'character') =>
  computed({
    get: () => draft.value?.[key] ?? '',
    set: (id: string) => {
      const s = draft.value!
      s[key] = id || undefined
      if (id && s[other] === id) s[other] = undefined
    },
  })
const player = role('player', 'character')
const character = role('character', 'player')
/** A Person's role, as the chip beside their name says it, and setting it from there. */
const roleOf = (person: Person) =>
  draft.value?.player === person.id ? 'player' : draft.value?.character === person.id ? 'character' : ''
function setRole(person: Person, to: string) {
  if (to === 'player') player.value = person.id
  else if (to === 'character') character.value = person.id
  else if (roleOf(person) === 'player') player.value = ''
  else if (roleOf(person) === 'character') character.value = ''
}
const ROLES = [
  { value: 'player', label: 'you play' },
  { value: 'character', label: 'the Text Model plays' },
  { value: '', label: 'left to the Cast' },
]

/** How the last Save went (only saving, saved or refused: it saves when asked, not by itself). */
const saveStatus = ref<AutosaveStatus>({ kind: 'idle' })

/**
 * Saves the Scenario to the player's own (`scenarios/`): over its file, or (`asNew`) as a new one,
 * its id from the title, which the page then goes on with, its edits and suggestions kept.
 */
async function save(asNew: boolean) {
  const scenario = draft.value!
  saveStatus.value = { kind: 'saving' }
  try {
    if (!asNew) {
      await saveScenario(props.id!, scenario)
    } else {
      const { id } = await createScenario({ scenario })
      saveScenarioDraft({
        from: { scenarioId: id },
        scenario: { ...scenario, id },
        suggestions: suggestions.value,
      })
      await router.replace({ name: 'scenario', params: { id } })
    }
    saveStatus.value = { kind: 'saved' }
  } catch (err) {
    saveStatus.value = { kind: 'refused', why: (err as Error).message }
  }
}
// An edit after a Save makes "Saved" no longer true.
watch(draft, () => {
  if (saveStatus.value.kind === 'saved') saveStatus.value = { kind: 'idle' }
}, { deep: true })

/** Roleplay first: it's the one that runs without pictures. */
const KINDS: { id: SessionKind; label: string; hint: string }[] = [
  {
    id: 'roleplay',
    label: 'Roleplay',
    hint: 'Talk with a Character, who replies in character; picture any moment as you go.',
  },
  { id: 'chain', label: 'Chain', hint: 'Each Frame is made from the one before by an Action.' },
  {
    id: 'storyboard',
    label: 'Storyboard',
    hint: 'All Frames are planned at once; edit and render each one.',
  },
]
/** The kind picked last, remembered per browser; a Roleplay until one is. */
const storedKind = useStoredString('start-kind')
const kind = computed<SessionKind>({
  get: () => KINDS.find((k) => k.id === storedKind.value)?.id ?? 'roleplay',
  set: (k) => (storedKind.value = k),
})
const frameCount = ref(8)

/** Why the Session can't start yet, or null when it can. */
const blocker = computed(() => {
  if (textModelBlocker.value) return textModelBlocker.value
  if (expanding.value) return 'Wait for Expand to finish.'
  const s = draft.value
  if (s) {
    if (!s.title.trim()) return 'Give it a title.'
    if (!s.opening.trim()) return 'Write the Opening.'
    if (s.people.some((p) => !p.name.trim())) return 'Give every Person a name.'
    const names = s.people.map((p) => p.name.trim().toLowerCase())
    if (new Set(names).size < names.length) return 'Give each Person a name of their own.'
  }
  const n = frameCount.value
  if (kind.value === 'storyboard' && !(Number.isInteger(n) && n >= 1 && n <= MAX_FRAMES)) {
    return `A Storyboard has 1 to ${MAX_FRAMES} Frames.`
  }
  return null
})

/**
 * Starts the Session from the Scenario as it's been left (or, when a Brief couldn't be expanded,
 * from the Brief alone), and opens it: a Roleplay at its Cast review.
 */
async function start() {
  startError.value = ''
  starting.value = true
  const from = props.id ? { scenarioId: props.id } : { brief: brief.value }
  const start: SessionStart = {
    kind: kind.value,
    ...(kind.value === 'storyboard' && { frameCount: frameCount.value }),
    ...(draft.value && { scenario: draft.value }),
    ...from,
  }
  try {
    const session = await createSession(start)
    clearScenarioDraft()
    router.push(sessionPath(session.id, session.kind))
  } catch (err) {
    startError.value = (err as Error).message
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <!-- A bar along the top (Start and the kind of Session at its right, or along the foot on a
       phone), then the story and the People side by side. What scrolls is relative, so the
       off-screen labels for screen readers inside it are placed in it: placed by the page, they
       sat below the window and made the page scroll into blank space. -->
  <div
    class="relative grid min-h-0 grid-cols-1 overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-[auto_minmax(0,1fr)]"
    data-scenario-page
  >
    <header class="flex min-w-0 items-center gap-2 border-b border-line px-4 py-2 sm:col-start-1 sm:row-start-1">
      <span class="shrink-0 text-xs uppercase tracking-wide text-muted">Scenario</span>
      <input
        v-if="draft"
        v-model="draft.title"
        type="text"
        class="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-semibold hover:border-line focus:border-line focus:bg-surface focus:outline-none disabled:opacity-60"
        aria-label="Title"
        :disabled="expanding"
        data-field="title"
      />
      <span v-else class="min-w-0 flex-1 truncate font-semibold text-muted">{{ brief || '…' }}</span>
      <SaveStatus :status="saveStatus" :can-revert="false" />
      <PopMenu v-if="draft" align="end" panel-class="w-64 p-1 text-sm" data-save-menu>
        <template #button="{ open, toggle }">
          <button
            type="button"
            class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-50"
            :class="{ 'bg-surface text-fg': open }"
            :disabled="expanding || saveStatus.kind === 'saving'"
            data-save-menu-button
            @click="toggle"
          >
            Save
            <Icon name="chevron-down" class="opacity-70" />
          </button>
        </template>
        <template #default="{ close }">
          <button
            v-if="props.id"
            type="button"
            class="menu-row"
            title="Save over this Scenario's file in your Scenarios"
            data-save
            @click="save(false); close()"
          >
            Save
          </button>
          <button
            type="button"
            class="menu-row"
            title="Save to your Scenarios as a new one, named from its title"
            data-save-new
            @click="save(true); close()"
          >
            Save as new
          </button>
        </template>
      </PopMenu>
    </header>

    <!-- The kind of Session and Start, in view whatever's scrolled. -->
    <div
      class="flex items-center gap-2 border-line px-4 py-2 max-sm:row-start-3 max-sm:border-t sm:col-start-2 sm:row-start-1 sm:border-b"
      data-start-bar
    >
      <fieldset class="flex rounded-lg border border-line p-0.5 text-sm">
        <legend class="sr-only">Kind of Session</legend>
        <label
          v-for="k in KINDS"
          :key="k.id"
          class="cursor-pointer rounded-md px-2.5 py-1 text-muted has-checked:bg-surface has-checked:text-fg has-checked:shadow-sm has-focus-visible:outline-2"
          :title="k.hint"
        >
          <input v-model="kind" type="radio" name="kind" :value="k.id" class="sr-only" />
          {{ k.label }}
        </label>
      </fieldset>
      <label v-if="kind === 'storyboard'" class="flex items-center gap-1.5 text-sm text-muted" title="How many Frames the Storyboard plans">
        <input
          v-model.number="frameCount"
          type="number"
          min="1"
          :max="MAX_FRAMES"
          class="field w-16 py-1"
          data-frame-count
        />
        Frames
      </label>
      <button
        type="button"
        class="ml-auto shrink-0 rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas disabled:opacity-50"
        :disabled="blocker !== null || starting"
        :title="blocker ?? undefined"
        data-start
        @click="start"
      >
        Start {{ KINDS.find((k) => k.id === kind)!.label }}
      </button>
    </div>

    <!-- The page: the story on the left, the People on the right, each scrolling by itself on a
         wide screen; one column, the story first, on a narrow one. -->
    <div class="relative min-h-0 overflow-y-auto max-sm:row-start-2 sm:col-span-2 sm:row-start-2 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      <div class="flex flex-col gap-2 px-6 pt-3 empty:hidden max-sm:px-4 lg:col-span-2">
        <p v-if="loadError" class="text-danger" role="alert">
          Could not load the Scenario: {{ loadError }}
        </p>
        <p v-if="blocker && !expanding && !loadError" class="text-sm text-warn" data-blocker>{{ blocker }}</p>
        <p v-if="startError" class="text-sm text-danger" role="alert">
          Couldn't start the Session: {{ startError }}
        </p>
        <div
          v-if="expanding || expandError"
          class="flex items-center gap-3 border-b border-line pb-3 text-sm"
          data-expand-status
        >
          <template v-if="expanding">
            <Icon name="spinner" class="animate-spin" />
            <span class="text-muted">Expanding: the Text Model is naming the People and who's who, and
              suggesting what's blank…</span>
          </template>
          <template v-else>
            <span class="flex-1 text-danger">Couldn't expand it: {{ expandError }}</span>
            <button
              type="button"
              class="flex items-center gap-1 rounded-md border border-line px-2 py-1 hover:border-fg"
              data-retry-expand
              @click="expand"
            >
              <Icon name="retry" />
              Retry
            </button>
          </template>
        </div>
        <blockquote
          v-if="!draft && brief"
          class="border-l-2 border-line pl-4 font-serif italic text-muted"
          data-brief-shown
        >
          {{ brief }}
        </blockquote>
      </div>

      <template v-if="draft">
        <section class="relative flex min-w-0 flex-col px-6 py-4 max-sm:px-4 lg:row-start-2 *:max-w-4xl lg:overflow-y-auto" aria-label="The story">
          <textarea
            ref="description"
            v-model="draft.description"
            rows="1"
            class="mb-4 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-muted hover:border-line focus:border-line focus:bg-surface focus:outline-none disabled:opacity-60"
            aria-label="Description"
            placeholder="A sentence or two about it"
            :disabled="expanding"
            data-field="description"
          />
          <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">The story</h2>
          <ScenarioField
            v-model="draft.opening"
            field="opening"
            label="Opening"
            guide="Who is where, doing what, as it starts"
            placeholder="Who is where, doing what, as it starts"
            :disabled="expanding"
          />
          <template v-for="p in storyParts" :key="p.key">
            <ScenarioField
              v-if="shows(p.key)"
              v-model="draft[p.key]"
              :field="p.key"
              :label="p.label"
              :guide="p.guide"
              :hint="hintFor(p.key)"
              :disabled="expanding"
              @suggest="suggest(p.key)"
            />
          </template>
          <TruthList
            v-model="draft.truths"
            field="truths"
            label="What holds whatever anyone does"
            :hint="hintFor('truths')"
            :disabled="expanding"
            @suggest="suggest('truths')"
          />
          <p v-if="storyFolded.length" class="flex flex-wrap items-center gap-1.5 py-2 text-sm text-muted" data-left-to-model="story">
            Left to the Text Model:
            <button
              v-for="p in storyFolded"
              :key="p.field"
              type="button"
              class="part-chip"
              :disabled="expanding"
              :data-open-part="p.field"
              @click="openPart(p.field)"
            >
              + {{ p.label }}
            </button>
          </p>
        </section>

        <section class="relative flex min-w-0 flex-col px-6 py-4 max-sm:px-4 lg:row-start-2 *:max-w-4xl lg:overflow-y-auto lg:border-l lg:border-line" aria-label="People">
          <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">People</h2>
          <article
            v-for="person in draft.people"
            :key="person.id"
            class="group/person flex flex-col border-b border-line pb-3 pt-2"
            :data-person="person.id"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="person.name"
                type="text"
                class="min-w-24 max-w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-semibold [field-sizing:content] hover:border-line focus:border-line focus:bg-surface focus:outline-none disabled:opacity-60"
                aria-label="Name"
                placeholder="Name"
                :disabled="expanding"
                :data-field="`people.${person.id}.name`"
              />
              <!-- Who plays them, in a Roleplay: a chip beside the name. -->
              <select
                v-if="kind === 'roleplay'"
                :value="roleOf(person)"
                class="shrink-0 cursor-pointer appearance-none rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-muted [field-sizing:content] hover:text-fg disabled:opacity-60"
                :aria-label="`Who plays ${person.name || 'them'}`"
                :disabled="expanding"
                :data-role="person.id"
                @change="setRole(person, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }} ▾</option>
              </select>
              <button
                type="button"
                class="ml-auto rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover/person:opacity-100 touch:opacity-100 disabled:opacity-50"
                :disabled="expanding"
                :title="`Remove ${person.name || 'this Person'}`"
                data-remove-person
                @click="removePerson(person)"
              >
                <Icon name="x" />
              </button>
            </div>
            <template v-for="f in PERSON_FIELDS" :key="f.key">
              <ScenarioField
                v-if="shows(`people.${person.id}.${f.key}`)"
                v-model="person[f.key]"
                :field="`people.${person.id}.${f.key}`"
                :label="f.label"
                :guide="f.guide"
                :hint="hintFor(`people.${person.id}.${f.key}`)"
                :disabled="expanding"
                @suggest="suggest(`people.${person.id}.${f.key}`)"
              />
            </template>
            <TruthList
              v-if="shows(`people.${person.id}.truths`)"
              v-model="person.truths"
              :field="`people.${person.id}.truths`"
              label="Truths about them, whoever plays them"
              :hint="hintFor(`people.${person.id}.truths`)"
              :disabled="expanding"
              @suggest="suggest(`people.${person.id}.truths`)"
            />
            <p
              v-if="personFolded(person).length"
              class="flex flex-wrap items-center gap-1.5 pt-2 text-sm text-muted"
              :data-left-to-model="person.id"
            >
              Left to the Text Model:
              <button
                v-for="p in personFolded(person)"
                :key="p.field"
                type="button"
                class="part-chip"
                :disabled="expanding"
                :data-open-part="p.field"
                @click="openPart(p.field)"
              >
                + {{ p.label }}
              </button>
            </p>
          </article>
          <button
            type="button"
            class="mt-3 flex items-center gap-1 self-start text-sm text-muted hover:text-fg disabled:opacity-50"
            :disabled="expanding"
            data-add-person
            @click="addPerson"
          >
            <Icon name="plus" />
            Add a Person
          </button>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
@reference "../style.css";

/** A part left to the Text Model, to open and fill in. */
.part-chip {
  @apply rounded-full border border-dashed border-line px-2 py-0.5 text-xs hover:border-fg hover:text-fg disabled:opacity-50;
}
</style>
