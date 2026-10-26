<script setup lang="ts" generic="S extends { id: string; settings: Settings; frames: readonly PicturedFrame[] }">
import { computed, ref } from 'vue'
import {
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
  type PicturedFrame,
  setImageModel,
  type Settings,
} from '../api'
import SelectField from './SelectField.vue'
import {
  imageModelChoices,
  imageModelOf,
  useSettingsOptions,
} from '../composables/useSettingsOptions'

/**
 * The Session's Image Model, switched here (Settings has the one new Sessions start with), and the
 * steps it renders at. Every model a Backend listed in Settings can render, by name: where it
 * renders is Settings' to say (ADR 0022). Switching keeps the old model's pictures, shown again on
 * switching back; a Frame with none by the new model shows changed since render. Renders already
 * under way finish on the old model.
 */
const props = defineProps<{ session: S }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const options = useSettingsOptions()
const switching = ref(false)
const current = computed(() => props.session.settings.imageModel)
/** The kind of backend a model's renders go to now, as Settings say. */
const on = (id: string) => options.value?.imageModelsOn?.[id]
const choices = computed(() =>
  imageModelChoices(options.value, current.value).map((m) => {
    const backend = on(m.id)
    return { ...m, backend, label: backend ? `${m.label} · ${IMAGE_BACKEND_NAMES[backend]}` : m.label }
  })
)
/**
 * The models grouped by where their renders go now, as Settings say: a model on both backends is
 * in one, and goes to the other only by changing Settings ("Render on"). The Session's own model,
 * if no Backend renders it now, stands apart.
 */
const groups = computed(() =>
  [
    ...(Object.keys(IMAGE_BACKEND_NAMES) as ImageBackend[]).map((backend) => ({
      name: IMAGE_BACKEND_NAMES[backend],
      models: choices.value.filter((m) => m.backend === backend),
    })),
    { name: 'Not available now', models: choices.value.filter((m) => !m.backend) },
  ].filter((g) => g.models.length)
)
const model = computed(() => imageModelOf(options.value, current.value, on(current.value)))
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
  get: () => picked.value ?? current.value,
  set: (id: string) => pick(id),
})
async function pick(id: string) {
  picked.value = id
  switching.value = true
  try {
    emit('switched', await setImageModel<S>(props.session.id, id))
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
        :disabled="switching || choices.length < 2"
        data-image-model
      >
        <template v-if="groups.length < 2">
          <option v-for="m in choices" :key="m.id" :value="m.id">{{ m.label }}</option>
        </template>
        <optgroup v-for="g in groups" v-else :key="g.name" :label="g.name">
          <option v-for="m in g.models" :key="m.id" :value="m.id">{{ m.label }}</option>
        </optgroup>
      </SelectField>
    </label>
    <span class="whitespace-nowrap" title="The steps each render takes with this model" data-image-steps>
      · {{ steps }} {{ steps === 1 ? 'step' : 'steps' }}
    </span>
  </div>
</template>
