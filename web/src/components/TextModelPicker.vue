<script setup lang="ts" generic="S extends { id: string; settings: SessionSettings }">
import { computed, ref } from 'vue'
import { type SessionSettings, setTextModel } from '../api'
import SelectField from './SelectField.vue'
import { useSettingsOptions } from '../composables/useSettingsOptions'

/**
 * The Session's Text Model, switched here (Settings has the one new Sessions start with; ADR 0037):
 * the models the Backend Settings send text to lists, and the Session's own if it doesn't. Its
 * Thinking stays as it started. What's being written finishes on the old model, as do jobs queued
 * before.
 */
const props = defineProps<{ session: S }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const options = useSettingsOptions()
const switching = ref(false)
const current = computed(() => props.session.settings.textModel)
/** The Backend's models, with the Session's own first if it doesn't list it. */
const models = computed(() => {
  const listed = options.value?.textModels ?? []
  return current.value && !listed.includes(current.value) ? [current.value, ...listed] : listed
})

/** The model being switched to, shown until it's in. */
const picked = ref<string>()
const selected = computed({
  get: () => picked.value ?? current.value,
  set: (model: string) => switchTo(model),
})
async function switchTo(model: string) {
  picked.value = model
  switching.value = true
  try {
    emit('switched', await setTextModel<S>(props.session.id, model))
  } catch (err) {
    emit('failed', (err as Error).message)
  } finally {
    picked.value = undefined
    switching.value = false
  }
}
</script>

<template>
  <label
    class="flex items-center gap-1.5 text-muted"
    title="The Text Model this Session writes with; Settings has the one new Sessions start with. Switching to a model that isn't loaded loads it, which takes a while the first time"
  >
    <span class="whitespace-nowrap">Text Model</span>
    <SelectField
      v-model="selected"
      compact
      class="rounded border border-line bg-surface py-0.5 pl-1.5 text-fg"
      :disabled="switching"
      data-text-model
    >
      <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
    </SelectField>
  </label>
</template>
