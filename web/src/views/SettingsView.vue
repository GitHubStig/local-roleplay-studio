<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  ApiError,
  deleteQuantized,
  getSettings,
  getSettingsOptions,
  listQuantized,
  listTextModels,
  type QuantizedCopy,
  saveSettings,
  type Settings,
  type SettingsOptions,
  type TextBackend,
} from '../api'
import FeatureSwitch from '../components/FeatureSwitch.vue'
import { useFeatures } from '../composables/useFeatures'

const form = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const loadError = ref('')
const saving = ref(false)
const status = ref<{ kind: 'saved' | 'error'; message: string; issues?: string[] } | null>(null)

/** The Settings, a tab per part of the app: the Text Model's, and each extra's. */
const TABS = [
  { id: 'text', label: 'Text' },
  { id: 'images', label: 'Images' },
  { id: 'voice', label: 'Voice' },
  { id: '3d', label: '3D' },
] as const
const tab = ref<(typeof TABS)[number]['id']>('text')
const { refreshFeatures } = useFeatures()

const quantizeChoices = [
  { value: null, label: 'None (full precision)' },
  { value: 8, label: '8-bit' },
  { value: 4, label: '4-bit' },
] as const

const stepCacheChoices = [
  { value: null, label: 'Off' },
  { value: 0.25, label: '0.25 (about 1.4× faster)' },
  { value: 0.4, label: '0.4 (about 1.5× faster)' },
  { value: 0.5, label: '0.5 (fastest, least detail)' },
] as const

onMounted(async () => {
  try {
    ;[form.value, options.value] = await Promise.all([getSettings(), getSettingsOptions()])
  } catch (err) {
    loadError.value = (err as Error).message
  }
  copies.value = await listQuantized().catch(() => [])
})

