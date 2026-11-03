<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import SelectField from '../components/SelectField.vue'
import { useStoredString } from '../composables/storage'
import {
  clearScenarioDraft,
  sameSource,
  saveScenarioDraft,
  type ScenarioSource,
  useScenarioDraft,
} from '../composables/useScenarioDraft'
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
const suggestions = ref<Suggestion[]>([])
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
    draft.value = result.scenario
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
    draft.value = saved.scenario
    suggestions.value = saved.suggestions
    return
  }
  if (props.id) {
    try {
      draft.value = await getScenario(props.id)
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

const PERSON_FIELDS: { key: Exclude<keyof Person, 'id' | 'name' | 'truths'>; label: string }[] = [
  { key: 'looks', label: 'Looks (what doesn’t change; no clothing, no art style)' },
  { key: 'wears', label: 'Wears (at the start)' },
  { key: 'personality', label: 'Personality' },
  { key: 'speaks', label: 'Speaks' },
  { key: 'background', label: 'Background' },
  { key: 'goal', label: 'Goal' },
]

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

/** Who plays whom: '' leaves it to the Cast. Picking the other role's Person clears that role. */
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
  <!-- Relative, so the off-screen labels for screen readers are placed in here, not below the app. -->
  <div class="relative overflow-y-auto p-6">
    <div class="mx-auto flex max-w-4xl flex-col gap-8">
      <RouterLink to="/" class="flex items-center gap-1 self-start text-sm text-muted hover:text-fg">
        <Icon name="chevron-left" />
        Home
      </RouterLink>

      <p v-if="loadError" class="text-danger" role="alert">
        Could not load the Scenario: {{ loadError }}
      </p>

      <template v-else>
        <div
          v-if="expanding || expandError"
          class="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm"
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
              class="flex items-center gap-1 rounded border border-line px-2 py-1 hover:border-fg"
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

        <template v-if="draft">
          <header class="flex flex-col gap-2">
            <input
              v-model="draft.title"
              type="text"
              class="rounded border border-transparent bg-transparent px-1 text-2xl font-semibold hover:border-line focus:border-line disabled:opacity-60"
              aria-label="Title"
              :disabled="expanding"
              data-field="title"
            />
            <input
              v-model="draft.description"
              type="text"
              class="rounded border border-transparent bg-transparent px-1 text-sm text-muted hover:border-line focus:border-line disabled:opacity-60"
              aria-label="Description"
              placeholder="A sentence or two about it"
              :disabled="expanding"
              data-field="description"
            />
            <div class="flex flex-wrap items-center gap-3 px-1 text-sm">
              <button
                v-if="props.id"
                type="button"
                class="rounded border border-line px-3 py-1 hover:border-fg disabled:opacity-50"
                title="Save over this Scenario's file in your Scenarios"
                :disabled="expanding || saveStatus.kind === 'saving'"
                data-save
                @click="save(false)"
              >
                Save
              </button>
              <button
                type="button"
                class="rounded border border-line px-3 py-1 hover:border-fg disabled:opacity-50"
                title="Save to your Scenarios as a new one, named from its title"
                :disabled="expanding || saveStatus.kind === 'saving'"
                data-save-new
                @click="save(true)"
              >
                Save as new
              </button>
              <SaveStatus :status="saveStatus" :can-revert="false" />
            </div>
          </header>

          <section class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">The story</h2>
            <ScenarioField
              v-model="draft.opening"
              field="opening"
              label="Opening: who is where, doing what, as it starts"
              :disabled="expanding"
            />
            <ScenarioField
              v-model="draft.place"
              field="place"
              label="Place"
              :hint="hintFor('place')"
              @suggest="suggest('place')"
              :disabled="expanding"
            />
            <ScenarioField
              v-model="draft.time"
              field="time"
              label="Time, and the weather"
              :hint="hintFor('time')"
              @suggest="suggest('time')"
              :disabled="expanding"
            />
            <ScenarioField
              v-model="draft.style"
              field="style"
              label="Style: the art style of every picture (blank, and the Look picks one)"
              :hint="hintFor('style')"
              @suggest="suggest('style')"
              :disabled="expanding"
            />
            <TruthList
              v-model="draft.truths"
              field="truths"
              label="Truths: what holds whatever anyone does"
              :hint="hintFor('truths')"
              @suggest="suggest('truths')"
              :disabled="expanding"
            />
          </section>

          <section class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">People</h2>
            <div class="grid gap-4 md:grid-cols-2">
              <article
                v-for="person in draft.people"
                :key="person.id"
                class="flex flex-col gap-2 rounded-lg border border-line p-4"
                :data-person="person.id"
              >
                <div class="flex items-center gap-2">
                  <input
                    v-model="person.name"
                    type="text"
                    class="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 font-medium disabled:opacity-60"
                    aria-label="Name"
                    placeholder="Name"
                    :disabled="expanding"
                    :data-field="`people.${person.id}.name`"
                  />
                  <span v-if="draft.player === person.id" class="text-xs text-info">You</span>
                  <span v-else-if="draft.character === person.id" class="text-xs text-info">
                    The Text Model
                  </span>
                  <button
                    type="button"
                    class="rounded p-1 text-muted hover:text-danger disabled:opacity-50"
                    :disabled="expanding"
                    :title="`Remove ${person.name || 'this Person'}`"
                    data-remove-person
                    @click="removePerson(person)"
                  >
                    <Icon name="x" />
                  </button>
                </div>
                <ScenarioField
                  v-for="f in PERSON_FIELDS"
                  :key="f.key"
                  v-model="person[f.key]"
                  :field="`people.${person.id}.${f.key}`"
                  :label="f.label"
                  :hint="hintFor(`people.${person.id}.${f.key}`)"
              @suggest="suggest(`people.${person.id}.${f.key}`)"
                  :disabled="expanding"
                />
                <TruthList
                  v-model="person.truths"
                  :field="`people.${person.id}.truths`"
                  label="Truths about them, whoever plays them"
                  :hint="hintFor(`people.${person.id}.truths`)"
              @suggest="suggest(`people.${person.id}.truths`)"
                  :disabled="expanding"
                />
              </article>
            </div>
            <button
              type="button"
              class="flex items-center gap-1 self-start rounded border border-line px-3 py-1.5 text-sm hover:border-fg disabled:opacity-50"
              :disabled="expanding"
              data-add-person
              @click="addPerson"
            >
              <Icon name="plus" />
              Add a Person
            </button>
          </section>

          <section class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">Who's who in a Roleplay</h2>
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex flex-col gap-1 text-xs text-muted">
                You play
                <SelectField v-model="player" :disabled="expanding" data-player>
                  <option value="">Left to the Cast</option>
                  <option v-for="p in draft.people" :key="p.id" :value="p.id">
                    {{ p.name || 'Unnamed' }}
                  </option>
                </SelectField>
              </label>
              <label class="flex flex-col gap-1 text-xs text-muted">
                The Text Model plays
                <SelectField v-model="character" :disabled="expanding" data-character>
                  <option value="">Left to the Cast</option>
                  <option v-for="p in draft.people" :key="p.id" :value="p.id">
                    {{ p.name || 'Unnamed' }}
                  </option>
                </SelectField>
              </label>
            </div>
          </section>
        </template>

        <section class="flex flex-col gap-4 border-t border-line pt-6">
          <fieldset class="flex flex-wrap gap-3">
            <legend class="sr-only">Kind</legend>
            <label
              v-for="k in KINDS"
              :key="k.id"
              class="flex min-w-60 flex-1 cursor-pointer gap-3 rounded-lg border border-line bg-surface p-4 has-checked:border-fg"
            >
              <input v-model="kind" type="radio" name="kind" :value="k.id" class="mt-1" />
              <span class="flex flex-col gap-1">
                <span class="font-medium">{{ k.label }}</span>
                <span class="text-sm text-muted">{{ k.hint }}</span>
              </span>
            </label>
          </fieldset>

          <label v-if="kind === 'storyboard'" class="flex items-center gap-3 text-sm">
            Frames
            <input
              v-model.number="frameCount"
              type="number"
              min="1"
              :max="MAX_FRAMES"
              class="field w-24"
              data-frame-count
            />
          </label>

          <div class="flex items-center gap-4">
            <button
              type="button"
              class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
              :disabled="blocker !== null || starting"
              data-start
              @click="start"
            >
              Start {{ KINDS.find((k) => k.id === kind)!.label }}
            </button>
            <span v-if="blocker" class="text-sm text-warn">{{ blocker }}</span>
          </div>
          <p v-if="startError" class="text-sm text-danger" role="alert">
            Couldn't start the Session: {{ startError }}
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
