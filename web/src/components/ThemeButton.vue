<script setup lang="ts">
import { computed } from 'vue'
import { type ThemePreference, useTheme } from '../composables/useTheme'
import Icon from './Icon.vue'

/**
 * The rail's theme button: one button that steps through Light, Dark and System, its icon showing
 * which is on. (The exported page keeps `ThemeToggle`, the three side by side.)
 */
const { preference } = useTheme()

const STEPS: Record<ThemePreference, { icon: string; label: string; next: ThemePreference }> = {
  light: { icon: 'sun', label: 'Light', next: 'dark' },
  dark: { icon: 'moon', label: 'Dark', next: 'system' },
  system: { icon: 'monitor', label: 'System', next: 'light' },
}
const step = computed(() => STEPS[preference.value])
const title = computed(() => `Theme: ${step.value.label} (click for ${STEPS[step.value.next].label})`)
</script>

<template>
  <button
    type="button"
    :title="title"
    :aria-label="title"
    :data-theme-button="preference"
    @click="preference = step.next"
  >
    <Icon :name="step.icon" />
  </button>
</template>
