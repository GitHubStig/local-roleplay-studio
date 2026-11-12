<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import type { Clip, Job, JobKind, Made3d, Picture } from '../api'
import ClipOverlay from './ClipOverlay.vue'
import EditedChip from './EditedChip.vue'
import FrameJobsLine from './FrameJobsLine.vue'
import Icon from './Icon.vue'
import PictureToolbar from './PictureToolbar.vue'
import { PICTURE_RATIO } from './pictureRatio'
import { useShownPreview } from '../composables/useShownPreview'

/**
 * The picked Frame's picture on a Session's stage, in every kind of Session: as large as the room
 * beside the story allows, in its own shape; its buttons on it (`PictureToolbar`, the Clip menu's
 * content the `clip` slot's); over its top which Frame it is (`label`), its jobs as one line
 * (`FrameJobsLine`), and Prompt, which opens the drawer. A Frame with no picture shows a dashed
 * frame in its place, holding the `empty` slot (what it says, and a button to picture it). The
 * picture forming (`preview`) shows over the old one, or alone; a clip plays over it (`clip`).
 * A new picture is loaded before it's shown, so stepping through Frames never flashes blank, and
 * the picture's size shows on its label while the pointer is over it.
 */
const props = withDefaults(
  defineProps<{
    /** What it's called in a sentence: "Frame 3". */
    name: string
    /** Over its top-left while it has a picture: "Frame 3 of 12", and anything to say of it. */
    label?: string
    /** The picture's address, if it has one. */
    src?: string | null
    /** The picture, for its buttons. */
    picture?: Picture
    /** The picture is out of date: shown faded. */
    dimmed?: boolean
    /** The picture forming, with how far it's come. */
    preview?: { src: string; opacity: number } | null
    /** Work on it: its edge sweeps, slower while it waits. */
    sweep?: 'running' | 'queued' | null
    /** Its jobs, for the line over it. */
    jobs?: readonly Job[]
    describe?: (job: Job) => string | undefined
    hasJob: (kind: JobKind) => boolean
    working?: (kind: JobKind) => 'running' | 'queued' | null
    canRender?: boolean
    /** Why nothing can be queued now, on hover. */
    busy?: string
    /** How many clips the picture has, or null for no Clip menu. */
    clips?: number | null
    /** A clip playing over it. */
    playing?: { src: string; clip: Clip } | null
  }>(),
  {
    label: undefined,
    src: null,
    picture: undefined,
    preview: null,
    sweep: null,
    jobs: () => [],
    describe: undefined,
    working: () => null,
    canRender: false,
    busy: undefined,
    clips: null,
    playing: null,
  },
)
const emit = defineEmits<{
  queue: [kind: JobKind]
  view: [kind: Made3d]
  edit: []
  /** Look closer: the picture viewer. */
  open: []
  /** The drawer, at the Frame's Image Prompt. */
  prompt: []
  retry: [job: Job]
  drop: [job: Job]
  cancelAll: [jobs: Job[]]
  stopClip: []
}>()

/** The picture on screen: it changes only once the next has loaded, or at once from none. */
const displayed = ref<string | null>(null)
watch(() => props.src, (src) => {
  if (!src || !displayed.value) return (displayed.value = src ?? null)
  if (src === displayed.value) return
  const img = new Image()
  // Skipped if another was asked for meanwhile.
  img.onload = img.onerror = () => props.src === src && (displayed.value = src)
  img.src = src
}, { immediate: true })
/** The picture forming, kept over the picture until the finished one is in. */
const forming = useShownPreview(() => props.preview, () => displayed.value)

/** The picture's shape, from the image once it's loaded: the stage sizes it by this. */
const ratio = inject(PICTURE_RATIO, ref(1.5))
/** Its size in pixels, once loaded. */
const size = ref<{ width: number; height: number } | null>(null)
function onLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (!img.naturalWidth || !img.naturalHeight) return
  ratio.value = img.naturalWidth / img.naturalHeight
  size.value = { width: img.naturalWidth, height: img.naturalHeight }
}
const shown = () => !!displayed.value || !!forming.value
</script>

<template>
  <div
    class="group/picture relative max-w-full rounded-xl"
    :class="[
      shown()
        ? 'aspect-(--ratio) w-[min(100%,calc(38dvh*var(--ratio)))] lg:w-[min(100cqw,calc(100cqh*var(--ratio)))]'
        : 'w-full lg:max-w-[48rem]',
      { 'render-sweep': sweep },
    ]"
    :data-rendering="sweep === 'queued' ? 'queued' : undefined"
    data-picture
  >
    <template v-if="shown()">
      <button
        type="button"
        class="block h-full w-full"
        :title="`Look closer at ${name}'s picture`"
        data-picture-image
        @click="displayed && emit('open')"
      >
        <img
          v-if="displayed"
          :key="displayed"
          :src="displayed"
          :alt="`Picture of ${name}`"
          class="block h-full w-full rounded-xl object-cover"
          :class="{ 'opacity-50': dimmed }"
          data-frame-picture
          @load="onLoad"
        />
        <img
          v-if="forming"
          :src="forming.src"
          alt=""
          class="block h-full w-full rounded-xl object-cover transition-opacity duration-500"
          :class="{ 'absolute inset-0': displayed }"
          :style="{ opacity: displayed ? forming.opacity : 1 }"
          data-preview
        />
      </button>
      <ClipOverlay
        v-if="playing"
        class="rounded-xl"
        :src="playing.src"
        :clip="playing.clip"
        @close="emit('stopClip')"
        @click.stop
      />
      <PictureToolbar
        v-if="picture"
        :picture="picture"
        :has-job="hasJob"
        :working="working"
        :can-render="canRender"
        :busy="busy"
        :clips="clips"
        @queue="(kind) => emit('queue', kind)"
        @view="(kind) => emit('view', kind)"
        @edit="emit('edit')"
        @expand="emit('open')"
      >
        <template #clip><slot name="clip" /></template>
      </PictureToolbar>
    </template>
    <!-- No picture: a frame in its place, saying why, to picture it from. -->
    <div
      v-else
      class="grid aspect-[4/3] w-full max-h-[38dvh] place-items-center rounded-xl border-2 border-dashed border-line p-4 text-center lg:max-h-[100cqh]"
      data-not-pictured
    >
      <div class="flex flex-col items-center gap-2"><slot name="empty" /></div>
    </div>
    <!-- Over its top: which Frame, its work, anything the Session adds, and its Image Prompt. -->
    <div class="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start gap-1.5 *:pointer-events-auto">
      <span
        v-if="displayed && label"
        class="shrink-0 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white backdrop-blur-sm"
        data-picture-label
      >{{ label }}<span
        v-if="size"
        class="hidden tabular-nums group-hover/picture:inline"
        data-size
      > · {{ size.width }}×{{ size.height }}</span></span>
      <span class="min-w-0">
        <FrameJobsLine
          :jobs="jobs"
          :describe="describe"
          @retry="(j) => emit('retry', j)"
          @drop="(j) => emit('drop', j)"
          @cancel-all="(list) => emit('cancelAll', list)"
        />
      </span>
      <slot name="overlay" />
      <span class="pointer-events-none! ml-auto" />
      <EditedChip :picture="picture" />
      <button
        type="button"
        class="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs backdrop-blur-sm"
        :class="displayed ? 'bg-black/55 text-white hover:bg-black/75' : 'border border-line bg-surface text-muted hover:text-fg'"
        title="The Image Prompt, and how it was made"
        data-open-prompt
        @click="emit('prompt')"
      >
        <Icon name="prompt" />Prompt
      </button>
    </div>
  </div>
</template>
