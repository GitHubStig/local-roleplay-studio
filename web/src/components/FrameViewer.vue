<script setup lang="ts">
import { computed } from 'vue'
import { imageUrl } from '../api'
import ImageViewer from './ImageViewer.vue'

/**
 * A Session's pictures in the full-window viewer: it opens on one Frame, and ← and → step through
 * the Frames that have a picture, showing each one's upscale if it has one.
 */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly { index: number; image: string | null; upscaled?: string }[]
    /** What a Frame is called in the viewer's label. */
    name?: (index: number) => string
  }>(),
  { name: (index: number) => `Frame ${index}` },
)
/** The Frame open in the viewer, by index; null keeps it closed. */
const open = defineModel<number | null>('open', { required: true })
/** The viewer stepped to Frame `index`, e.g. to scroll what's behind it there. */
const emit = defineEmits<{ step: [index: number] }>()

const pictured = computed(() => props.frames.filter((f) => f.image))
const at = computed(() => pictured.value.findIndex((f) => f.index === open.value))
const shown = computed(() => {
  const frame = at.value >= 0 ? pictured.value[at.value] : null
  if (!frame) return null
  const name = props.name(frame.index)
  return {
    src: imageUrl(props.sessionId, frame.upscaled ?? frame.image!),
    alt: `Picture of ${name}`,
    label: `${name} · ${at.value + 1} of ${pictured.value.length}`,
  }
})

function step(by: number) {
  const frame = pictured.value[at.value + by]
  if (!frame) return
  open.value = frame.index
  emit('step', frame.index)
}
</script>

<template>
  <ImageViewer
    :src="shown?.src ?? null"
    :alt="shown?.alt"
    :label="shown?.label"
    :has-previous="at > 0"
    :has-next="at >= 0 && at < pictured.length - 1"
    @previous="step(-1)"
    @next="step(1)"
    @close="open = null"
  />
</template>
