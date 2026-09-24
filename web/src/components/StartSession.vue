<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getScenarios,
  getSettings,
  getSettingsOptions,
  type ScenarioList,
  type Settings,
  type SettingsOptions,
} from '../api'

defineProps<{ error?: string }>()
const emit = defineEmits<{ start: [scenarioId: string] }>()

const list = ref<ScenarioList | null>(null)
const settings = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const loadError = ref('')
const selected = ref('')

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
    return `The Text Model "${settings.value.textModel}" isn't available in Ollama.`
  }
  if (!selected.value) return 'Choose a Scenario.'
  return null
})
</script>

<template>
  <div class="overflow-y-auto p-6">
    <div class="mx-auto flex max-w-2xl flex-col gap-6">
      <h2 class="text-xl font-semibold">Start a Session</h2>

      <p v-if="loadError" class="text-danger">Could not load Scenarios: {{ loadError }}</p>
      <p v-else-if="!list || !settings || !options" class="text-muted">Loading…</p>

      <template v-else>
        <p v-if="list.scenarios.length === 0" class="text-muted">
          No Scenarios found. Add a Markdown file to <code>scenarios/</code>.
        </p>

        <fieldset v-else class="flex flex-col gap-3">
          <legend class="sr-only">Scenario</legend>
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
        </fieldset>

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
          · Image Model <span class="text-fg">{{ imageModelLabel }}</span>
          ·
          <RouterLink to="/settings" class="underline">change in Settings</RouterLink>
        </p>

        <div class="flex items-center gap-4">
          <button
            type="button"
            class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
            :disabled="blocker !== null"
            @click="emit('start', selected)"
          >
            Start Session
          </button>
          <span v-if="blocker" class="text-sm text-warn">{{ blocker }}</span>
        </div>

        <p v-if="error" class="text-sm text-danger" role="alert">
          Couldn't start the Session: {{ error }}
        </p>
      </template>
    </div>
  </div>
</template>
