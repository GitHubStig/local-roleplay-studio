<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useStoredString } from '../composables/storage'
import { watchDebounced } from '@vueuse/core'
import {
  ApiError,
  getSettings,
  getSettingsOptions,
  type Backend,
  CLIP_SIZE_NAMES,
  type ClipSize,
  type ImageBackend,
  saveSettings,
  type Settings,
  type SettingsOptions,
  type Work,
} from '../api'
import FeatureSwitch from '../components/FeatureSwitch.vue'
import MachinesTab from '../components/MachinesTab.vue'
import NotifyWhenDone from '../components/NotifyWhenDone.vue'
import QuantizeField from '../components/QuantizeField.vue'
import SessionsFolderTab from '../components/SessionsFolderTab.vue'
import RunOn from '../components/RunOn.vue'
import SelectField from '../components/SelectField.vue'
import SettingRow from '../components/SettingRow.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import Icon from '../components/Icon.vue'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import { useBackends } from '../composables/useBackends'
import { useFeatures } from '../composables/useFeatures'
import { useTheme } from '../composables/useTheme'
import { MUSIC_BEHAVIOURS } from '../music'
import {
  byLabel,
  editModelChoices,
  imageModelChoices,
  imageModelOf,
} from '../composables/useSettingsOptions'

const form = ref<Settings | null>(null)
const options = ref<SettingsOptions | null>(null)
// Each saying where its edits would go, as the form stands.
const editModels = computed(() =>
  editModelChoices(options.value?.editModels, (id) => imageKindOf(whereTo('edits', id)))
)
/** The dropdown's order; `editModels.choices` keeps the lists' (`startOn` picks the first). */
const editModelsSorted = computed(() => [...editModels.value.choices].sort(byLabel))
const loadError = ref('')

/** Sets a video model's clip size; its own (`own`) is kept as none, so a change to it applies. */
function setVideoSize(id: string, own: ClipSize, size: ClipSize) {
  if (!form.value) return
  const { [id]: _, ...others } = form.value.videoSizes ?? {}
  form.value.videoSizes = size === own ? others : { ...others, [id]: size }
}
const saving = ref(false)
const status = ref<{ kind: 'saved' | 'error'; message: string; issues?: string[] } | null>(null)

/**
 * The Settings, over the screen they were opened from (`App`): sections down the left, grouped as
 * the models' and the app's, and the section picked on the right, a row per setting, each change
 * saved by itself. The section is in the address (`/settings/images`); at `/settings` it's the one
 * last open, remembered per browser (Text until one is picked). On a phone `/settings` is the
 * list of sections, each opening from it with a way back.
 */
const props = defineProps<{ section?: string }>()
defineEmits<{ close: [] }>()

type SectionId = 'text' | 'images' | 'voice' | 'music' | 'clips' | '3d' | 'machines' | 'sessions' | 'appearance' | 'advanced'
interface Section {
  id: SectionId
  /** In the list. */
  label: string
  /** Over the section. */
  title: string
  /** Under its title: what it's for. */
  about: string
}
const GROUPS: readonly { label: string; sections: readonly Section[] }[] = [
  {
    label: 'Models',
    sections: [
      { id: 'text', label: 'Text', title: 'Text Model', about: 'Writes every Reply, Image Prompt and suggestion.' },
      { id: 'images', label: 'Images', title: 'Images', about: 'Pictures of each Frame, and editing and upscaling them.' },
      { id: 'voice', label: 'Voice', title: 'Voice', about: "The Character's lines, spoken." },
      { id: 'music', label: 'Music', title: 'Music', about: "Music for a Roleplay that follows the story." },
      { id: 'clips', label: 'Clips', title: 'Clips', about: "A Frame's picture made into a short clip." },
      { id: '3d', label: '3D', title: '3D', about: 'A picture made into a scene to turn, or a figure lifted out of it.' },
    ],
  },
  {
    label: 'App',
    sections: [
      { id: 'machines', label: 'Machines', title: 'Machines', about: 'Where the work runs: this machine, and others it can reach.' },
      { id: 'sessions', label: 'Sessions', title: 'Sessions', about: "Where Sessions are kept, and word when one's work is done." },
      { id: 'appearance', label: 'Appearance', title: 'Appearance', about: 'How the app looks, in this browser.' },
      { id: 'advanced', label: 'Advanced', title: 'Advanced', about: "The seed, the Limits, and what's for looking into the app." },
    ],
  },
]
const SECTIONS = GROUPS.flatMap((g) => g.sections)
const isSection = (id: string | null | undefined): id is SectionId => SECTIONS.some((s) => s.id === id)
/** The section last open, remembered per browser, so `/settings` comes back to it. */
const storedTab = useStoredString('settings-tab')
/** The section in the address, if it names one. */
const asked = computed(() => (isSection(props.section) ? props.section : null))
watch(asked, (id) => id && (storedTab.value = id), { immediate: true })
/** The section shown beside the list: the one asked for, else the one last open. */
const tab = computed<SectionId>(() => asked.value ?? (isSection(storedTab.value) ? storedTab.value : 'text'))
const shown = computed(() => SECTIONS.find((s) => s.id === tab.value)!)

