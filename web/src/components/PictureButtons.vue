<script setup lang="ts">
import { type Frame3d, type JobKind, type Made3d, MADE3D_FEATURE } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Frame3dButtons from './Frame3dButtons.vue'

/**
 * What can be done with a Frame's picture, in every kind of Session: render it (where a Frame
 * renders on demand), upscale it, and make it into 3D. Each queues a job; a button is off while
 * that job is queued or running on the Frame.
 */
const props = withDefaults(
  defineProps<{
    frame: Frame3d
    /** A job of this kind is already queued or running on the Frame (`useJobs().hasJob`). */
    hasJob: (kind: JobKind) => boolean
    /** Offer Render: the Frame can be rendered now (never in a Chain, whose Frames render once). */
    canRender?: boolean
    buttonClass?: string
  }>(),
  { canRender: false, buttonClass: 'action' },
)
defineEmits<{ queue: [kind: JobKind]; view: [kind: Made3d] }>()
const { on: featureOn } = useFeatures()

/** A picture is there, or a job already queued will make one. */
const pictured = () => !!props.frame.image || props.hasJob('render') || props.hasJob('picture')
</script>

<template>
  <template v-if="featureOn('images')">
    <button
      v-if="canRender"
      type="button"
      :class="buttonClass"
      :disabled="hasJob('render')"
      data-render-button
      @click="$emit('queue', 'render')"
    >
      {{ frame.image ? 'Re-render' : 'Render' }}
    </button>
    <button
      v-if="pictured()"
      type="button"
      :class="buttonClass"
      :disabled="!!frame.upscaled || hasJob('upscale')"
      :title="frame.upscaled ? 'Upscaled to 2048 px' : 'Upscale to 2048 px with SeedVR2'"
      data-upscale-button
      @click="$emit('queue', 'upscale')"
    >
      {{ frame.upscaled ? 'Upscaled' : 'Upscale' }}
    </button>
  </template>
  <Frame3dButtons
    :frame="frame"
    :disabled="(kind) => hasJob(kind)"
    :available="(kind) => featureOn(MADE3D_FEATURE[kind])"
    :button-class="buttonClass"
    @make="(kind) => $emit('queue', kind)"
    @view="(kind) => $emit('view', kind)"
  />
</template>
