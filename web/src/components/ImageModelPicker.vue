<script setup lang="ts" generic="S extends { id: string; settings: SessionSettings; frames: readonly PicturedFrame[] }">
import { computed, ref } from 'vue'
import {
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
  type PicturedFrame,
  type SessionSettings,
  setImageModel,
} from '../api'
import SelectField from './SelectField.vue'
import { byLabel, imageModelOf, useSettingsOptions } from '../composables/useSettingsOptions'

/**
 * The Session's Image Model, switched here (Settings has the one new Sessions start with), and the
 * steps it renders at. Each model under each kind of backend that has it and can render here
 * (mflux, ComfyUI): picking one keeps that kind on the Session, as where it would rather render
 * (ADR 0022); never an address, so its folder can be shared. Switching keeps the old model's
 * pictures, shown again on switching back; a Frame with none by the new model shows changed since
 * render. Renders already under way finish on the old model.
 */
const props = defineProps<{ session: S }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const options = useSettingsOptions()
const switching = ref(false)
const current = computed(() => props.session.settings.imageModel)
/**
 * The kind its renders would go to: the one the Session picked, else where Settings send them,
 * else the first kind here that has the model.
 */
const currentKind = computed(() =>
  props.session.settings.imageBackend ?? options.value?.imageModelsOn?.[current.value] ??
    options.value?.imageBackends?.find((b) =>
      options.value?.imageModels[b]?.some((m) => m.id === current.value)
    )
)
const value = (backend: ImageBackend | undefined, id: string) => `${backend ?? ''}/${id}`
/** Each kind of backend that can render here, with its models. */
const groups = computed(() =>
  (options.value?.imageBackends ?? []).map((backend) => ({
    name: IMAGE_BACKEND_NAMES[backend],
    models: (options.value?.imageModels[backend] ?? []).map((m) => ({
      value: value(backend, m.id),
      label: `${m.label} · ${IMAGE_BACKEND_NAMES[backend]}`,
    })).sort(byLabel),
  })).filter((g) => g.models.length)
)
/** The Session's own, if no group has it (its kind isn't here, or the list hasn't loaded). */
const own = computed(() => {
  const v = value(currentKind.value, current.value)
  return groups.value.some((g) => g.models.some((m) => m.value === v)) ? null : v
})
const model = computed(() => imageModelOf(options.value, current.value, currentKind.value))
/**
 * The steps a render takes: the Session's, or, for a model with only some (presets), its default
 * where the Session's aren't one of them (as `mfluxArgs` renders it).
 */
const steps = computed(() => {
  const { steps } = props.session.settings
  const stepChoices = model.value?.stepChoices
  return !stepChoices || stepChoices.includes(steps) ? steps : model.value!.defaultSteps
})

/** The model being switched to, shown until it's in, or the Session's own if that failed. */
const picked = ref<string>()
const selected = computed({
  get: () => picked.value ?? value(currentKind.value, current.value),
  set: (v: string) => pick(v),
})
async function pick(v: string) {
  picked.value = v
  switching.value = true
  const [backend, id] = v.split('/') as [ImageBackend | '', string]
  try {
    emit('switched', await setImageModel<S>(props.session.id, id, backend || undefined))
  } catch (err) {
    emit('failed', (err as Error).message)
  } finally {
    picked.value = undefined
    switching.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5 text-muted">
    <label
      class="flex items-center gap-1.5"
      title="The Image Model this Session renders with, and where its renders go now (Settings' Machines and Images tabs); Settings has the one new Sessions start with"
    >
      <span class="whitespace-nowrap">Image Model</span>
      <SelectField
        v-model="selected"
        compact
        class="rounded border border-line bg-surface py-0.5 pl-1.5 text-fg"
        :disabled="switching"
        data-image-model
      >
        <option v-if="own" :value="own">{{ model?.label ?? current }}</option>
        <optgroup v-for="g in groups" :key="g.name" :label="g.name">
          <option v-for="m in g.models" :key="m.value" :value="m.value">{{ m.label }}</option>
        </optgroup>
      </SelectField>
    </label>
    <span class="whitespace-nowrap" title="The steps each render takes with this model" data-image-steps>
      · {{ steps }} {{ steps === 1 ? 'step' : 'steps' }}
    </span>
  </div>
</template>
