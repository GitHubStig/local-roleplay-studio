<script setup lang="ts">
import { useElementVisibility } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'
import { type Clip, CLIP_KIND_NAMES } from '../api'

/**
 * A clip playing over its Frame's picture, in place (ADR 0025): in a picture's frame
 * (`position: relative`), the same size as it. An Idle Loop loops; the others close when they end.
 * It plays only while it's in view, so one asked for from the side panel waits for the picture it
 * covers to scroll into view.
 */
const props = defineProps<{ src: string; clip: Clip }>()
defineEmits<{ close: [] }>()

const video = useTemplateRef<HTMLVideoElement>('video')
const visible = useElementVisibility(video, { threshold: 0.5 })
// Another clip in its place plays at once, if it's in view.
watch([visible, () => props.src], ([inView]) => {
  if (inView) video.value?.play().catch(() => {})
  else video.value?.pause()
}, { flush: 'post' })
</script>

<template>
  <div class="absolute inset-0 z-10 flex bg-black" data-clip-overlay>
    <video
      ref="video"
      :src="src"
      class="h-full w-full object-contain"
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
