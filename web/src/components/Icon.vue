<script setup lang="ts">
import { computed } from 'vue'

/**
 * An icon: `<Icon name="settings" />` shows `assets/icons/settings.svg`, inline so it's drawn in
 * the text's colour (`currentColor`). 1em square, the size of the text beside it, unless a class
 * sizes it. Every icon is a plain SVG file in that folder; they're bundled with the app.
 */
const props = defineProps<{ name: string }>()

const icons = import.meta.glob<string>('../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const svg = computed(() => {
  const found = icons[`../assets/icons/${props.name}.svg`]
  if (!found) console.warn(`No icon named "${props.name}" in assets/icons/`)
  return found ?? ''
})
</script>

<template>
  <span
    class="inline-block h-[1em] w-[1em] shrink-0 [&>svg]:h-full [&>svg]:w-full"
    aria-hidden="true"
    :data-icon="name"
    v-html="svg"
  />
</template>
