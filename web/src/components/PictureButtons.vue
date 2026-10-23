<script setup lang="ts">
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Frame3dButtons from './Frame3dButtons.vue'
import VersionStepper from './VersionStepper.vue'

/**
 * What can be done with a Frame's picture, in every kind of Session: render it (where a Frame
 * renders on demand), upscale it, make it into 3D, and edit it (in the viewer, ADR 0021), its
 * versions picked here once it has edits. Each queues a job; a button is off while that job is
 * queued or running on the Frame, and all are while `busy`.
 */
const props = withDefaults(
  defineProps<{
    /** The picture the Frame shows, if it has one. */
    picture?: Picture
    /** A job of this kind is already queued or running on the Frame (`useJobs().hasJob`). */
    hasJob: (kind: JobKind) => boolean
    /** Offer Render (Re-render once it has a picture): the Frame can be rendered now. */
    canRender?: boolean
    /** Why nothing can be queued for now, shown on hover: the Text Model is at work, and a job would unload it. */
    busy?: string
    buttonClass?: string
  }>(),
  { canRender: false, buttonClass: 'action' },
)
defineEmits<{
  queue: [kind: JobKind]
  view: [kind: Made3d]
  /** Open the picture to paint an edit. */
  edit: []
  /** Pick version `version` of the picture: 0 its render, n its edit n. */
  pick: [version: number]
}>()
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
      :disabled="!!busy || hasJob('render')"
      :title="busy"
      data-render-button
      @click="$emit('queue', 'render')"
    >
      {{ picture ? 'Re-render' : 'Render' }}
    </button>
    <button
      v-if="featureOn('upscale') && pictured()"
      type="button"
      :class="buttonClass"
      :disabled="!!busy || !!picture?.upscaled || hasJob('upscale')"
      :title="busy || (picture?.upscaled ? 'Upscaled to 2048 px' : 'Upscale to 2048 px with SeedVR2')"
      data-upscale-button
      @click="$emit('queue', 'upscale')"
    >
      {{ picture?.upscaled ? 'Upscaled' : 'Upscale' }}
    </button>
    <button
      v-if="featureOn('edits') && picture"
      type="button"
      :class="buttonClass"
      :disabled="!!busy || hasJob('edit')"
      :title="busy || (hasJob('edit') ? 'Being edited' : 'Repaint part of the picture')"
      data-edit-button
      @click="$emit('edit')"
    >
      Edit
    </button>
    <VersionStepper
      v-if="picture"
      :picture="picture"
      :disabled="hasJob('edit')"
      @pick="(version) => $emit('pick', version)"
    />
  </template>
  <Frame3dButtons
    :picture="picture"
    :disabled="(kind) => !!busy || hasJob(kind)"
    :busy="busy"
    :available="available"
    :button-class="buttonClass"
    @make="(kind) => $emit('queue', kind)"
    @view="(kind) => $emit('view', kind)"
  />
</template>
