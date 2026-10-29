<script setup lang="ts">
import { computed } from 'vue'
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import PictureButtons from './PictureButtons.vue'

/**
 * Everything about the selected Frame, in the side panel's Frame tab, the same in every kind of
 * Session (docs/video-plan.md): what the Session shows of it first (its Image Prompt, in the
 * default slot), then what can be done with its picture, then 3D. The row under the text box keeps
 * only what's about the whole Session.
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
  }>(),
  { canRender: false },
)
defineEmits<{
  queue: [kind: JobKind]
  view: [kind: Made3d]
  edit: []
}>()
const { on: featureOn } = useFeatures()

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
  <div class="flex flex-col gap-4" data-frame-tab>
    <div><slot /></div>
    <section v-if="pictured" class="flex flex-col gap-1.5 border-t border-line pt-3" data-frame-picture>
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
    <section v-if="has3d" class="flex flex-col gap-1.5 border-t border-line pt-3" data-frame-3d>
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
</template>
