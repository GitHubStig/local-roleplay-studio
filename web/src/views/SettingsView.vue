<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  ApiError,
  checkComfyUI,
  type ComfyStatus,
  getSettings,
  getSettingsOptions,
  listTextModels,
  saveSettings,
  type Settings,
  type SettingsOptions,
  type TextBackend,
} from '../api'
import ComfyStatusLine from '../components/ComfyStatusLine.vue'
import FeatureSwitch from '../components/FeatureSwitch.vue'
import { useFeatures } from '../composables/useFeatures'

const form = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const loadError = ref('')
const saving = ref(false)
const status = ref<{ kind: 'saved' | 'error'; message: string; issues?: string[] } | null>(null)

/** The Settings, a tab per part of the app (the Text Model's, each extra's), and the seed. */
const TABS = [
  { id: 'text', label: 'Text' },
  { id: 'images', label: 'Images' },
  { id: 'voice', label: 'Voice' },
  { id: '3d', label: '3D' },
  { id: 'seed', label: 'Seed' },
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
    savedJson = formJson()
  } catch (err) {
    loadError.value = (err as Error).message
  }
})

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

/** The chosen backend's Image Models. */
const imageModels = computed(() =>
  form.value && options.value ? options.value.imageModels[form.value.imageBackend] : []
)
/** The chosen Image Model's options, for the controls only some models have. */
const imageModel = computed(() => imageModels.value.find((m) => m.id === form.value?.imageModel))
const fastOn = computed(() => !!form.value?.fast && !!imageModel.value?.fastSteps)

function onImageModelChange() {
  if (form.value && imageModel.value) form.value.steps = imageModel.value.defaultSteps
}
/** A backend has its own models: start on its first. */
function onImageBackendChange() {
  if (!form.value) return
  form.value.imageModel = imageModels.value[0]?.id ?? ''
  onImageModelChange()
}
/** Pictures, Upscale or voices run on ComfyUI, so its address matters. */
const usesComfyUI = computed(() =>
  form.value?.imageBackend === 'comfyui' || form.value?.upscaleBackend === 'comfyui' ||
  form.value?.voiceBackend === 'comfyui'
)
/**
 * ComfyUI at the address shown: up or down, and whether what runs there has what it needs (the
 * Image Model's files, the upscaler's, voices' custom nodes).
 */
const comfy = ref<ComfyStatus | 'checking' | null>(null)
async function checkComfy() {
  if (!form.value || !usesComfyUI.value) return (comfy.value = null)
  comfy.value = 'checking'
  const { imageBackend, upscaleBackend, voiceBackend, imageBaseUrl, imageModel, upscaler } =
    form.value
  comfy.value = await checkComfyUI(imageBaseUrl, {
    imageModel: imageBackend === 'comfyui' ? imageModel : undefined,
    upscaler: upscaleBackend === 'comfyui' ? upscaler : undefined,
    voices: voiceBackend === 'comfyui' || undefined,
  }).catch((err) => ({ up: false as const, error: (err as Error).message }))
}
// Checked when ComfyUI is chosen, and again as its address or what runs there changes.
watchDebounced(
  () =>
    form.value && [
      form.value.imageBackend,
      form.value.upscaleBackend,
      form.value.voiceBackend,
      form.value.imageBaseUrl,
      form.value.imageModel,
      form.value.upscaler,
    ],
  checkComfy,
  { debounce: 500, immediate: true },
)

/**
 * Whether pictures, Upscale or voices can run, as the form stands: choosing ComfyUI makes one
 * available before it's saved (a server runs it, not this machine).
 */
const availableWith = (feature: 'images' | 'upscale' | 'voices', comfyui: boolean) =>
  comfyui ? { available: true } : options.value?.features[feature] ?? { available: false }
const imagesAvailability = computed(() =>
  availableWith('images', form.value?.imageBackend === 'comfyui')
)
const upscaleAvailability = computed(() =>
  availableWith('upscale', form.value?.upscaleBackend === 'comfyui')
)
const voicesAvailability = computed(() =>
  availableWith('voices', form.value?.voiceBackend === 'comfyui')
)
const picturesHere = computed(() => imagesAvailability.value.available)

/** The form as last saved (or loaded), so an unchanged one isn't saved again. */
let savedJson = ''
const formJson = () => JSON.stringify(form.value)

