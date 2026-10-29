<script setup lang="ts">
import { computed } from 'vue'
import {
  type Clip,
  type ClipKind,
  type ClipOrder,
  type JobKind,
  type Made3d,
  MADE3D_FEATURE,
  type Picture,
  pickedEdit,
} from '../api'
import FrameClips from './FrameClips.vue'
import { useFeatures } from '../composables/useFeatures'
import PictureButtons from './PictureButtons.vue'

/**
 * Everything about the selected Frame, in the side panel's Frame tab, the same in every kind of
 * Session (docs/design.md, "The selected Frame and its tab"): what the Session shows of it (its Image Prompt, in the default slot),
 * and at the panel's foot, always in view, what can be done with its picture and its 3D, side by
 * side. The row under the text box keeps only what's about the whole Session.
 */
const props = withDefaults(
  defineProps<{
    picture?: Picture
    /** A job of this kind is already queued or running on the Frame (`useJobs().hasJob`). */
    hasJob: (kind: JobKind) => boolean
    /** Offer Render (Re-render once it has a picture): the Frame can be rendered now. */
    canRender?: boolean
    /** Why nothing can be queued for now, shown on hover. */
    busy?: string
    /**
     * For its clips: the Session, the Frame's index, and whether the next Frame has a picture for
     * Into Next to end on (and what it's called). Left out, no Clip section.
     */
    clips?: {
      sessionId: string
      index: number
      nextPictured: boolean
      nextName: string
      /** The kinds of clip queued or being made of it (`clipsMaking`). */
      making: ClipKind[]
    }
  }>(),
  { canRender: false },
)
defineEmits<{
  queue: [kind: JobKind]
  view: [kind: Made3d]
  edit: []
  /** Queue a clip, as ordered. */
  clip: [order: ClipOrder]
  /** Play one of the picture's clips over it. */
  play: [clip: Clip]
}>()
const { on: featureOn } = useFeatures()

/** The clips of the picture's version shown (its picked edit's, if it has one). */
const pictureClips = computed(() =>
  props.picture && (pickedEdit(props.picture) ?? props.picture).clips
)
/** Whether the picture has buttons: it can be rendered, or there's a picture (or one coming). */
const pictured = computed(() =>
  featureOn.value('images') &&
  (props.canRender || !!props.picture || props.hasJob('render') || props.hasJob('picture'))
)
/** Whether 3D has buttons: one can be made from the picture, or one has been. */
const has3d = computed(() =>
  !!props.picture &&
  (Object.keys(MADE3D_FEATURE) as Made3d[]).some((kind) =>
    !!props.picture?.[kind] || featureOn.value(MADE3D_FEATURE[kind])
  )
)
</script>

<template>
  <div class="flex min-h-full flex-col gap-4" data-frame-tab>
    <div><slot /></div>
    <FrameClips
      v-if="clips && picture && featureOn('video')"
      :session-id="clips.sessionId"
      :index="clips.index"
      :clips="pictureClips"
      :next-pictured="clips.nextPictured"
      :next-name="clips.nextName"
      :making="clips.making"
      @make="(order) => $emit('clip', order)"
      @play="(clip) => $emit('play', clip)"
    />
    <!-- Kept in view at the panel's foot, side by side: the panel scrolls and pads it by 1rem, so it
         sticks 1rem lower, over the padding, or the text shows below it. -->
    <div
      v-if="pictured || has3d"
      class="sticky -bottom-4 -mx-4 -mb-4 mt-auto grid grid-cols-2 gap-4 border-t border-line bg-canvas px-4 py-3"
      data-frame-buttons
    >
      <section
        v-if="pictured"
        class="flex flex-col gap-1.5"
        :class="{ 'col-span-2': !has3d }"
        data-frame-picture
      >
        <h3 class="text-xs font-medium text-muted">Picture</h3>
        <p class="flex flex-wrap gap-1.5">
          <PictureButtons
            part="picture"
            :picture="picture"
            :has-job="hasJob"
            :can-render="canRender"
            :busy="busy"
            @queue="(kind) => $emit('queue', kind)"
            @edit="$emit('edit')"
          />
        </p>
      </section>
      <section
        v-if="has3d"
        class="flex flex-col gap-1.5"
        :class="{ 'col-span-2': !pictured }"
        data-frame-3d
      >
        <h3 class="text-xs font-medium text-muted">3D</h3>
        <p class="flex flex-wrap gap-1.5">
          <PictureButtons
            part="3d"
            :picture="picture"
            :has-job="hasJob"
            :busy="busy"
            @queue="(kind) => $emit('queue', kind)"
            @view="(kind) => $emit('view', kind)"
          />
        </p>
      </section>
    </div>
  </div>
</template>
