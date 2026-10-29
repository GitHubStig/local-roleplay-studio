<script setup lang="ts">
import { type Clip, CLIP_KIND_NAMES } from '../api'

/**
 * A clip playing over its Frame's picture, in place (ADR 0025): in a picture's frame
 * (`position: relative`), the same size as it. An Idle Loop loops; the others close when they end.
 */
defineProps<{ src: string; clip: Clip }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="absolute inset-0 z-10 flex bg-black" data-clip-overlay>
    <video
      :src="src"
      class="h-full w-full object-contain"
      autoplay
      controls
      playsinline
      :loop="clip.kind === 'idle-loop'"
      @ended="$emit('close')"
    />
    <span class="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
      {{ CLIP_KIND_NAMES[clip.kind] }} · {{ clip.seconds }} s
    </span>
    <button
      type="button"
      class="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
      aria-label="Close the clip"
      data-close-clip
      @click.stop="$emit('close')"
    >
      ✕
    </button>
  </div>
</template>
