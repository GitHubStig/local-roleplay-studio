<script setup lang="ts">
import { type ThemePreference, useTheme } from '../composables/useTheme'

const { preference } = useTheme()

const choices: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
</script>

<template>
  <div role="group" aria-label="Theme" class="flex rounded-lg border border-line p-0.5 text-sm">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      class="rounded-md px-2.5 py-1 text-muted aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-sm"
      :aria-pressed="preference === choice.value"
      @click="preference = choice.value"
    >
      {{ choice.label }}
    </button>
  </div>
</template>
