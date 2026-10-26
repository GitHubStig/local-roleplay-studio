<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import {
  ApiError,
  getSettings,
  getSettingsOptions,
  type ImageBackend,
  saveSettings,
  type Settings,
  type SettingsOptions,
  type Work,
} from '../api'
import BackendOptions from '../components/BackendOptions.vue'
import FeatureSwitch from '../components/FeatureSwitch.vue'
import MachinesTab from '../components/MachinesTab.vue'
import RunOn from '../components/RunOn.vue'
import { useBackends } from '../composables/useBackends'
import { useFeatures } from '../composables/useFeatures'
import {
  backendGroups,
  editModelChoices,
  fromOnBackend,
  onBackend,
} from '../composables/useSettingsOptions'

const form = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
const editModels = computed(() => editModelChoices(options.value?.editModels))
const loadError = ref('')
const saving = ref(false)
const status = ref<{ kind: 'saved' | 'error'; message: string; issues?: string[] } | null>(null)

/**
 * The Settings: the Machines first (the Backends there are), a tab per part of the app (the Text
 * Model's, each extra's), then Advanced: what applies to every model (the Limits, the seed), and
 * what's for looking into the app (the call log, the style scores).
 */
const TABS = [
  { id: 'machines', label: 'Machines' },
  { id: 'text', label: 'Text' },
  { id: 'images', label: 'Images' },
  { id: 'voice', label: 'Voice' },
  { id: '3d', label: '3D' },
  { id: 'advanced', label: 'Advanced' },
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

/** New API keys typed, by Backend id; saved when a field is left. */
const apiKeys = ref<Record<string, string>>({})
const { choicesFor, whereTo, comfy, checkComfy, text } = useBackends(form, options, apiKeys)

/** A Backend taken off the list: work that preferred it moves to the first left that can do it. */
function removeBackend(index: number) {
  if (!form.value) return
  const [gone] = form.value.backends.splice(index, 1)
  for (const work of Object.keys(form.value.runOn) as Work[]) {
    if (form.value.runOn[work] === gone.id) form.value.runOn[work] = choicesFor(work)[0]?.id ?? ''
  }
}

/** What the Text Model's Backend lists: as listed on this page, or as the server did on load. */
const textListing = computed(() => (form.value && text.value[form.value.runOn.text]) ?? options.value)

/** Keep a stored Text Model visible even if its Backend no longer lists it. */
const textModelChoices = computed(() => {
  const models = textListing.value?.textModels ?? []
  const current = form.value?.textModel
  return current && !models.includes(current) ? [current, ...models] : models
})

/** Thinking only applies to Text Models that support it. */
const canThink = computed(() =>
  !!form.value && (textListing.value?.thinkingModels ?? []).includes(form.value.textModel)
)

const imageModelsOf = (backend: ImageBackend) => options.value?.imageModels[backend] ?? []
/** Every backend's Image Models, as the Session's Image Model picker lists them. */
const imageModelGroups = computed(() =>
  backendGroups(options.value, form.value?.imageBackend ?? 'mflux', imageModelsOf)
)
/** The chosen Image Model's options, for the controls only some models have. */
const imageModel = computed(() =>
  form.value && imageModelsOf(form.value.imageBackend).find((m) => m.id === form.value?.imageModel)
)
/** The Default Image Model and its backend, picked together; steps start at the model's own. */
const defaultImageModel = computed({
  get: () => form.value ? onBackend(form.value.imageBackend, form.value.imageModel) : '',
  set(value) {
    if (!form.value) return
    ;[form.value.imageBackend, form.value.imageModel] = fromOnBackend(value)
    if (imageModel.value) form.value.steps = imageModel.value.defaultSteps
  },
})

/** Whether an extra can run as the form stands: here, or on a Backend listed that runs it. */
const availableFor = (work: 'images' | 'upscale' | 'voices') =>
  computed(() =>
    choicesFor(work).length
      ? { available: true }
      : options.value?.features[work] ?? { available: false }
  )
const imagesAvailability = availableFor('images')
const upscaleAvailability = availableFor('upscale')
const voicesAvailability = availableFor('voices')
const picturesHere = computed(() => imagesAvailability.value.available)

/** The form as last saved (or loaded), so an unchanged one isn't saved again. */
let savedJson = ''
const formJson = () => JSON.stringify(form.value)

/**
 * Saves the form, and with it `keys` when given (by Backend id; '' removes one). What the server
 * turns down (an address half typed, say) isn't saved, and says why at the top; the next change
 * tries again. The form isn't replaced by what comes back, so typing meanwhile isn't lost.
 */
async function save(keys?: Record<string, string>) {
  if (!form.value) return
  const json = formJson()
  if (json === savedJson && keys === undefined) {
    // Back to what's saved (an address put right, say): what was turned down no longer stands.
    if (status.value?.kind === 'error') status.value = null
    return
  }
  const before = savedJson
  savedJson = json
  saving.value = true
  try {
    const saved = await saveSettings({ ...form.value, apiKeys: keys })
    if (JSON.stringify(form.value.apiKeysSet) !== JSON.stringify(saved.apiKeysSet)) {
      form.value.apiKeysSet = saved.apiKeysSet
      if (savedJson === json) savedJson = formJson()
    }
    for (const id of Object.keys(keys ?? {})) delete apiKeys.value[id]
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

/** A Backend's new API key, or its removal (''). */
const saveKey = (id: string, key: string) => save({ [id]: key })
/** Enter in a field saves at once, with any API key typed. */
function saveNow() {
  const typed = Object.entries(apiKeys.value).filter(([, key]) => key.trim())
  return save(typed.length ? Object.fromEntries(typed.map(([id, k]) => [id, k.trim()])) : undefined)
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
          v-show="tab === 'machines'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="machines"
        >
          <MachinesTab
            v-model:backends="form.backends"
            v-model:api-keys="apiKeys"
            :here="options.here"
            :comfy="comfy"
            :text="text"
            :api-keys-set="form.apiKeysSet ?? []"
            @check="checkComfy"
            @remove="removeBackend"
            @save-key="saveKey"
          />
        </section>

        <section
          v-show="tab === 'text'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="text"
        >
          <RunOn
            v-model="form.runOn.text"
            label="Text Model runs on"
            :choices="choicesFor('text')"
            data-run-on="text"
          />

          <label class="flex flex-col gap-1">
            <span class="text-sm text-muted">Text Model</span>
            <select v-model="form.textModel" class="field" data-text-model>
              <option value="" disabled>Choose a model…</option>
              <option v-for="m in textModelChoices" :key="m" :value="m">{{ m }}</option>
            </select>
            <span v-if="textListing?.textModelsError" class="text-sm text-warn">
              {{ textListing.textModelsError }}
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
            <span class="text-sm text-muted">Default Image Model</span>
            <select v-model="defaultImageModel" class="field" data-image-model>
              <BackendOptions :groups="imageModelGroups" />
            </select>
            <span class="text-sm text-muted">
              What a new Session renders with; each Session can switch to another. mflux runs on
              Apple Silicon Macs, ComfyUI on any machine (Windows with an NVIDIA card).
            </span>
          </label>
          <RunOn
            v-model="form.runOn.images"
            label="Render on"
            :choices="choicesFor('images')"
            :goes-to="whereTo('images')"
            :status="comfy[whereTo('images')?.id ?? '']"
            data-run-on="images"
            @check="checkComfy"
          />

          <template v-if="picturesHere">
            <label
              v-if="form.imageBackend === 'comfyui'"
              class="flex items-start gap-2"
              data-previews
            >
              <input v-model="form.previews" type="checkbox" class="mt-1" />
              <span class="flex flex-col gap-0.5">
                <span>Show the picture forming</span>
                <span class="text-sm text-muted">
                  While a picture renders, it forms over the last one from ComfyUI's preview at each
                  step: soft at first, sharper as it goes. Costs no time. mflux sends none.
                </span>
              </span>
            </label>

            <div class="grid grid-cols-2 gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-sm text-muted">Steps</span>
                <select
                  v-if="imageModel?.stepChoices"
                  v-model.number="form.steps"
                  class="field"
                  :disabled="imageModel.stepChoices.length < 2"
                  title="This model renders only at these steps"
                  data-step-choices
                >
                  <option v-for="n in imageModel.stepChoices" :key="n" :value="n">{{ n }}</option>
                </select>
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

            <label v-if="imageModel?.stepCache" class="flex flex-col gap-1" data-step-cache>
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
              <span class="text-sm text-muted">Default upscaler</span>
              <select v-model="form.upscaler" class="field" data-upscaler>
                <option v-for="u in options.upscalers" :key="u.id" :value="u.id">{{ u.label }}</option>
              </select>
              <span class="text-sm text-muted">Applies to the next upscale, in running Sessions too.</span>
            </label>
            <RunOn
              v-model="form.runOn.upscale"
              label="Upscale on"
              :choices="choicesFor('upscale')"
              :goes-to="whereTo('upscale')"
              :status="comfy[whereTo('upscale')?.id ?? '']"
              data-run-on="upscale"
              @check="checkComfy"
            >
              Whichever rendered the picture: a Mac can render with mflux and upscale on a faster PC
              (SeedVR2 7B: 9.5 s on an RTX 4070 against ~46 s on the Mac), with Comfy-Org's SeedVR2
              files there.
            </RunOn>
            <FeatureSwitch
              v-model="form.features.edits"
              :availability="options.features.edits"
              title="Edits"
              data-feature="edits"
            >
              Repaints part of a picture as told, as a version beside it: paint over a bad hand, say
              what to paint there instead.
            </FeatureSwitch>
            <label v-if="options.features.edits.available" class="flex flex-col gap-1">
              <span class="text-sm text-muted">Default edit model</span>
              <select v-model="form.editModel" class="field" data-edit-model>
                <option v-if="!editModels.choices.some((m) => m.id === form?.editModel)" :value="form.editModel">
                  {{ form.editModel }} (not available here)
                </option>
                <option v-for="m in editModels.choices" :key="m.id" :value="m.id">{{ m.label }}</option>
              </select>
              <span class="text-sm text-muted">
                What an edit starts on; the Edit dialog can choose another.
              </span>
            </label>
            <RunOn
              v-if="options.features.edits.available"
              v-model="form.runOn.edits"
              label="Edit on"
              :choices="choicesFor('edits')"
              :goes-to="whereTo('edits')"
              :status="comfy[whereTo('edits')?.id ?? '']"
              data-run-on="edits"
              @check="checkComfy"
            />
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
          <RunOn
            v-model="form.runOn.voices"
            label="Voices on"
            :choices="choicesFor('voices')"
            :goes-to="whereTo('voices')"
            :status="comfy[whereTo('voices')?.id ?? '']"
            data-run-on="voices"
            @check="checkComfy"
          >
            This machine's voice service (mlx-audio, Apple Silicon Macs) or a ComfyUI both design a
            voice with Qwen3-TTS VoiceDesign and clone it with Higgs TTS 3. ComfyUI needs TTS Audio
            Suite's custom nodes (install them through its Manager) and an NVIDIA card with 12 GB;
            there a line takes a few seconds more than on a Mac.
          </RunOn>
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
          v-show="tab === 'advanced'"
          class="flex flex-col gap-5"
          role="tabpanel"
          data-tab-panel="advanced"
        >
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
          <label class="flex items-start gap-2">
            <input v-model="form.callLog" type="checkbox" class="mt-1" data-call-log />
            <span class="flex flex-col gap-0.5">
              <span>Call log</span>
              <span class="text-sm text-muted">
                Writes every call to the Text Model and the Image Model (renders and upscales) into
                the Session's folder, under <code>calls/</code>: what was sent, and what came back.
                One file per Frame, and <code>setup.json</code> for the rest. Applies from the next
                thing a Session does.
              </span>
            </span>
          </label>
          <FeatureSwitch
            v-model="form.features.style"
            :availability="options.features.style"
            title="Image comparison style scores"
            data-feature="style"
          >
            Compare measures how much each Image Model's art style varies across the Frames, with
            CSD and CLIP (4 GB, downloaded the first time).
          </FeatureSwitch>
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