const { preference: theme } = useTheme()
const THEME_NAMES = { light: 'Light', dark: 'Dark', system: 'System' } as const
/** What the phone's list says beside a section, where one thing sums it up. */
function summary(id: SectionId): string {
  if (!form.value) return ''
  if (id === 'text') return form.value.textModel
  if (id === 'images') return picturesOn.value ? imageModels.value.find((m) => m.id === form.value!.imageModel)?.label ?? '' : 'Off'
  if (id === 'machines') return String(form.value.backends.length)
  if (id === 'appearance') return THEME_NAMES[theme.value]
  return ''
}
const { refreshFeatures } = useFeatures()


const float16Choices = [
  { value: 'auto', label: 'Automatic (by chip)' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
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
const { choicesFor, whereTo, clipsTo, musicTo, comfy, checkComfy, text } = useBackends(form, options, apiKeys)

/** A Backend taken off the list: work that preferred it moves to the first left that can do it. */
function removeBackend(index: number) {
  if (!form.value) return
  const [gone] = form.value.backends.splice(index, 1)
  for (const work of Object.keys(form.value.runOn) as Work[]) {
    if (form.value.runOn[work] === gone.id) form.value.runOn[work] = choicesFor(work)[0]?.id ?? ''
  }
  if (form.value.videoOn === gone.id) delete form.value.videoOn
  if (form.value.musicOn === gone.id) delete form.value.musicOn
}

/** The ComfyUIs clips and music can go to: only a ComfyUI makes them. */
const clipChoices = computed(() => form.value?.backends.filter((b) => b.kind === 'comfyui') ?? [])
/** Clips on: the ComfyUI chosen, or else where they go now (the one pictures go to, or the first). */
const clipsOn = computed({
  get: () => form.value?.videoOn ?? clipsTo.value?.id ?? '',
  set: (id: string) => {
    if (form.value) form.value.videoOn = id
  },
})

/** Music on: the ComfyUI chosen, or else where it goes now (the one pictures go to, or the first). */
const musicOn = computed({
  get: () => form.value?.musicOn ?? musicTo.value?.id ?? '',
  set: (id: string) => {
    if (form.value) form.value.musicOn = id
  },
})

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

/** The kind of backend a Backend renders on: mflux here, or its ComfyUI. */
const imageKindOf = (b: Backend | undefined): ImageBackend | undefined =>
  b?.kind === 'here' ? 'mflux' : b?.kind === 'comfyui' ? 'comfyui' : undefined
/** Every Image Model a Backend in the form can render, by name, sorted by label (the lists' own order is not the dropdown's). */
const imageModels = computed(() =>
  imageModelChoices(
    options.value,
    form.value?.imageModel,
    choicesFor('images').map(imageKindOf).filter((k): k is ImageBackend => !!k),
    // Named as on the Backend renders prefer.
    () => imageKindOf(form.value?.backends.find((b) => b.id === form.value?.runOn.images)),
  ).sort(byLabel)
)
/** The chosen Image Model's options, where renders go, for the controls only some models have. */
const imageModel = computed(() =>
  form.value && imageModelOf(options.value, form.value.imageModel, imageKindOf(whereTo('images')))
)
/** The Default Image Model, by name; steps start at its own. */
const defaultImageModel = computed({
  get: () => form.value?.imageModel ?? '',
  set(value) {
    if (!form.value) return
    form.value.imageModel = value
    if (imageModel.value) form.value.steps = imageModel.value.defaultSteps
  },
})

/** Whether an extra can run as the form stands: here, or on a Backend listed that runs it. */
const availableFor = (work: 'images' | 'upscale' | 'edits' | 'voices') =>
  computed(() =>
    choicesFor(work).length
      ? { available: true }
      : options.value?.features[work] ?? { available: false }
  )
const imagesAvailability = availableFor('images')
const upscaleAvailability = availableFor('upscale')
const editsAvailability = availableFor('edits')
const voicesAvailability = availableFor('voices')
/** Whether an extra is on and can run, so its options are shown: they're hidden while it's off. */
const isOn = (feature: 'images' | 'upscale' | 'edits' | 'voices', can: { available: boolean }) =>
  !!form.value?.features[feature] && can.available
const picturesOn = computed(() => isOn('images', imagesAvailability.value))
const upscaleOn = computed(() => picturesOn.value && isOn('upscale', upscaleAvailability.value))
const editsOn = computed(() => picturesOn.value && isOn('edits', editsAvailability.value))
const voicesOn = computed(() => isOn('voices', voicesAvailability.value))
/** Whether the default edit model's edits go to mflux, where Quantize applies to them. */
const editsOnMflux = computed(() =>
  !!form.value && imageKindOf(whereTo('edits', form.value.editModel)) === 'mflux'
)

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
  <div
    class="raised flex min-h-0 overflow-hidden bg-canvas sm:rounded-xl sm:border sm:border-line sm:shadow-2xl short:rounded-xl short:border short:border-line"
    data-settings
  >
    <!-- The sections: beside the one shown, or on a phone the first screen. -->
    <nav
      class="flex flex-col gap-0.5 overflow-y-auto p-3 max-sm:flex-1 max-sm:p-4 sm:w-48 sm:shrink-0 sm:border-r sm:border-line"
      :class="{ 'max-sm:hidden': asked }"
      aria-label="Settings sections"
      data-settings-tabs
    >
      <h2 class="px-2 text-lg font-semibold max-sm:text-xl">Settings</h2>
      <!-- Each group under a quiet name, a line between them, so the names don't read as sections. -->
      <div
        v-for="group in GROUPS"
        :key="group.label"
        class="flex flex-col gap-0.5 border-line pt-3 not-first-of-type:mt-3 not-first-of-type:border-t"
        role="group"
        :aria-label="group.label"
      >
        <p class="px-2 pb-1 text-[0.68rem] font-medium uppercase tracking-wider text-muted/75" aria-hidden="true">{{ group.label }}</p>
        <RouterLink
          v-for="t in group.sections"
          :key="t.id"
          :to="`/settings/${t.id}`"
          replace
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:text-fg max-sm:border-b max-sm:border-line max-sm:py-2.5 max-sm:text-fg"
          :class="{ 'sm:bg-surface sm:font-medium sm:text-fg sm:shadow-sm': tab === t.id }"
          :aria-current="tab === t.id ? 'page' : undefined"
          :data-tab="t.id"
        >
          {{ t.label }}
          <span class="ml-auto truncate text-sm text-muted sm:hidden">{{ summary(t.id) }}</span>
          <Icon name="chevron-right" class="shrink-0 text-muted sm:hidden" />
        </RouterLink>
      </div>
    </nav>

    <!-- The section: its heading, what's being saved, then its rows. -->
    <div class="flex min-w-0 flex-1 flex-col" :class="{ 'max-sm:hidden': !asked }">
      <header class="flex shrink-0 flex-col gap-1 border-b border-line px-6 pb-3 pt-4 max-sm:px-4" data-settings-status>
        <RouterLink to="/settings" replace class="-ml-1 flex items-center gap-0.5 self-start text-sm text-muted hover:text-fg sm:hidden" data-settings-back>
          <Icon name="chevron-left" />Settings
        </RouterLink>
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold" data-section-title>{{ shown.title }}</h3>
          <span v-if="saving" class="text-sm text-muted" data-saving>Saving…</span>
          <span v-else-if="status?.kind === 'saved'" class="text-sm text-ok" data-saved>
            {{ status.message }}
          </span>
          <button
            type="button"
            class="ml-auto rounded-md p-1.5 text-muted hover:text-fg max-sm:hidden"
            title="Close (Esc)"
            aria-label="Close Settings"
            data-settings-close
            @click="$emit('close')"
          >
            <Icon name="x" />
          </button>
        </div>
        <p class="text-sm text-muted">{{ shown.about }}</p>
        <div v-if="status?.kind === 'error'" class="text-sm text-danger" data-save-error>
          <p>{{ status.message }}</p>
          <ul v-if="status.issues?.length" class="list-inside list-disc">
            <li v-for="issue in status.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4 max-sm:px-4">
        <p v-if="loadError" class="text-danger">Could not load settings: {{ loadError }}</p>
        <p v-else-if="!form || !options" class="text-muted">Loading…</p>

        <form v-else class="max-w-3xl" @submit.prevent="saveNow">
          <section v-show="tab === 'machines'" class="flex flex-col gap-5" data-tab-panel="machines">
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

          <section v-show="tab === 'text'" data-tab-panel="text">
            <div class="rows">
              <RunOn
                v-model="form.runOn.text"
                label="Runs on"
                :choices="choicesFor('text')"
                data-run-on="text"
              />
              <SettingRow label="Model">
                <SelectField v-model="form.textModel" data-text-model>
                  <option value="" disabled>Choose a model…</option>
                  <option v-for="m in textModelChoices" :key="m" :value="m">{{ m }}</option>
                </SelectField>
                <template v-if="textListing?.textModelsError" #after>
                  <span class="text-sm text-warn">{{ textListing.textModelsError }}</span>
                </template>
              </SettingRow>
              <ToggleSwitch v-model="form.thinking" title="Thinking" :disabled="!canThink" data-thinking>
                The Text Model reasons before answering, and you can watch it. Often more accurate, but
                each Frame takes longer.
                <template v-if="form.textModel && !canThink">{{ form.textModel }} can't think.</template>
              </ToggleSwitch>
            </div>
          </section>

          <section v-show="tab === 'images'" class="flex flex-col gap-8" data-tab-panel="images">
            <div class="rows" data-card="pictures">
              <FeatureSwitch
                v-model="form.features.images"
                :availability="imagesAvailability"
                title="Pictures"
                data-feature="images"
              >
                Render and picture Frames. Off, every Session runs on the Text Model alone: a Roleplay
                is a conversation, a Chain writes prompts and a Storyboard plans, to render later.
              </FeatureSwitch>

              <template v-if="picturesOn">
                <SettingRow label="Default Image Model">
                  <SelectField v-model="defaultImageModel" data-image-model>
                    <option v-for="m in imageModels" :key="m.id" :value="m.id">{{ m.label }}</option>
                  </SelectField>
                  <template #note>
                    What a new Session renders with; each Session can switch to another. mflux runs
                    on Apple Silicon Macs, ComfyUI on any machine (Windows with an NVIDIA card).
                  </template>
                </SettingRow>
                <RunOn
                  v-model="form.runOn.images"
                  label="Render on"
                  :choices="choicesFor('images')"
                  :goes-to="whereTo('images')"
                  :status="comfy[whereTo('images')?.id ?? '']"
                  :uses="['imageModel']"
                  data-run-on="images"
                  @check="checkComfy"
                />
                <SettingRow label="Steps">
                  <SelectField
                    v-if="imageModel?.stepChoices"
                    v-model.number="form.steps"
                    :disabled="imageModel.stepChoices.length < 2"
                    title="This model renders only at these steps"
                    data-step-choices
                  >
                    <option v-for="n in imageModel.stepChoices" :key="n" :value="n">{{ n }}</option>
                  </SelectField>
                  <input v-else v-model.number="form.steps" type="number" min="1" max="100" class="field" />
                </SettingRow>
                <SettingRow label="Size">
                  <SelectField v-model="form.size">
                    <option v-for="p in options.sizePresets" :key="p.id" :value="p.id">{{ p.label }}</option>
                  </SelectField>
                </SettingRow>

                <QuantizeField v-if="imageModel?.quantize" v-model="form.quantize">
                  Converted as the model loads: less memory on the larger models.
                </QuantizeField>

                <SettingRow v-if="imageModel?.stepCache" label="Step cache" data-step-cache>
                  <SelectField v-model="form.stepCache">
                    <option v-for="c in stepCacheChoices" :key="String(c.value)" :value="c.value">
                      {{ c.label }}
                    </option>
                  </SelectField>
                  <template #note>
                    Skips this share of the steps that change the picture least, reusing the one
                    before. At 0.4 it looks near the same.
                  </template>
                </SettingRow>

                <SettingRow v-if="imageModel?.float16" label="float16" data-float16>
                  <SelectField v-model="form.float16">
                    <option v-for="c in float16Choices" :key="c.value" :value="c.value">
                      {{ c.label }}
                    </option>
                  </SelectField>
                  <template #note>
                    Faster on M1 and M2 Macs, no faster on M4 and M5 (measured on an M5 Pro; M3 is
                    unmeasured). Automatic turns it on for M1 to M3. The picture changes slightly for
                    the same seed.
                  </template>
                </SettingRow>

                <ToggleSwitch
                  v-if="whereTo('images')?.kind === 'comfyui'"
                  v-model="form.previews"
                  title="Show the picture forming"
                  data-previews
                >
                  While a picture renders, it forms over the last one from ComfyUI's preview at each
                  step: soft at first, sharper as it goes. Costs no time. mflux sends none.
                </ToggleSwitch>
              </template>
            </div>

            <div v-if="picturesOn" class="rows" data-card="edits">
              <FeatureSwitch
                v-model="form.features.edits"
                :availability="editsAvailability"
                title="Edits"
                data-feature="edits"
              >
                Repaints part of a picture as told, as a version beside it: paint over a bad hand,
                say what to paint there instead.
              </FeatureSwitch>
              <template v-if="editsOn">
                <SettingRow label="Default edit model">
                  <SelectField v-model="form.editModel" data-edit-model>
                    <option v-if="!editModels.choices.some((m) => m.id === form?.editModel)" :value="form.editModel">
                      {{ form.editModel }} (not available here)
                    </option>
                    <option v-for="m in editModelsSorted" :key="m.id" :value="m.id">{{ m.label }}</option>
                  </SelectField>
                  <template #note>What an edit starts on; the Edit dialog can choose another.</template>
                </SettingRow>
                <RunOn
                  v-model="form.runOn.edits"
                  label="Edit on"
                  :choices="choicesFor('edits')"
                  :goes-to="whereTo('edits')"
                  :status="comfy[whereTo('edits')?.id ?? '']"
                  :uses="[]"
                  data-run-on="edits"
                  @check="checkComfy"
                />
                <QuantizeField v-if="editsOnMflux" v-model="form.editQuantize" data-edit-quantize>
                  For edits on this Mac. 8-bit takes about half the memory of full precision, in
                  the same time.
                </QuantizeField>
              </template>
            </div>

            <div v-if="picturesOn" class="rows" data-card="upscale">
              <FeatureSwitch
                v-model="form.features.upscale"
                :availability="upscaleAvailability"
                title="Upscale"
                data-feature="upscale"
              >
                Enlarges a picture to 2048 px with SeedVR2, whichever backend rendered it.
              </FeatureSwitch>
              <template v-if="upscaleOn">
                <SettingRow label="Default upscaler">
                  <SelectField v-model="form.upscaler" data-upscaler>
                    <option v-for="u in options.upscalers" :key="u.id" :value="u.id">{{ u.label }}</option>
                  </SelectField>
                  <template #note>Applies to the next upscale, in running Sessions too.</template>
                </SettingRow>
                <RunOn
                  v-model="form.runOn.upscale"
                  label="Upscale on"
                  :choices="choicesFor('upscale')"
                  :goes-to="whereTo('upscale')"
                  :status="comfy[whereTo('upscale')?.id ?? '']"
                  :uses="['upscaler']"
                  data-run-on="upscale"
                  @check="checkComfy"
                >
                  Whichever rendered the picture: a Mac can render with mflux and upscale on a
                  faster PC (SeedVR2 7B: 9.5 s on an RTX 4070 against ~46 s on the Mac), with
                  Comfy-Org's SeedVR2 files there.
                </RunOn>
              </template>
            </div>
          </section>

          <section v-show="tab === 'voice'" data-tab-panel="voice">
            <div class="rows">
              <FeatureSwitch
                v-model="form.features.voices"
                :availability="voicesAvailability"
                title="Voices"
                data-feature="voices"
              >
                Each Roleplay Character gets a voice designed from their description, and speaks
                their lines.
              </FeatureSwitch>
              <RunOn
                v-if="voicesOn"
                v-model="form.runOn.voices"
                label="Voices on"
                :choices="choicesFor('voices')"
                :goes-to="whereTo('voices')"
                :status="comfy[whereTo('voices')?.id ?? '']"
                :uses="['voices']"
                data-run-on="voices"
                @check="checkComfy"
              >
                This machine's voice service (mlx-audio, Apple Silicon Macs) or a ComfyUI both design
                a voice with Qwen3-TTS VoiceDesign and clone it with Higgs TTS 3. ComfyUI needs TTS
                Audio Suite's custom nodes (install them through its Manager) and an NVIDIA card with
                12 GB; there a line takes a few seconds more than on a Mac.
              </RunOn>
            </div>
          </section>

          <section v-show="tab === 'music'" data-tab-panel="music">
            <div class="rows">
              <ToggleSwitch v-model="form.music" title="Music" data-music>
                Music for Roleplays that follows the story, made on a ComfyUI.
                <template v-if="form.music">Each new Roleplay keeps these as they are when it starts.</template>
              </ToggleSwitch>
              <template v-if="form.music">
                <fieldset class="flex flex-col gap-2" data-music-behaviour>
                  <legend class="sr-only">Behaviour</legend>
                  <span aria-hidden="true">Behaviour</span>
                  <label v-for="b in MUSIC_BEHAVIOURS" :key="b.id" class="flex items-start gap-2 text-sm">
                    <input v-model="form.musicBehaviour" type="radio" :value="b.id" class="mt-1" />
                    <span><span class="font-medium">{{ b.label }}</span>: <span class="text-muted">{{ b.about }}</span></span>
                  </label>
                </fieldset>
                <label class="flex flex-col gap-1.5" data-music-taste>
                  <span>Music taste</span>
                  <textarea
                    v-model="form.musicTaste"
                    rows="2"
                    class="field"
                    placeholder="Orchestral, no electronic instruments, ambience over melody…"
                  />
                  <span class="text-sm text-muted">
                    In your own words, for every Roleplay's music: what you like and what to avoid.
                  </span>
                </label>
                <RunOn
                  v-if="clipChoices.length"
                  v-model="musicOn"
                  label="Music on"
                  :choices="clipChoices"
                  :goes-to="musicTo"
                  :status="comfy[musicTo?.id ?? '']"
                  :uses="['music']"
                  data-run-on="music"
                  @check="checkComfy"
                >
                  A ComfyUI with ACE-Step 1.5's files: the XL turbo and its 4B planner. Until one is
                  chosen, music goes to the ComfyUI pictures go to, or else the first. On the machine
                  that runs the Text Model, a Reply waits for any track being made, which can take
                  minutes: another machine's ComfyUI avoids that.
                </RunOn>
              </template>
            </div>
          </section>

          <section v-show="tab === 'clips'" data-tab-panel="clips">
            <div class="rows">
              <FeatureSwitch
                v-model="form.features.video"
                :availability="options.features.video"
                title="Clips"
                data-feature="video"
              >
                A Frame's picture made into a short clip by a video model, from the Clip button on
                it: leading up to the picture, going on from it, looping on it, or into the next
                Frame's. The Text Model writes each clip's prompt from the story, for you to edit.
              </FeatureSwitch>
              <template v-if="form.features.video && options.features.video?.available">
                <SettingRow label="Default video model">
                  <SelectField v-model="form.videoModel" data-video-model>
                    <option v-for="m in options.videoModels" :key="m.id" :value="m.id">{{ m.label }}</option>
                  </SelectField>
                  <template #note>
                    What a Session's clips start on; each Frame's Clips can pick another, and keep a
                    clip of each kind per model, to compare. On an RTX 4070 with 12 GB, a 5-second
                    clip takes about two minutes with LTX 2.5, and one and a half with Wan 2.2 or
                    MiniMax H3, each at its own size.
                  </template>
                </SettingRow>
                <SettingRow label="Clip size" as="div">
                  <label
                    v-for="m in options.videoModels"
                    :key="m.id"
                    class="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{{ m.label }}</span>
                    <SelectField
                      :model-value="form.videoSizes?.[m.id] ?? m.size"
                      compact
                      class="field w-auto"
                      :data-video-size="m.id"
                      @update:model-value="setVideoSize(m.id, m.size, $event as ClipSize)"
                    >
                      <option v-for="(name, s) in CLIP_SIZE_NAMES" :key="s" :value="s">
                        {{ name }}{{ s === m.size ? ' (its own)' : '' }}
                      </option>
                    </SelectField>
                  </label>
                  <template #note>
                    Small (about 0.4 megapixels) is faster; Large is the size each model was trained
                    at (about 0.9), sharper, and a different take of the clip. Large takes Wan 2.2
                    and MiniMax H3 about three times as long, and Wan 2.2 makes up to 5 seconds at
                    Large: longer runs out of a 12 GB card's memory.
                  </template>
                </SettingRow>
                <RunOn
                  v-if="clipChoices.length"
                  v-model="clipsOn"
                  label="Clips on"
                  :choices="clipChoices"
                  :goes-to="clipsTo"
                  :status="comfy[clipsTo?.id ?? '']"
                  :uses="['videoModel']"
                  data-run-on="video"
                  @check="checkComfy"
                >
                  A ComfyUI with the video model's files, from ComfyUI's own template for it. Until
                  one is chosen, clips go to the ComfyUI pictures go to, or else the first.
                </RunOn>
              </template>
            </div>
          </section>

          <section v-show="tab === '3d'" data-tab-panel="3d">
            <div class="rows">
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
                VAST's TripoSplat lifts the person in a picture out as a 3D figure that turns all the
                way round.
              </FeatureSwitch>
              <FeatureSwitch
                v-model="form.features.lito"
                :availability="options.features.lito"
                title="LiTo"
                data-feature="lito"
              >
                Apple's LiTo does the same as TripoSplat, through mlx-spatial (research-only licence).
              </FeatureSwitch>
            </div>
          </section>

          <section v-show="tab === 'sessions'" data-tab-panel="sessions">
            <div class="rows">
              <SessionsFolderTab />
              <NotifyWhenDone />
            </div>
          </section>

          <section v-show="tab === 'appearance'" data-tab-panel="appearance">
            <div class="rows">
              <SettingRow label="Theme" as="div">
                <ThemeToggle class="self-start sm:self-end" data-theme-choice />
                <template #note>
                  System follows your computer's light or dark mode. The theme button on the rail
                  steps through the same three.
                </template>
              </SettingRow>
            </div>
          </section>

          <section v-show="tab === 'advanced'" data-tab-panel="advanced">
            <div class="rows">
              <fieldset class="flex flex-col gap-2">
                <legend class="sr-only">Seed</legend>
                <span aria-hidden="true">Seed</span>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="form.seedMode" type="radio" value="random" />
                  New random seed each Session
                </label>
                <label class="flex items-center gap-2 text-sm">
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
              <ToggleSwitch v-model="form.limits" title="Limits" data-limits>
                On: no sexual or nude content, or restraint. Age is unrestricted. Real people are allowed.
                Off: no Limits are enforced. Applies at once, to running Sessions too.
              </ToggleSwitch>
              <ToggleSwitch v-model="form.callLog" title="Call log" data-call-log>
                Writes every call to the Text Model and the Image Model (renders and upscales) into
                the Session's folder, under <code>calls/</code>: what was sent, and what came back.
                One file per Frame, and <code>setup.json</code> for the rest. Applies from the next
                thing a Session does.
              </ToggleSwitch>
              <FeatureSwitch
                v-model="form.features.style"
                :availability="options.features.style"
                title="Image comparison style scores"
                data-feature="style"
              >
                Compare's Scores measure how much each Image Model's art style varies across the
                Frames, with CSD and CLIP (4 GB, downloaded the first time).
              </FeatureSwitch>
            </div>
          </section>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../style.css";

/** A group of Settings: a row each, a line between them and none around. */
.rows {
  @apply flex min-w-0 flex-col;
}
.rows > * {
  @apply border-t border-line py-3.5 first:border-t-0 first:pt-0;
}
</style>