/**
 * Saves the form, and with it `textApiKey` when given ('' removes the saved one). What the server
 * turns down (an address half typed, say) isn't saved, and says why at the top; the next change
 * tries again. The form isn't replaced by what comes back, so typing meanwhile isn't lost.
 */
async function save(textApiKey?: string) {
  if (!form.value) return
  const json = formJson()
  if (json === savedJson && textApiKey === undefined) {
    // Back to what's saved (an address put right, say): what was turned down no longer stands.
    if (status.value?.kind === 'error') status.value = null
    return
  }
  const before = savedJson
  savedJson = json
  saving.value = true
  try {
    const saved = await saveSettings({ ...form.value, textApiKey })
    if (form.value.textApiKeySet !== saved.textApiKeySet) {
      form.value.textApiKeySet = saved.textApiKeySet
      if (savedJson === json) savedJson = formJson()
    }
    if (textApiKey !== undefined) {
      apiKey.value = ''
      removeApiKey.value = false
    }
    await refreshFeatures()
    status.value = { kind: 'saved', message: 'Saved. Applies from the next Session.' }
  } catch (err) {
    savedJson = before
    status.value = {
      kind: 'error',
      message: `Not saved: ${(err as Error).message}`,
      issues: err instanceof ApiError ? err.issues : undefined,
    }
  } finally {
    saving.value = false
  }
}
// Every change saves itself once typing pauses.
watchDebounced(formJson, () => save(), { debounce: 600 })

/** A new API key, or its removal: saved when the field is left (not while it's typed). */
function saveApiKey() {
  if (removeApiKey.value) return save('')
  if (apiKey.value.trim()) return save(apiKey.value.trim())
}
/** Enter in a field saves at once. */
const saveNow = () => saveApiKey() ?? save()
function removeSavedApiKey() {
  removeApiKey.value = true
  saveApiKey()
}
</script>

