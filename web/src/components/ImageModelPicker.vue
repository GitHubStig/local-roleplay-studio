<script setup lang="ts" generic="S extends { id: string; settings: Settings; frames: readonly PicturedFrame[] }">
import { computed, ref } from 'vue'
import { type PicturedFrame, setImageModel, type Settings } from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import { useFeatures } from '../composables/useFeatures'

/**
 * The Session's Image Model, switched here (Settings has the one new Sessions start with), and the
 * steps it renders at. Switching keeps the old model's pictures, shown again on switching back; a
 * Frame with none by the new model shows changed since render. Renders already under way finish on
 * the old model.
 */
const props = defineProps<{ session: S }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const { modelsOf, find } = useImageModels()
const switching = ref(false)
/** Settings as they are now, which say how a render runs (Fast, among others). */
const { settings: current } = useFeatures()

/**
 * The steps a render takes: the model's fast mode's when Fast is on in Settings now and it has
 * one, else the Session's.
 */
const steps = computed(() => {
  const { imageModel, steps } = props.session.settings
  const fastSteps = find(imageModel)?.fastSteps
  return current.value?.fast && fastSteps ? fastSteps : steps
})

async function pick(select: HTMLSelectElement) {
  switching.value = true
  try {
    emit('switched', await setImageModel<S>(props.session.id, select.value))
  } catch (err) {
    select.value = props.session.settings.imageModel
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
      title="The Image Model this Session renders with; Settings has the one new Sessions start with"
    >
      Image Model
      <select
        class="rounded border border-line bg-surface px-1.5 py-0.5 text-fg"
        :value="session.settings.imageModel"
        :disabled="switching || modelsOf(session.settings.imageBackend).length < 2"
        data-image-model
        @change="pick($event.target as HTMLSelectElement)"
      >
        <!-- Its own model, even before the list loads. -->
        <option
          v-if="!find(session.settings.imageModel)"
          :value="session.settings.imageModel"
        >
          {{ session.settings.imageModel }}
        </option>
        <option v-for="m in modelsOf(session.settings.imageBackend)" :key="m.id" :value="m.id">
          {{ m.label }}
        </option>
      </select>
    </label>
    <span title="The steps each render takes with this model" data-image-steps>
      · {{ steps }} {{ steps === 1 ? 'step' : 'steps' }}
    </span>
  </div>
</template>
