<script setup lang="ts">
import type { Frame3d, Made3d } from '../api'

/**
 * A Frame's 3D buttons, named by the model they use (experimental): SHARP makes the whole picture a
 * 2.5D scene that turns ~30°; TripoSplat and LiTo lift the person in it out as a figure that turns
 * all the way round. Each reads View … once made; SHARP offers to go again from a later upscale.
 */
withDefaults(
  defineProps<{
    frame: Frame3d
    /** Which are off for now, e.g. while one is being made. */
    disabled?: (kind: Made3d) => boolean
    buttonClass?: string
  }>(),
  { disabled: () => false, buttonClass: 'action' },
)
defineEmits<{ make: [kind: Made3d]; view: [kind: Made3d] }>()
</script>

<template>
  <button
    v-if="frame.scene"
    type="button"
    :class="buttonClass"
    title="The whole picture in 2.5D, made with Apple's SHARP: turns ~30°"
    data-view-scene
    @click="$emit('view', 'scene')"
  >
    View SHARP
  </button>
  <button
    v-if="frame.image && (!frame.scene || (frame.upscaled && frame.scene.from !== frame.upscaled))"
    type="button"
    :class="buttonClass"
    :disabled="disabled('scene')"
    :title="frame.scene
      ? 'Made before the upscale: make it again from the upscale'
      : 'Experimental: make the whole picture into a 2.5D scene with Apple\'s SHARP, which turns ~30° (~11 s)'"
    data-scene-button
    @click="$emit('make', 'scene')"
  >
    {{ frame.scene ? 'SHARP again from upscale' : 'SHARP' }}
  </button>
  <button
    v-if="frame.figure"
    type="button"
    :class="buttonClass"
    title="The person in the picture in 3D, made with VAST's TripoSplat: turns all the way round"
    data-view-figure
    @click="$emit('view', 'figure')"
  >
    View TripoSplat
  </button>
  <button
    v-else-if="frame.image"
    type="button"
    :class="buttonClass"
    :disabled="disabled('figure')"
    title="Experimental: lift the person in the picture out as a 3D figure with VAST's TripoSplat, which turns all the way round (~75 s). Best with one person, not overlapped by anyone."
    data-figure-button
    @click="$emit('make', 'figure')"
  >
    TripoSplat
  </button>
  <button
    v-if="frame.lito"
    type="button"
    :class="buttonClass"
    title="The person in the picture in 3D, made with Apple's LiTo: turns all the way round"
    data-view-lito
    @click="$emit('view', 'lito')"
  >
    View LiTo
  </button>
  <button
    v-else-if="frame.image"
    type="button"
    :class="buttonClass"
    :disabled="disabled('lito')"
    title="Experimental: lift the person in the picture out as a 3D figure with Apple's LiTo (research-only), which turns all the way round (a few minutes). Best with one person, not overlapped by anyone."
    data-lito-button
    @click="$emit('make', 'lito')"
  >
    LiTo
  </button>
</template>
