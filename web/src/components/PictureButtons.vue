<script setup lang="ts">
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Frame3dButtons from './Frame3dButtons.vue'

/**
 * What can be done with a Frame's picture, in every kind of Session: render it (where a Frame
 * renders on demand), upscale it, make it into 3D, and edit it (in the viewer, ADR 0021, where its
 * versions are). Each queues a job; a button is off while that job is queued or running on the
 * Frame, and all are while `busy`, except Edit, which opens the viewer on an edit being made.
 * `part` draws only the picture's own buttons or only the 3D ones, for a panel that groups them.
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
    part?: 'picture' | '3d' | 'all'
  }>(),
  { canRender: false, buttonClass: 'action', part: 'all' },
)
defineEmits<{
  queue: [kind: JobKind]
  view: [kind: Made3d]
  /** Open the picture to paint an edit, or to watch one being made. */
  edit: []
}>()
const { on: featureOn } = useFeatures()

/** Which 3D can be made here: its Feature is on (what's made can always be viewed). */
const available = (kind: Made3d) => featureOn.value(MADE3D_FEATURE[kind])

/** A picture is there, or a job already queued will make one. */
const pictured = () => !!props.picture || props.hasJob('render') || props.hasJob('picture')
</script>

<template>
  <template v-if="featureOn('images') && part !== '3d'">
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
      :title="hasJob('edit') ? 'Being edited: see how it goes' : 'Repaint part of the picture'"
      data-edit-button
      @click="$emit('edit')"
    >
      {{ hasJob('edit') ? 'Editing…' : 'Edit' }}
    </button>
  </template>
  <Frame3dButtons
    v-if="part !== 'picture'"
    :picture="picture"
    :disabled="(kind) => !!busy || hasJob(kind)"
    :busy="busy"
    :available="available"
    :button-class="buttonClass"
    @make="(kind) => $emit('queue', kind)"
    @view="(kind) => $emit('view', kind)"
  />
</template>
