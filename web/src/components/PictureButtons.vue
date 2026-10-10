<script setup lang="ts">
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Frame3dButtons from './Frame3dButtons.vue'

/**
 * What can be done with a Frame's picture, in every kind of Session: render it (where a Frame
 * renders on demand), upscale it, and make it into 3D. Each queues a job; a button is off while
 * that job is queued or running on the Frame.
 */
const props = withDefaults(
  defineProps<{
    /** The picture the Frame shows, if it has one. */
    picture?: Picture
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

/** Which 3D can be made here: its Feature is on (what's made can always be viewed). */
const available = (kind: Made3d) => featureOn.value(MADE3D_FEATURE[kind])

/** A picture is there, or a job already queued will make one. */
const pictured = () => !!props.picture || props.hasJob('render') || props.hasJob('picture')
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
      {{ picture ? 'Re-render' : 'Render' }}
    </button>
    <button
      v-if="featureOn('upscale') && pictured()"
      type="button"
      :class="buttonClass"
      :disabled="!!picture?.upscaled || hasJob('upscale')"
      :title="picture?.upscaled ? 'Upscaled to 2048 px' : 'Upscale to 2048 px with SeedVR2'"
      data-upscale-button
      @click="$emit('queue', 'upscale')"
    >
      {{ picture?.upscaled ? 'Upscaled' : 'Upscale' }}
    </button>
  </template>
  <Frame3dButtons
    :picture="picture"
    :disabled="(kind) => hasJob(kind)"
    :available="available"
    :button-class="buttonClass"
    @make="(kind) => $emit('queue', kind)"
    @view="(kind) => $emit('view', kind)"
  />
</template>