/** Saved quantized copies of Image Models, with their sizes on disk. */
const copies = ref<QuantizedCopy[]>([])
const modelLabel = (id: string) => options.value?.imageModels.find((m) => m.id === id)?.label ?? id
const gigabytes = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`
async function removeCopy(name: string) {
  try {
    copies.value = await deleteQuantized(name)
  } catch (err) {
    status.value = { kind: 'error', message: (err as Error).message }
  }
}

/** Each backend's usual address, offered when it's chosen ('' is Ollama's default). */
const DEFAULT_BASE_URL: Record<TextBackend, string> = {
  ollama: '',
  openai: 'http://localhost:1234/v1',
}
function onTextBackendChange() {
  if (form.value) form.value.textBaseUrl = DEFAULT_BASE_URL[form.value.textBackend]
}

/** A new API key to save; '' leaves the saved one as it is. */
const apiKey = ref('')
const removeApiKey = ref(false)

/** As the backend, its address or the key change, list what it offers. */
watchDebounced(
  () => form.value && [form.value.textBackend, form.value.textBaseUrl, apiKey.value],
  async () => {
    if (!form.value || !options.value) return
    const { textBackend, textBaseUrl } = form.value
    const textApiKey = removeApiKey.value ? '' : apiKey.value || undefined
    const listed = await listTextModels({ textBackend, textBaseUrl, textApiKey }).catch((err) => ({
      textModels: [],
      thinkingModels: [],
      textModelsError: (err as Error).message,
    }))
    options.value = { ...options.value, textModelsError: undefined, ...listed }
  },
  { debounce: 500 },
)

/** Keep a stored Text Model visible even if its backend no longer lists it. */
const textModelChoices = computed(() => {
  const models = options.value?.textModels ?? []
  const current = form.value?.textModel
  return current && !models.includes(current) ? [current, ...models] : models
})

/** Thinking only applies to Text Models that support it. */
const canThink = computed(() =>
  !!form.value && (options.value?.thinkingModels ?? []).includes(form.value.textModel)
)

/** The chosen Image Model's options, for the controls only some models have. */
const imageModel = computed(() =>
  options.value?.imageModels.find((m) => m.id === form.value?.imageModel)
)
const fastOn = computed(() => !!form.value?.fast && !!imageModel.value?.fastSteps)

function onImageModelChange() {
  const model = options.value?.imageModels.find((m) => m.id === form.value?.imageModel)
  if (form.value && model) form.value.steps = model.defaultSteps
}

async function save() {
  if (!form.value) return
  saving.value = true
  status.value = null
  try {
    const textApiKey = removeApiKey.value ? '' : apiKey.value.trim() || undefined
    form.value = await saveSettings({ ...form.value, textApiKey })
    apiKey.value = ''
    removeApiKey.value = false
    await refreshFeatures()
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
        <div class="flex border-b border-line" role="tablist" data-settings-tabs>
          <button
            v-for="t in TABS"
            :key="t.id"
            type="button"
            role="tab"
            class="px-4 py-2 text-muted aria-selected:border-b-2 aria-selected:border-fg aria-selected:font-medium aria-selected:text-fg"
            :aria-selected="tab === t.id"
            :data-tab="t.id"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <section
          v-show="tab === 'text'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="text"
        >
          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Text backend</span>
            <select
              v-model="form.textBackend"
              class="field"
              data-text-backend
              @change="onTextBackendChange"
            >
              <option value="ollama">Ollama</option>
              <option value="openai">
                OpenAI-compatible server (LM Studio, llama.cpp, OpenRouter…)
              </option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Address</span>
            <input
              v-model.trim="form.textBaseUrl"
              class="field"
              data-text-base-url
              :placeholder="
                form.textBackend === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'
              "
            />
            <span v-if="form.textBackend === 'ollama'" class="text-sm text-muted">
              Empty for Ollama on this machine.
            </span>
            <span v-else class="text-sm text-muted">
              With the API's version, as the server documents it: LM Studio
              http://localhost:1234/v1, llama.cpp http://localhost:8080/v1, OpenRouter
              https://openrouter.ai/api/v1. Picture rendering can't unload this server's model
              to free memory, as it does Ollama's.
            </span>
          </label>

          <div v-if="form.textBackend === 'openai'" class="flex flex-col gap-1">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-muted">API key</span>
              <input
                v-model="apiKey"
                type="password"
                autocomplete="off"
                class="field"
                data-text-api-key
                :placeholder="
                  form.textApiKeySet && !removeApiKey
                    ? 'Saved; type a new one to replace it'
                    : 'None (a local server needs none)'
                "
              />
            </label>
            <span class="text-sm text-muted">
              Kept in settings.json on this machine, never sent back to the browser.
              <button
                v-if="form.textApiKeySet && !removeApiKey"
                type="button"
                class="underline"
                data-remove-api-key
                @click="removeApiKey = true"
              >
                Remove the saved key
              </button>
            </span>
          </div>

          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Text Model</span>
            <select v-model="form.textModel" class="field" data-text-model>
              <option value="" disabled>Choose a model…</option>
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
            <span class="text-sm text-muted">Art Agent model</span>
            <select v-model="form.artModel" class="field" data-art-model>
              <option value="">Same as the Text Model</option>
              <option v-for="m in textModelChoices" :key="m" :value="m">{{ m }}</option>
            </select>
            <span class="text-sm text-muted">
              Pictures Roleplay Frames (Thinking off); applies to the next picture, in running
              Sessions too.
            </span>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Art Agent style</span>
            <select v-model="form.artStyle" class="field" data-art-style>
              <option value="prose">Prose (recommended)</option>
              <option value="tags">Tags</option>
            </select>
            <span class="text-sm text-muted">
              How pictures are written. Tags are about twice as fast, but mix up who does what.
            </span>
          </label>

          <label class="flex items-start gap-2">
            <input v-model="form.limits" type="checkbox" class="mt-1" data-limits />
            <span class="flex flex-col gap-0.5">
              <span>Limits</span>
              <span class="text-sm text-muted">
                On: no sexual or nude content, real people, or restraint, and everyone is an adult.
                Off: only "everyone depicted is an adult" is enforced; it can't be turned off.
                Applies at once, to running Sessions too.
              </span>
            </span>
          </label>
        </section>

        <section
          v-show="tab === 'images'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="images"
        >
          <FeatureSwitch
            v-model="form.features.images"
            :availability="options.features.images"
            title="Pictures"
            data-feature="images"
          >
            Render, upscale and picture Frames with mflux. Off, Roleplays are conversations only, and Chains and Storyboards can't start.
          </FeatureSwitch>
          <template v-if="options.features.images.available">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-muted">Image Model</span>
              <select
                v-model="form.imageModel"
                class="field"
                data-image-model
                @change="onImageModelChange"
              >
                <option v-for="m in options.imageModels" :key="m.id" :value="m.id">
                  {{ m.label }}
                </option>
              </select>
            </label>

            <label v-if="imageModel?.fastSteps" class="flex items-start gap-2" data-fast>
              <input v-model="form.fast" type="checkbox" class="mt-1" />
              <span class="flex flex-col gap-0.5">
                <span>Fast</span>
                <span class="text-sm text-muted">
                  Renders in {{ imageModel.fastSteps }} steps with a turbo LoRA (downloaded the first
                  time, 1.3 GB): about 3× faster, a little smoother and less painterly.
                </span>
              </span>
            </label>

            <div class="grid grid-cols-2 gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-sm text-muted">Steps</span>
                <input
                  v-if="fastOn"
                  :value="imageModel?.fastSteps"
                  type="number"
                  class="field"
                  disabled
                  title="Fast mode sets the steps"
                />
                <input v-else v-model.number="form.steps" type="number" min="1" max="100" class="field" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-muted">Quantize</span>
                <select v-model="form.quantize" class="field">
                  <option v-for="q in quantizeChoices" :key="String(q.value)" :value="q.value">
                    {{ q.label }}
                  </option>
                </select>
                <span class="text-sm text-muted">
                  Saved as a smaller copy the first time a model renders with it (about 10 s), then
                  loaded directly: about 8 GB less memory on the larger models.
                </span>
              </label>
            </div>

            <label v-if="imageModel?.stepCache && !fastOn" class="flex flex-col gap-1" data-step-cache>
              <span class="text-sm text-muted">Step cache</span>
              <select v-model="form.stepCache" class="field">
                <option v-for="c in stepCacheChoices" :key="String(c.value)" :value="c.value">
                  {{ c.label }}
                </option>
              </select>
              <span class="text-sm text-muted">
                Skips this share of the steps that change the picture least, reusing the one before.
                At 0.4 it looks near the same.
              </span>
            </label>

            <div v-if="copies.length" class="flex flex-col gap-1" data-quantized>
              <span class="text-sm text-muted">Saved copies (in models/quantized)</span>
              <ul class="flex flex-col gap-1 text-sm">
                <li v-for="c in copies" :key="c.name" class="flex items-center gap-3" data-quantized-copy>
                  <span class="min-w-0 flex-1 truncate">
                    {{ modelLabel(c.modelId) }}, {{ c.bits }}-bit
                    <span class="text-muted">· {{ gigabytes(c.bytes) }} · mflux {{ c.mflux }}</span>
                  </span>
                  <button
                    type="button"
                    class="text-danger underline-offset-2 hover:underline"
                    :title="`Delete; the next ${c.bits}-bit render with this model saves it again`"
                    @click="removeCopy(c.name)"
                  >
                    Delete
                  </button>
                </li>
              </ul>
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
          </template>
        </section>

        <section
          v-show="tab === 'voice'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="voice"
        >
          <FeatureSwitch
            v-model="form.features.voices"
            :availability="options.features.voices"
            title="Voices"
            data-feature="voices"
          >
            Each Roleplay Character gets a voice designed from their description, and speaks their lines (the mlx-audio service).
          </FeatureSwitch>
        </section>

        <section
          v-show="tab === '3d'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="3d"
        >
          <FeatureSwitch
            v-model="form.features.scenes"
            :availability="options.features.scenes"
            title="SHARP"
            data-feature="scenes"
          >
            Apple's SHARP makes a picture into a 2.5D scene that turns about 30°.
          </FeatureSwitch>
          <FeatureSwitch
            v-model="form.features.figures"
            :availability="options.features.figures"
            title="TripoSplat"
            data-feature="figures"
          >
            VAST's TripoSplat lifts the person in a picture out as a 3D figure that turns all the way round.
          </FeatureSwitch>
          <FeatureSwitch
            v-model="form.features.lito"
            :availability="options.features.lito"
            title="LiTo"
            data-feature="lito"
          >
            Apple's LiTo does the same as TripoSplat, through mlx-spatial (research-only licence).
          </FeatureSwitch>
        </section>

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
