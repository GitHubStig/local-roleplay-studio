<script setup lang="ts">
import { computed } from 'vue'
import type { Picture } from '../api'

/**
 * A picture's versions (ADR 0021) as a row of buttons: Original, then each edit. The one picked is
 * the picture everywhere (shown, upscaled, made into 3D, compared); choosing another picks it.
 * Shown only once the picture has an edit.
 */
const props = defineProps<{
  picture: Picture
  disabled?: boolean
  /** Drawn for the viewer's dark backdrop. */
  dark?: boolean
}>()
defineEmits<{ pick: [version: number] }>()

const versions = computed(() => [
  { label: 'Original', title: 'As rendered' },
  ...(props.picture.edits ?? []).map((e, i) => ({
    label: `Edit ${i + 1}`,
    title: e.instructions.join('; '),
  })),
])
const picked = computed(() => props.picture.picked ?? 0)
</script>

<template>
  <div
    v-if="versions.length > 1"
    class="inline-flex shrink-0 overflow-hidden rounded-lg border text-sm"
    :class="dark ? 'border-white/30 text-white/80' : 'border-line'"
    role="group"
    aria-label="Versions of the picture"
    data-versions
  >
    <button
      v-for="(v, n) in versions"
      :key="n"
      type="button"
      class="px-2 py-1 whitespace-nowrap disabled:opacity-50"
      :class="n === picked
        ? dark ? 'bg-white/90 text-black' : 'bg-fg text-canvas'
        : dark ? 'hover:text-white' : 'hover:bg-surface'"
      :aria-pressed="n === picked"
      :disabled="disabled"
      :title="v.title"
      :data-version="n"
      @click="n !== picked && $emit('pick', n)"
    >
      {{ v.label }}
    </button>
  </div>
</template>
