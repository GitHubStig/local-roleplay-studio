<script setup lang="ts">
import { useFileDialog } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createScenario,
  deleteScenario,
  getScenarios,
  type ScenarioList,
  type ScenarioSummary,
} from '../api'
import {
  sameSource,
  scenarioPagePath,
  type ScenarioSource,
  useScenarioDraft,
} from '../composables/useScenarioDraft'
import { useTextModelReady } from '../composables/useTextModelReady'
import { ago } from '../ago'
import { ask } from '../ask'

/**
 * Starting a Session: your own Brief, or a Scenario. A column on a wide Home; laid `flat` along the
 * top of a narrower one, always there, the Brief beside the Scenarios.
 */
defineProps<{ error?: string; flat?: boolean }>()

/** The Brief's length limit, as the server enforces it. */
const BRIEF_MAX = 4000

const router = useRouter()
const list = ref<ScenarioList | null>(null)
const listError = ref('')
const { loaded, loadError: settingsError, blocker: textModelBlocker } = useTextModelReady()
const brief = ref('')
const { scenarioDraft } = useScenarioDraft()

async function load() {
  try {
    list.value = await getScenarios()
  } catch (err) {
    listError.value = (err as Error).message
  }
}
onMounted(load)

/** Why the last Import or Delete failed. */
const fileError = ref('')

/** Import: a Scenario's Markdown file, added to the player's own under a name of its own. */
const picker = useFileDialog({ accept: '.md,text/markdown', multiple: false, reset: true })
picker.onChange(async (files) => {
  const file = files?.[0]
  if (!file) return
  fileError.value = ''
  try {
    await createScenario({ markdown: await file.text(), name: file.name })
    await load()
  } catch (err) {
    fileError.value = `Couldn't import ${file.name}: ${(err as Error).message}`
  }
})

async function remove(s: ScenarioSummary) {
  const what = `Delete your Scenario “${s.title}”? This can't be undone.`
  if (!(await ask(what, { action: 'Delete', danger: true }))) return
  fileError.value = ''
  try {
    await deleteScenario(s.id)
  } catch (err) {
    fileError.value = (err as Error).message
  }
  await load()
}

const loadError = computed(() => listError.value || settingsError.value)

/** The Scenarios, the one edited last first, as Your Sessions are. */
const scenarios = computed(() =>
  [...(list.value?.scenarios ?? [])].sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''))
)

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
/** A Scenario's tooltip: its description, then when it was made and last edited. */
const cardTitle = (s: ScenarioSummary) =>
  [
    s.description,
    s.created && `Made ${fullDate(s.created)}`,
    s.modified && `Edited ${fullDate(s.modified)}`,
  ].filter(Boolean).join('\n')

/** Why the Brief can't be opened yet, or null when it can. */
const briefBlocker = computed(() => {
  if (!brief.value.trim()) return 'Write the Brief.'
  if (brief.value.length > BRIEF_MAX) return `Keep the Brief under ${BRIEF_MAX} characters.`
  return null
})

/**
 * Opens the Scenario page on a Scenario, or on the typed Brief: back to it as it was left if it's
 * the one being set up, or in its place once the player agrees.
 */
async function open(from: ScenarioSource) {
  if (textModelBlocker.value) return
  const current = scenarioDraft.value
  if (current?.scenario && !sameSource(current.from, from)) {
    const title = current.scenario.title
    const what = `Set this up in place of “${title}”? Your edits to that one are lost.`
    if (!(await ask(what, { action: 'Set up', danger: true }))) return
  }
  router.push(scenarioPagePath(from))
}
</script>

<template>
  <section class="@container flex flex-col" :class="flat ? 'gap-3' : 'gap-6'" aria-label="Start a new Session">
    <p v-if="loadError" class="text-danger">Could not load Scenarios: {{ loadError }}</p>
    <p v-else-if="!list || !loaded" class="text-muted">Loading…</p>

    <template v-else>
      <p v-if="textModelBlocker" class="text-sm text-warn" data-blocker>{{ textModelBlocker }}</p>

      <!-- Laid flat, the Brief beside the Scenarios once it has room (by its own width, as the rest
           of Home goes by Home's, not the window's), under each other before; else one above the
           other. -->
      <div class="grid items-start gap-6" :class="{ '@min-[44rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @min-[44rem]:gap-10': flat }">
      <!-- Your own Brief first, as typing one is the quickest way in; then the Scenarios, a line
           each, the one edited last first. -->
      <div class="flex flex-col gap-2" data-own-brief>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Your own Brief</h3>
        <textarea
          v-model="brief"
          class="field resize-y text-sm"
          :class="flat ? 'h-20' : 'h-24'"
          placeholder="Who's in it, where, and what's happening, e.g. a lighthouse keeper in a winter storm; I wash up at her door."
          :maxlength="BRIEF_MAX"
          data-brief
        />
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="rounded-lg bg-fg px-4 py-1.5 text-sm font-medium text-canvas disabled:opacity-50"
            :disabled="briefBlocker !== null || !!textModelBlocker"
            data-open-brief
            @click="open({ brief: brief.trim() })"
          >
            Open
          </button>
          <span v-if="brief && briefBlocker" class="text-sm text-warn">{{ briefBlocker }}</span>
        </div>
      </div>

      <div class="flex flex-col">
        <div class="flex items-baseline justify-between gap-3 border-b border-line pb-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Or a Scenario</h3>
          <button
            type="button"
            class="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
            title="Add a Scenario's Markdown file to yours"
            data-import
            @click="picker.open()"
          >
            Import…
          </button>
        </div>
        <p v-if="fileError" class="py-2 text-sm text-danger" role="alert">{{ fileError }}</p>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-x-6">
          <li v-for="s in scenarios" :key="s.id" class="group relative flex border-b border-line">
            <button
              type="button"
              class="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pr-14 text-left hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
              :title="cardTitle(s)"
              :disabled="!!textModelBlocker"
              :data-scenario="s.id"
              @click="open({ scenarioId: s.id })"
            >
              <span class="text-sm font-medium group-hover:underline group-hover:underline-offset-2">{{ s.title }}</span>
              <span class="line-clamp-2 text-xs text-muted">{{ s.description }}</span>
              <span v-if="s.modified" class="text-xs text-muted/80" data-edited>
                Edited {{ ago(s.modified) }}
              </span>
            </button>
            <button
              v-if="s.own"
              type="button"
              class="absolute right-0 top-2.5 rounded px-1.5 py-0.5 text-xs text-danger opacity-0 hover:bg-surface focus:opacity-100 group-hover:opacity-100"
              title="Delete this Scenario of yours"
              data-delete-scenario
              @click="remove(s)"
            >
              Delete
            </button>
          </li>
        </ul>
      </div>

      </div>

      <div
        v-if="list.errors.length"
        class="border-l-2 border-warn pl-3 text-sm text-warn"
        role="alert"
      >
        <p class="mb-1 font-medium">Some Scenario files couldn't be loaded:</p>
        <ul class="list-inside list-disc">
          <li v-for="e in list.errors" :key="e.file">
            <code>{{ e.file }}</code>: {{ e.message }}
          </li>
        </ul>
      </div>

      <p v-if="error" class="text-sm text-danger" role="alert">
        Couldn't start the Session: {{ error }}
      </p>
    </template>
  </section>
</template>
