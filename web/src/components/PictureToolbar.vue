<script setup lang="ts">
import { computed } from 'vue'
import { type JobKind, type Made3d, MADE3D_FEATURE, type Picture } from '../api'
import { useFeatures } from '../composables/useFeatures'
import Icon from './Icon.vue'
import PictureButtons from './PictureButtons.vue'
import PopMenu from './PopMenu.vue'

/**
 * A picture's buttons, on the picture, in every kind of Session: Re-render, Upscale and Edit, then
 * Clip, which opens the Frame's clips in the drawer beside the picture (so nothing covers it), and
 * 3D as a menu, each saying how many are made, and full screen at the end. Shown while the pointer
 * is over the picture (`group/picture`) or a menu is open, always on a screen that can't hover;
 * the names drop to icons when the picture is narrow. With `clips` null there's no Clip button.
 */
const props = withDefaults(
  defineProps<{
    picture?: Picture
    hasJob: (kind: JobKind) => boolean
    working?: (kind: JobKind) => 'running' | 'queued' | null
    canRender?: boolean
    busy?: string
    /** How many clips the picture has, or null for no Clip button. */
    clips?: number | null
    /** The drawer is open at the clips. */
    clipsOpen?: boolean
  }>(),
  { canRender: false, working: () => null, clips: null, clipsOpen: false },
)
defineEmits<{ queue: [kind: JobKind]; view: [kind: Made3d]; edit: []; expand: []; clips: [] }>()
const { on: featureOn } = useFeatures()

/** How many 3D are made of the picture, and whether any can be made or viewed at all. */
const made3d = computed(() =>
  (Object.keys(MADE3D_FEATURE) as Made3d[]).filter((kind) => !!props.picture?.[kind]).length
)
const has3d = computed(() =>
  !!props.picture &&
  (made3d.value > 0 ||
    (Object.keys(MADE3D_FEATURE) as Made3d[]).some((kind) => featureOn.value(MADE3D_FEATURE[kind])))
)
const working3d = computed(() =>
  (Object.keys(MADE3D_FEATURE) as Made3d[]).map((k) => props.working(k)).find(Boolean) ?? null
)
</script>

<template>
  <div
    class="picture-toolbar @container pointer-events-none absolute inset-x-2 bottom-2 z-20 opacity-0 transition-opacity group-hover/picture:pointer-events-auto group-hover/picture:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[data-open]]:pointer-events-auto has-[[data-open]]:opacity-100 touch:pointer-events-auto touch:opacity-100"
    data-picture-toolbar
    @click.stop
  >
    <div class="flex items-center gap-0.5 whitespace-nowrap rounded-xl bg-black/55 p-1 text-xs text-white backdrop-blur-sm">
      <PictureButtons
        part="picture"
        toolbar
        button-class="tool-button"
        :picture="picture"
        :has-job="hasJob"
        :working="working"
        :can-render="canRender && !!picture"
        :busy="busy"
        @queue="(kind) => $emit('queue', kind)"
        @edit="$emit('edit')"
      />
      <span v-if="clips !== null || has3d" class="mx-1 h-4 w-px shrink-0 bg-white/30" />
      <button
        v-if="clips !== null"
        type="button"
        class="tool-button"
        :class="{ 'bg-white/20': clipsOpen }"
        :title="clips ? `Clips: ${clips} made` : 'Clips: make one from this picture'"
        :aria-pressed="clipsOpen"
        data-clip-menu-button
        @click="$emit('clips')"
      >
        <Icon :name="working('clip') === 'running' ? 'spinner' : 'film'" :class="{ 'animate-spin': working('clip') === 'running' }" />
        <span data-label>Clip</span>
        <span v-if="clips" class="tabular-nums">{{ clips }}</span>
        <span v-if="working('clip') === 'queued'" class="h-1.5 w-1.5 rounded-full bg-amber-400" data-waiting />
      </button>
      <PopMenu v-if="has3d" side="above" panel-class="w-72 p-1 text-sm" data-3d-menu>
        <template #button="{ open, toggle }">
          <button
            type="button"
            class="tool-button"
            :class="{ 'bg-white/20': open }"
            :title="made3d ? `3D: ${made3d} made` : '3D: make the picture into a scene or a figure'"
            data-3d-menu-button
            @click="toggle"
          >
            <Icon :name="working3d === 'running' ? 'spinner' : 'cube'" :class="{ 'animate-spin': working3d === 'running' }" />
            <span data-label>3D</span>
            <span v-if="made3d" class="tabular-nums">{{ made3d }}</span>
            <span v-if="working3d === 'queued'" class="h-1.5 w-1.5 rounded-full bg-amber-400" data-waiting />
            <Icon name="chevron-down" class="opacity-70" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="flex flex-col">
            <PictureButtons
              part="3d"
              button-class="menu-row"
              :picture="picture"
              :has-job="hasJob"
              :busy="busy"
              @queue="(kind) => { $emit('queue', kind); close() }"
              @view="(kind) => { $emit('view', kind); close() }"
            />
          </div>
        </template>
      </PopMenu>
      <button
        type="button"
        class="tool-button ml-auto"
        title="Look closer"
        aria-label="Look closer"
        data-expand
        @click="$emit('expand')"
      >
        <Icon name="expand" />
      </button>
    </div>
  </div>
</template>
