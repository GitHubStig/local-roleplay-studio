<script setup lang="ts">
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Frame3dButtons from './Frame3dButtons.vue'
import Icon from './Icon.vue'

/**
 * What can be done with a Frame's picture, in every kind of Session: render it (where a Frame
 * renders on demand), upscale it, make it into 3D, and edit it (in the viewer, ADR 0021, where its
 * versions are). Each queues a job; a button is off while that job is queued or running on the
 * Frame, and all are while `busy`, except Edit, which opens the viewer on an edit being made.
 * `part` draws only the picture's own buttons or only the 3D ones, for a panel that groups them.
 * As a picture's toolbar (`toolbar`), each is an icon and its name (`[data-label]`, which the
 * toolbar can hide when it's narrow), with a spinner in place of the icon while its job runs and a
 * dot while it waits (`working`).
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
    /** Drawn for a picture's toolbar: icons with their names. */
    toolbar?: boolean
    /** Whether a job of this kind runs on the Frame, or waits its turn. */
    working?: (kind: JobKind) => 'running' | 'queued' | null
  }>(),
  { canRender: false, buttonClass: 'action', part: 'all', toolbar: false, working: () => null },
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

/** A toolbar's button: its icon (a spinner while its job runs), name, and a dot while it waits. */
const ICONS: Partial<Record<JobKind, string>> = { render: 'retry', upscale: 'upscale', edit: 'brush' }
const iconOf = (kind: JobKind) => (props.working(kind) === 'running' ? 'spinner' : ICONS[kind]!)
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
      <template v-if="toolbar">
        <Icon :name="iconOf('render')" :class="{ 'animate-spin': working('render') === 'running' }" />
        <span data-label>{{ picture ? 'Re-render' : 'Render' }}</span>
        <span v-if="working('render') === 'queued'" class="h-1.5 w-1.5 rounded-full bg-amber-400" data-waiting />
      </template>
      <template v-else>{{ picture ? 'Re-render' : 'Render' }}</template>
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
      <template v-if="toolbar">
        <Icon :name="iconOf('upscale')" :class="{ 'animate-spin': working('upscale') === 'running' }" />
        <span data-label>{{ picture?.upscaled ? 'Upscaled' : 'Upscale' }}</span>
        <span v-if="working('upscale') === 'queued'" class="h-1.5 w-1.5 rounded-full bg-amber-400" data-waiting />
      </template>
      <template v-else>{{ picture?.upscaled ? 'Upscaled' : 'Upscale' }}</template>
    </button>
    <button
      v-if="featureOn('edits') && picture"
      type="button"
      :class="buttonClass"
      :title="hasJob('edit') ? 'Being edited: see how it goes' : 'Repaint part of the picture'"
      data-edit-button
      @click="$emit('edit')"
    >
      <template v-if="toolbar">
        <Icon :name="iconOf('edit')" :class="{ 'animate-spin': working('edit') === 'running' }" />
        <span data-label>{{ hasJob('edit') ? 'Editing…' : 'Edit' }}</span>
        <span v-if="working('edit') === 'queued'" class="h-1.5 w-1.5 rounded-full bg-amber-400" data-waiting />
      </template>
      <template v-else>{{ hasJob('edit') ? 'Editing…' : 'Edit' }}</template>
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
