<script setup lang="ts">
import { computed } from 'vue'
import { imageUrl, type Made3d, type PicturedFrame, shownPicture } from '../api'
import SceneViewer from './SceneViewer.vue'

/** The viewers for what a Session's Frames were made into in 3D: a 2.5D scene, or a figure. */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly PicturedFrame[]
    /** The Session's Image Model, which picks the picture each Frame shows. */
    imageModel: string
    /** What a Frame is called in the viewer's title. */
    name?: (index: number) => string
  }>(),
  { name: (index: number) => `Frame ${index}` },
)
/** Which Frame's scene or figure is open; null for none. Opening one closes the other, whose
 * close then leaves this be. */
const open = defineModel<{ index: number; kind: Made3d } | null>('open', { required: true })

const frame = computed(() => props.frames.find((f) => f.index === open.value?.index))
const picture = computed(() => frame.value && shownPicture(frame.value, props.imageModel))
const scene = computed(() => {
  const made = open.value?.kind === 'scene' ? picture.value?.scene : undefined
  if (!made) return null
  return { ...made, src: imageUrl(props.sessionId, made.file), label: props.name(frame.value!.index) }
})
const figure = computed(() => {
  const kind = open.value?.kind
  const made = kind === 'figure' || kind === 'lito' ? picture.value?.[kind] : undefined
  if (!made) return null
  return {
    src: imageUrl(props.sessionId, made.file),
    label: props.name(frame.value!.index),
    model: kind === 'lito' ? 'lito' as const : 'triposplat' as const,
  }
})
</script>

<template>
  <SceneViewer
    :src="scene?.src ?? null"
    :pivot="scene?.pivot"
    :fov="scene?.fov"
    :aspect="scene?.aspect"
    :label="scene?.label"
    @close="scene && (open = null)"
  />
  <SceneViewer
    :src="figure?.src ?? null"
    :label="figure?.label"
    :model="figure?.model"
    figure
    @close="figure && (open = null)"
  />
</template>