<template>
  <div class="overflow-y-auto">
    <div class="mx-auto max-w-xl px-6 pb-6 pt-6">
      <div
        class="sticky top-0 z-10 -mx-6 mb-4 flex flex-col bg-canvas px-6 pb-4"
        data-settings-status
      >
        <div class="flex items-baseline gap-3">
          <h2 class="text-xl font-semibold">Settings</h2>
          <span v-if="saving" class="text-sm text-muted" data-saving>Saving…</span>
          <span v-else-if="status?.kind === 'saved'" class="text-sm text-ok" data-saved>
            {{ status.message }}
          </span>
        </div>
        <div v-if="status?.kind === 'error'" class="text-sm text-danger" data-save-error>
          <p>{{ status.message }}</p>
          <ul v-if="status.issues?.length" class="list-inside list-disc">
            <li v-for="issue in status.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
        <div
          v-if="form && options"
          class="-mx-6 mt-2 flex border-b border-line px-6"
          role="tablist"
          data-settings-tabs
        >
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
      </div>

      <p v-if="loadError" class="text-danger">Could not load settings: {{ loadError }}</p>
      <p v-else-if="!form || !options" class="text-muted">Loading…</p>

      <form v-else class="flex flex-col gap-5" @submit.prevent="saveNow">
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
                @change="saveApiKey"
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
                @click="removeSavedApiKey"
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
            :availability="imagesAvailability"
            title="Pictures"
            data-feature="images"
          >
            Render and picture Frames. Off, every Session runs on the Text Model alone: a Roleplay is a
            conversation, a Chain writes prompts and a Storyboard plans, to render later.
          </FeatureSwitch>

          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Image backend</span>
            <select
              v-model="form.imageBackend"
              class="field"
              data-image-backend
              @change="onImageBackendChange"
            >
              <option value="mflux">mflux (Apple Silicon Macs)</option>
              <option value="comfyui">ComfyUI (any machine; Windows with an NVIDIA card)</option>
            </select>
          </label>
          <label v-if="usesComfyUI" class="flex flex-col gap-1">
            <span class="text-sm text-muted">ComfyUI address</span>
            <input
              v-model.trim="form.imageBaseUrl"
              class="field"
              placeholder="http://127.0.0.1:8188"
              data-image-base-url
            />
            <ComfyStatusLine :status="comfy" @check="checkComfy" />
            <span class="text-sm text-muted">
              Empty for ComfyUI on this machine at its usual port. ComfyUI must be running, with the
              model's files installed (Settings says which when one is missing). Its pictures come
              back through its API, so it can be on another machine.
            </span>
          </label>

          <template v-if="picturesHere">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-muted">Image Model</span>
              <select
                v-model="form.imageModel"
                class="field"
                data-image-model
                @change="onImageModelChange"
              >
                <option v-for="m in imageModels" :key="m.id" :value="m.id">
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
              <label v-if="imageModel?.quantize" class="flex flex-col gap-1">
                <span class="text-sm text-muted">Quantize</span>
                <select v-model="form.quantize" class="field">
                  <option v-for="q in quantizeChoices" :key="String(q.value)" :value="q.value">
                    {{ q.label }}
                  </option>
                </select>
                <span class="text-sm text-muted">
                  Converted as the model loads: less memory on the larger models.
                </span>
              </label>
            </div>

            <label v-if="imageModel?.float16" class="flex items-start gap-2" data-float16>
              <input v-model="form.float16" type="checkbox" class="mt-1" />
              <span class="flex flex-col gap-0.5">
                <span>float16</span>
                <span class="text-sm text-muted">
                  Computes in float16: faster on older Macs (M1, M2), no faster on M4 and M5. The
                  picture changes slightly for the same seed.
                </span>
              </span>
            </label>

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

            <label class="flex flex-col gap-1">
              <span class="text-sm text-muted">Size</span>
              <select v-model="form.size" class="field">
                <option v-for="p in options.sizePresets" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </label>

            <FeatureSwitch
              v-model="form.features.upscale"
              :availability="upscaleAvailability"
              title="Upscale"
              data-feature="upscale"
            >
              Enlarges a picture to 2048 px with SeedVR2, whichever backend rendered it.
            </FeatureSwitch>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-muted">Upscale with</span>
              <select v-model="form.upscaleBackend" class="field" data-upscale-backend>
                <option value="mflux">mflux (Apple Silicon Macs)</option>
                <option value="comfyui">ComfyUI, at the address above</option>
              </select>
              <span class="text-sm text-muted">
                ComfyUI can be another machine: a Mac can render with mflux and upscale on a faster
                PC (SeedVR2 7B: 9.5 s on an RTX 4070 against ~46 s on the Mac). It needs Comfy-Org's
                SeedVR2 files there.
              </span>
            </label>
            <label v-if="upscaleAvailability.available" class="flex flex-col gap-1">
              <span class="text-sm text-muted">Upscaler</span>
              <select v-model="form.upscaler" class="field" data-upscaler>
                <option v-for="u in options.upscalers" :key="u.id" :value="u.id">{{ u.label }}</option>
              </select>
              <span class="text-sm text-muted">Used by Upscale; applies to the next upscale.</span>
            </label>
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
            :availability="voicesAvailability"
            title="Voices"
            data-feature="voices"
          >
            Each Roleplay Character gets a voice designed from their description, and speaks their
            lines.
          </FeatureSwitch>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Speak with</span>
            <select v-model="form.voiceBackend" class="field" data-voice-backend>
              <option value="mlx-audio">The voice service (mlx-audio; Apple Silicon Macs)</option>
              <option value="comfyui">ComfyUI, at the address on the Images tab</option>
            </select>
            <span class="text-sm text-muted">
              Both design a voice with Qwen3-TTS VoiceDesign and clone it with Higgs TTS 3. ComfyUI
              needs TTS Audio Suite's custom nodes (install them through its Manager) and an NVIDIA
              card with 12 GB; there a line takes a few seconds more than on a Mac.
            </span>
          </label>
          <ComfyStatusLine
            v-if="form.voiceBackend === 'comfyui'"
            :status="comfy"
            @check="checkComfy"
          />
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

        <section
          v-show="tab === 'seed'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="seed"
        >
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
            <span class="text-sm text-muted">
              A Session keeps its seed for everything it makes: the Text Model's answers, pictures
              and upscales, and its voice. Asking again (a retry, a new take) moves to another seed,
              so it can come out different. 3D figures always use 42 for now.
            </span>
          </fieldset>
        </section>

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
