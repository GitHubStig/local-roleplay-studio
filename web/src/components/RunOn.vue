<script setup lang="ts">
import { type Backend, BACKEND_NAMES, type ComfyStatus } from '../api'
import ComfyStatusLine from './ComfyStatusLine.vue'
import SelectField from './SelectField.vue'

/**
 * Which Backend a kind of work prefers, on its Settings tab (ADR 0022), and where it goes as
 * things stand: there, or the next on the Machines tab that can, with a ComfyUI's check.
 */
defineProps<{
  label: string
  /** The Backends that can do the work. */
  choices: Backend[]
  /** Where it goes now; none if no Backend can. */
  goesTo?: Backend
  /** Its check, when it goes to a ComfyUI. */
  status?: ComfyStatus | 'checking'
}>()
const preferred = defineModel<string>({ required: true })
defineEmits<{ check: [backend: Backend] }>()

/** A Backend as named here, with its address where it has one. */
const named = (b: Backend) =>
  b.kind === 'here' ? 'This machine' : `${BACKEND_NAMES[b.kind]}${b.address ? ` at ${b.address}` : ''}`
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="text-sm text-muted">{{ label }}</span>
    <SelectField
      v-model="preferred"
      :disabled="choices.length < 2"
    >
      <option v-if="!choices.some((b) => b.id === preferred)" :value="preferred" disabled>
        None: add one on the Machines tab
      </option>
      <option v-for="b in choices" :key="b.id" :value="b.id">{{ named(b) }}</option>
    </SelectField>
    <span v-if="$slots.default" class="text-sm text-muted"><slot /></span>
    <span v-if="goesTo && goesTo.id !== preferred" class="text-sm text-warn" data-goes-to>
      That can't run the model chosen, so it goes to {{ named(goesTo) }}.
    </span>
    <ComfyStatusLine
      v-if="goesTo?.kind === 'comfyui'"
      :status="status ?? null"
      @check="$emit('check', goesTo)"
    />
  </label>
</template>
