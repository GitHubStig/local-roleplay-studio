<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ApiError,
  getSettings,
  getSettingsOptions,
  saveSettings,
  type Settings,
  type SettingsOptions,
} from '../api'

const form = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const loadError = ref('')
const saving = ref(false)
const status = ref<{ kind: 'saved' | 'error'; message: string; issues?: string[] } | null>(null)

const quantizeChoices = [
  { value: null, label: 'None (full precision)' },
  { value: 8, label: '8-bit' },
  { value: 4, label: '4-bit (fastest)' },
] as const

onMounted(async () => {
  try {
    ;[form.value, options.value] = await Promise.all([getSettings(), getSettingsOptions()])
  } catch (err) {
    loadError.value = (err as Error).message
  }
})

/** Keep a stored Text Model visible even if Ollama no longer lists it. */
const textModelChoices = computed(() => {
  const models = options.value?.textModels ?? []
  const current = form.value?.textModel
  return current && !models.includes(current) ? [current, ...models] : models
})

/** Thinking only applies to Text Models that support it. */
const canThink = computed(() =>
  !!form.value && (options.value?.thinkingModels ?? []).includes(form.value.textModel)
)

function onImageModelChange() {
  const model = options.value?.imageModels.find((m) => m.id === form.value?.imageModel)
  if (form.value && model) form.value.steps = model.defaultSteps
}

async function save() {
  if (!form.value) return
  saving.value = true
  status.value = null
  try {
    form.value = await saveSettings(form.value)
    status.value = { kind: 'saved', message: 'Saved. Applies from the next Session.' }
  } catch (err) {
    status.value = {
      kind: 'error',
      message: (err as Error).message,
      issues: err instanceof ApiError ? err.issues : undefined,
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="overflow-y-auto p-6">
    <div class="mx-auto max-w-xl">
      <h2 class="mb-6 text-xl font-semibold">Settings</h2>

      <p v-if="loadError" class="text-danger">Could not load settings: {{ loadError }}</p>
      <p v-else-if="!form || !options" class="text-muted">Loading…</p>

      <form v-else class="flex flex-col gap-5" @submit.prevent="save">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted">Text Model</span>
          <select v-model="form.textModel" class="field">
            <option value="" disabled>Choose an Ollama model…</option>
            <option v-for="m in textModelChoices" :key="m" :value="m">{{ m }}</option>
          </select>
          <span v-if="options.textModelsError" class="text-sm text-warn">
            {{ options.textModelsError }}
          </span>
        </label>

        <label class="flex items-start gap-2">
          <input v-model="form.thinking" type="checkbox" class="mt-1" :disabled="!canThink" />
          <span class="flex flex-col gap-0.5">
            <span>Thinking</span>
            <span class="text-sm text-muted">
              The Text Model reasons before answering, and you can watch it. Often more
              accurate, but each Frame takes longer.
              <template v-if="form.textModel && !canThink">
                {{ form.textModel }} can't think.
              </template>
            </span>
          </span>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted">Image Model</span>
          <select v-model="form.imageModel" class="field" @change="onImageModelChange">
            <option v-for="m in options.imageModels" :key="m.id" :value="m.id">
              {{ m.label }}
            </option>
          </select>
        </label>

        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Steps</span>
            <input v-model.number="form.steps" type="number" min="1" max="100" class="field" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Quantize</span>
            <select v-model="form.quantize" class="field">
              <option v-for="q in quantizeChoices" :key="String(q.value)" :value="q.value">
                {{ q.label }}
              </option>
            </select>
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted">Size</span>
          <select v-model="form.size" class="field">
            <option v-for="p in options.sizePresets" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-muted">Upscaler</span>
          <select v-model="form.upscaler" class="field" data-upscaler>
            <option v-for="u in options.upscalers" :key="u.id" :value="u.id">{{ u.label }}</option>
          </select>
          <span class="text-sm text-muted">Used by Upscale; applies to the next upscale.</span>
        </label>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">Seed</legend>
          <label class="flex items-center gap-2">
            <input v-model="form.seedMode" type="radio" value="random" />
            New random seed each Session
          </label>
          <label class="flex items-center gap-2">
            <input v-model="form.seedMode" type="radio" value="fixed" />
            Fixed seed
            <input
              v-model.number="form.seed"
              type="number"
              min="0"
              class="field w-40"
              :disabled="form.seedMode !== 'fixed'"
            />
          </label>
        </fieldset>

        <div class="flex items-center gap-4">
          <button
            type="submit"
            class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
            :disabled="saving"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <span v-if="status?.kind === 'saved'" class="text-sm text-ok">
            {{ status.message }}
          </span>
        </div>

        <div v-if="status?.kind === 'error'" class="text-sm text-danger">
          <p>{{ status.message }}</p>
          <ul v-if="status.issues?.length" class="list-inside list-disc">
            <li v-for="issue in status.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
@reference "../style.css";

.field {
  @apply rounded-lg border border-line bg-surface px-3 py-2 disabled:opacity-50;
}
</style>
