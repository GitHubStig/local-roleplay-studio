<script setup lang="ts" generic="S extends { id: string; settings: Settings; frames: readonly PicturedFrame[] }">
import { computed, ref } from 'vue'
import {
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
  type PicturedFrame,
  setImageModel,
  type Settings,
} from '../api'
import { useImageModels, useSettingsOptions } from '../composables/useSettingsOptions'

/**
 * The Session's Image Model, switched here (Settings has the one new Sessions start with), and the
 * steps it renders at. Where more than one Image backend can render here, each has its models, so
 * the Session can move to another backend too. Switching keeps the old model's pictures, shown
 * again on switching back; a Frame with none by the new model shows changed since render. A model
 * of the same name on another backend counts as the same, so its pictures stay. Renders already
 * under way finish on the old model.
 */
const props = defineProps<{ session: S }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const options = useSettingsOptions()
const { modelsOf } = useImageModels()
const switching = ref(false)
/** The backends to choose from: those that can render here, and always the Session's own. */
const backends = computed<ImageBackend[]>(() => {
  const own = props.session.settings.imageBackend
  const here = options.value?.imageBackends ?? []
  return here.includes(own) ? here : [own, ...here]
})
const choices = computed(() =>
  backends.value.map((backend) => ({
    backend,
    name: IMAGE_BACKEND_NAMES[backend],
    models: modelsOf(backend).map((m) => ({ ...m, value: `${backend}/${m.id}` })),
  }))
)
/** The Session's backend and model, as the options' values name them. */
const current = computed(() => {
  const { imageBackend, imageModel } = props.session.settings
  return `${imageBackend}/${imageModel}`
})
const model = computed(() => {
  const { imageBackend, imageModel } = props.session.settings
  return modelsOf(imageBackend).find((m) => m.id === imageModel)
})
/**
 * The steps a render takes: the Session's, or, for a model with only some (presets), its default
 * where the Session's aren't one of them (as `mfluxArgs` renders it).
 */
const steps = computed(() => {
  const { steps } = props.session.settings
  const stepChoices = model.value?.stepChoices
  return !stepChoices || stepChoices.includes(steps) ? steps : model.value!.defaultSteps
})

async function pick(select: HTMLSelectElement) {
  switching.value = true
  try {
    const [backend, id] = select.value.split('/') as [ImageBackend, string]
    emit('switched', await setImageModel<S>(props.session.id, id, backend))
  } catch (err) {
    select.value = current.value
    emit('failed', (err as Error).message)
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5 text-muted">
    <label
      class="flex items-center gap-1.5"
      title="The Image Model this Session renders with, and on which backend; Settings has the one new Sessions start with"
    >
      Image Model
      <select
        class="rounded border border-line bg-surface px-1.5 py-0.5 text-fg"
        :value="current"
        :disabled="switching || choices.flatMap((c) => c.models).length < 2"
        data-image-model
        @change="pick($event.target as HTMLSelectElement)"
      >
        <!-- Its own model, even before the list loads. -->
        <option v-if="!model" :value="current">{{ session.settings.imageModel }}</option>
        <template v-if="choices.length < 2">
          <option v-for="m in choices[0]?.models" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </template>
        <optgroup v-for="c in choices" v-else :key="c.backend" :label="c.name">
          <option v-for="m in c.models" :key="m.value" :value="m.value">
            {{ m.label }} · {{ c.name }}
          </option>
        </optgroup>
      </select>
    </label>
    <span title="The steps each render takes with this model" data-image-steps>
      · {{ steps }} {{ steps === 1 ? 'step' : 'steps' }}
    </span>
  </div>
</template>
