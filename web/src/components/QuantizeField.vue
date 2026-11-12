<script setup lang="ts">
import type { Quantize } from '../api'
import SelectField from './SelectField.vue'
import SettingRow from './SettingRow.vue'

/** Quantize, for a model mflux runs: converted as it loads. The note under it is its slot. */
const value = defineModel<Quantize>({ required: true })

const choices = [
  { value: null, label: 'None (full precision)' },
  { value: 8, label: '8-bit' },
  { value: 4, label: '4-bit' },
] as const
</script>

<template>
  <SettingRow label="Quantize">
    <SelectField v-model="value">
      <option v-for="q in choices" :key="String(q.value)" :value="q.value">
        {{ q.label }}
      </option>
    </SelectField>
    <template #note><slot /></template>
  </SettingRow>
</template>
