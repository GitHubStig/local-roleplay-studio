<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  getScenarios,
  getSettings,
  getSettingsOptions,
  type ScenarioList,
  type SessionKind,
  type SessionStart,
  type Settings,
  type SettingsOptions,
} from '../api'
import { useFeatures } from '../composables/useFeatures'

defineProps<{ error?: string }>()
const emit = defineEmits<{ start: [start: SessionStart] }>()

/** The Brief's length limit, as the server enforces it. */
const BRIEF_MAX = 4000

const BRIEF_HINTS: Record<SessionKind, string> = {
  chain: 'Who is in the picture, where, and in what style.',
  storyboard:
    'The story to tell, e.g. a high school student dunks for the first time, manga style.',
  roleplay:
    'Who you meet, where, and who you are, e.g. a lighthouse keeper in a winter storm; I wash up at her door.',
}

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

const list = ref<ScenarioList | null>(null)
const settings = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const loadError = ref('')
/** A Chain renders every Frame and a Storyboard is for rendering: both need pictures on. */
const { on: featureOn } = useFeatures()
const kinds = computed(() =>
  KINDS.filter((k) => k.id === 'roleplay' || featureOn.value('images'))
)
const kind = ref<SessionKind>('roleplay')
watch(kinds, (now) => {
  if (!now.some((k) => k.id === kind.value)) kind.value = now[0].id
}, { immediate: true })
/** A Scenario's id, or `brief` to type one. */
const selected = ref('')
const brief = ref('')
const frameCount = ref(8)

onMounted(async () => {
  try {
    ;[list.value, settings.value, options.value] = await Promise.all([
      getScenarios(),
      getSettings(),
      getSettingsOptions(),
    ])
    if (list.value.scenarios.length === 1) selected.value = list.value.scenarios[0].id
  } catch (err) {
    loadError.value = (err as Error).message
  }
})

const imageModelLabel = computed(
  () =>
    options.value?.imageModels.find((m) => m.id === settings.value?.imageModel)?.label ??
      settings.value?.imageModel,
)

/** Why a Session can't start yet, or null when it can. */
const blocker = computed(() => {
  if (!settings.value?.textModel) return 'Choose a Text Model in Settings first.'
  if (!options.value?.textModels.includes(settings.value.textModel)) {
    return `The Text Model "${settings.value.textModel}" isn't available. Choose one in Settings.`
  }
  if (!selected.value) return 'Choose a Scenario, or write your own Brief.'
  if (selected.value === 'brief' && !brief.value.trim()) return 'Write the Brief.'
  if (brief.value.length > BRIEF_MAX) return `Keep the Brief under ${BRIEF_MAX} characters.`
  const n = frameCount.value
  if (kind.value === 'storyboard' && !(Number.isInteger(n) && n >= 1 && n <= 16)) {
    return 'A Storyboard has 1 to 16 Frames.'
  }
  return null
})

function start() {
  const from = selected.value === 'brief'
    ? { brief: brief.value.trim() }
    : { scenarioId: selected.value }
  emit(
    'start',
    kind.value === 'storyboard'
      ? { kind: 'storyboard', frameCount: frameCount.value, ...from }
      : { kind: kind.value, ...from },
  )
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <h2 class="text-xl font-semibold">Start a new Session</h2>

    <p v-if="loadError" class="text-danger">Could not load Scenarios: {{ loadError }}</p>
    <p v-else-if="!list || !settings || !options" class="text-muted">Loading…</p>

    <template v-else>
      <fieldset class="flex flex-wrap gap-3">
        <legend class="sr-only">Kind</legend>
        <label
          v-for="k in kinds"
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

      <fieldset class="flex flex-col gap-3">
        <legend class="mb-2 text-sm text-muted">Start from a Scenario, or write your own Brief</legend>
        <label
          v-for="s in list.scenarios"
          :key="s.id"
          class="flex cursor-pointer gap-3 rounded-lg border border-line bg-surface p-4 has-checked:border-fg"
        >
          <input v-model="selected" type="radio" name="scenario" :value="s.id" class="mt-1" />
          <span class="flex flex-col gap-1">
            <span class="font-medium">{{ s.title }}</span>
            <span class="text-sm text-muted">{{ s.description }}</span>
          </span>
        </label>
        <label
          class="flex cursor-pointer gap-3 rounded-lg border border-line bg-surface p-4 has-checked:border-fg"
        >
          <input v-model="selected" type="radio" name="scenario" value="brief" class="mt-1" />
          <span class="flex flex-1 flex-col gap-2">
            <span class="font-medium">Your own Brief</span>
            <textarea
              v-model="brief"
              class="h-28 resize-y rounded border border-line bg-canvas p-2 text-sm"
              :placeholder="BRIEF_HINTS[kind]"
              :maxlength="BRIEF_MAX"
              data-brief
              @focus="selected = 'brief'"
            />
          </span>
        </label>
      </fieldset>

      <label v-if="kind === 'storyboard'" class="flex items-center gap-3 text-sm">
        Frames
        <input
          v-model.number="frameCount"
          type="number"
          min="1"
          max="16"
          class="w-20 rounded border border-line bg-surface px-2 py-1"
          data-frame-count
        />
      </label>

      <div
        v-if="list.errors.length"
        class="rounded-lg border border-line p-4 text-sm text-warn"
        role="alert"
      >
        <p class="mb-1 font-medium">Some Scenario files couldn't be loaded:</p>
        <ul class="list-inside list-disc">
          <li v-for="e in list.errors" :key="e.file">
            <code>{{ e.file }}</code>: {{ e.message }}
          </li>
        </ul>
      </div>

      <p class="text-sm text-muted">
        Text Model <span class="text-fg">{{ settings.textModel || 'not set' }}</span>
        <span v-if="settings.thinking && options.thinkingModels.includes(settings.textModel)">
          (thinking)
        </span>
        · Image Model <span class="text-fg">{{ imageModelLabel }}</span>
        ·
        <RouterLink to="/settings" class="underline">change in Settings</RouterLink>
      </p>

      <div class="flex items-center gap-4">
        <button
          type="button"
          class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
          :disabled="blocker !== null"
          data-start
          @click="start"
        >
          Start {{ KINDS.find((k) => k.id === kind)!.label }}
        </button>
        <span v-if="blocker" class="text-sm text-warn">{{ blocker }}</span>
      </div>

      <p v-if="error" class="text-sm text-danger" role="alert">
        Couldn't start the Session: {{ error }}
      </p>
    </template>
  </section>
</template>
