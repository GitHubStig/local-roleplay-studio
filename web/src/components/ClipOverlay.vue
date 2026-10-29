<script setup lang="ts">
import { useElementVisibility, useSessionStorage } from '@vueuse/core'
import { onDeactivated, useTemplateRef, watch } from 'vue'
import { type Clip, CLIP_KIND_NAMES } from '../api'

/**
 * A clip playing over its Frame's picture, in place (ADR 0025): in a picture's frame
 * (`position: relative`), the same size as it. An Idle Loop loops; a Lead In closes when it ends,
 * on the picture it ends on; a Play out and an Into Next stay on their last frame, which isn't the
 * picture under them. It plays only while it's in view, so one asked for from the side panel waits
 * for the picture it covers to scroll into view, and it closes when its screen is left (a screen is
 * kept alive in the background). Its volume is remembered for the browser session.
 */
const props = defineProps<{ src: string; clip: Clip }>()
const emit = defineEmits<{ close: [] }>()

const video = useTemplateRef<HTMLVideoElement>('video')
const visible = useElementVisibility(video, { threshold: 0.5 })
// Another clip in its place plays at once, if it's in view.
watch([visible, () => props.src], ([inView]) => {
  if (inView) video.value?.play().catch(() => {})
  else video.value?.pause()
}, { flush: 'post' })

const volume = useSessionStorage('clip-volume', 1)
const muted = useSessionStorage('clip-muted', false)
/** Each clip starts at the volume the last one was left at. */
function applyVolume() {
  if (!video.value) return
  video.value.volume = volume.value
  video.value.muted = muted.value
}
function keepVolume() {
  if (!video.value) return
  volume.value = video.value.volume
  muted.value = video.value.muted
}

function onEnded() {
  if (props.clip.kind === 'lead-in') emit('close')
}

onDeactivated(() => emit('close'))
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
      @loadedmetadata="applyVolume"
      @volumechange="keepVolume"
      @ended="onEnded"
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
