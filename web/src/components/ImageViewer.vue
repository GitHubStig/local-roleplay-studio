<script setup lang="ts">
import { onClickOutside, useEventListener, useSwipe } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'
import FrameImage from './FrameImage.vue'
import Icon from './Icon.vue'

/**
 * A full-window look at one image: pinch to zoom, drag or two-finger scroll to pan, double-click
 * to reset (all from FrameImage). Esc, the close button or a click anywhere outside the image
 * closes it. Given a `label` or `hasPrevious` / `hasNext`, the ‹ › buttons, the ← → keys and a
 * swipe sideways ask for the image before or after, and so do ↑ and ↓; with `vertical`, the up and
 * down buttons, the ↑ ↓ keys and a swipe up or down ask for the one above or below instead. The
 * parent decides which those are. A `caption` shows under the image, in a box of the same height whatever its length,
 * so the image keeps its size while stepping through.
 */
const props = defineProps<{
  /** The image to show; null keeps the viewer closed. */
  src: string | null
  alt?: string
  /** Where this image sits, e.g. "Frame 28 · 4 of 7". */
  label?: string
  hasPrevious?: boolean
  hasNext?: boolean
  /** It steps up and down too, through `hasUp` and `hasDown`. */
  vertical?: boolean
  /** What up and down step through, for their buttons' names, e.g. "Frame". */
  verticalName?: string
  hasUp?: boolean
  hasDown?: boolean
  /** Shown under the image; given as '' where one image has none, to keep its space. */
  caption?: string
  /**
   * Painting on the image (an edit's area, ADR 0021): the arrow keys and swipes don't step, and a
   * click outside the image doesn't close, so a stroke or an instruction isn't lost.
   */
  painting?: boolean
}>()
const emit = defineEmits<{ close: []; previous: []; next: []; up: []; down: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

/** Asks for the image that way, if there is one. */
type Way = 'previous' | 'next' | 'up' | 'down'
function go(way: Way) {
  const there = { previous: props.hasPrevious, next: props.hasNext, up: props.hasUp, down: props.hasDown }
  if (!there[way] || (!props.vertical && (way === 'up' || way === 'down'))) return false
  // An explicit switch: emit can't take a union of event names.
  if (way === 'previous') emit('previous')
  else if (way === 'next') emit('next')
  else if (way === 'up') emit('up')
  else emit('down')
  return true
}

/**
 * The arrow keys step through while the viewer is open, wherever the focus is: a ‹ › button that
 * had it is disabled at the first or last image, and the browser then drops the focus out of the
 * dialog, which would leave the keys going nowhere (and listened for on the dialog, they did).
 * Without `vertical`, ↑ and ↓ step as ← and → do. They're the viewer's even at the first or last
 * image, so one too many doesn't scroll the page behind.
 */
const KEYS = { ArrowLeft: 'previous', ArrowRight: 'next', ArrowUp: 'up', ArrowDown: 'down' } as const
const FLAT = { ...KEYS, ArrowUp: 'previous', ArrowDown: 'next' } as const
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (!dialog.value?.open || !(e.key in KEYS) || e.altKey || e.ctrlKey || e.metaKey) return
  if (props.painting) return
  e.preventDefault()
  go((props.vertical ? KEYS : FLAT)[e.key as keyof typeof KEYS])
})

/**
 * A swipe on a touch screen steps as the arrow keys do, the finger pulling the next image in: left
 * for the next, down for the one above. Not while zoomed in, where a drag pans, nor for a pinch.
 */
const SWIPES = { left: 'next', right: 'previous', up: 'down', down: 'up', none: null } as const
const image = useTemplateRef<{ zoomed: boolean }>('image')
/** A second finger came down during this touch: a pinch, not a swipe. */
let pinched = false
/** The touch began on the caption, which scrolls when it's long: not a swipe either. */
const captionBox = useTemplateRef<HTMLElement>('captionBox')
let onCaption = false
useEventListener(dialog, 'touchstart', (e: TouchEvent) => {
  if (e.touches.length > 1) pinched = true
}, { passive: true })
useSwipe(dialog, {
  threshold: 50,
  onSwipeStart: (e) => {
    pinched = false
    onCaption = !!captionBox.value?.contains(e.target as Node)
  },
  onSwipeEnd: (_e, direction) => {
    if (pinched || onCaption || image.value?.zoomed || props.painting) return
    const way = SWIPES[direction]
    if (way) go(way)
  },
})

watch(
  () => props.src,
  (src) => {
    const el = dialog.value
    if (!el) return
    if (src && !el.open) {
      el.showModal()
      // The dialog itself, not its first button: a ‹ › focused shows a ring, and one disabled under
      // the focus (the last image) drops it out of the dialog.
      el.focus()
    }
    else if (!src && el.open) el.close()
  },
  { flush: 'post' },
)

/**
 * A click that isn't on the image or its controls (the dimmed backdrop, the space around it)
 * closes; a pan that starts on the image and lets go outside it doesn't.
 */
const controls = useTemplateRef<HTMLElement>('controls')
const below = useTemplateRef<HTMLElement>('below')
onClickOutside(
  () => dialog.value?.querySelector<HTMLElement>('[data-image-frame]'),
  () => dialog.value?.open && !props.painting && dialog.value.close(),
  { ignore: [controls, below] },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none touch-pinch-zoom overscroll-contain bg-transparent p-0 outline-none backdrop:bg-black/85"
    tabindex="-1"
    data-image-viewer
    @close="emit('close')"
  >
    <!-- The controls above the image and the caption below it; on a phone on its side, both in a
         column beside it, so the image has the whole height. -->
    <div
      v-if="src"
      class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] p-4 sm:p-8 short:grid-cols-[minmax(0,1fr)_13rem] short:grid-rows-[auto_minmax(0,1fr)] short:gap-x-4 short:p-3"
    >
      <div
        ref="controls"
        class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pb-2 text-sm text-white/80 short:col-start-2 short:row-start-1 short:justify-start"
        data-viewer-controls
      >
        <template v-if="label || hasPrevious || hasNext || vertical">
          <button
            type="button"
            class="shrink-0 p-1 hover:text-white disabled:opacity-30"
            :disabled="!hasPrevious"
            aria-label="Previous (←)"
            title="Previous (←)"
            data-previous
            @click="go('previous')"
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            class="shrink-0 p-1 hover:text-white disabled:opacity-30"
            :disabled="!hasNext"
            aria-label="Next (→)"
            title="Next (→)"
            data-next
            @click="go('next')"
          >
            <Icon name="chevron-right" />
          </button>
          <template v-if="vertical">
            <button
              type="button"
              class="shrink-0 p-1 hover:text-white disabled:opacity-30"
              :disabled="!hasUp"
              :aria-label="`Previous ${verticalName ?? 'row'} (↑)`"
              :title="`Previous ${verticalName ?? 'row'} (↑)`"
              data-up
              @click="go('up')"
            >
              <Icon name="chevron-up" />
            </button>
            <button
              type="button"
              class="shrink-0 p-1 hover:text-white disabled:opacity-30"
              :disabled="!hasDown"
              :aria-label="`Next ${verticalName ?? 'row'} (↓)`"
              :title="`Next ${verticalName ?? 'row'} (↓)`"
              data-down
              @click="go('down')"
            >
              <Icon name="chevron-down" />
            </button>
          </template>
          <!-- On a phone, a line of its own under the buttons; beside them on a wider screen. -->
          <span
            v-if="label"
            class="order-last min-w-0 basis-full truncate tabular-nums sm:order-none sm:mr-auto sm:basis-auto short:order-last short:basis-full short:whitespace-normal"
            :title="label"
            data-viewer-label
          >
            {{ label }}
          </span>
          <span class="mr-auto" :class="{ 'sm:hidden': label }" />
        </template>
        <!-- More controls, for what's being viewed (a picture's versions, Edit). -->
        <slot name="controls" />
        <a :href="src" target="_blank" class="shrink-0 whitespace-nowrap hover:text-white hover:underline">
          Open full size
        </a>
        <button
          type="button"
          class="shrink-0 whitespace-nowrap hover:text-white"
          aria-label="Close"
          @click="dialog?.close()"
        >
          <span class="hidden sm:inline">Close </span>✕
        </button>
      </div>
      <FrameImage
        ref="image"
        :src="src"
        :alt="alt"
        bare
        instant
        zoom
        class="short:col-start-1 short:row-span-2 short:row-start-1"
      >
        <template #layer="{ size }">
          <slot name="layer" :size="size" />
        </template>
      </FrameImage>
      <!-- In place of the caption: tools for what's being done to the image (painting an edit). -->
      <div
        v-if="$slots.below"
        ref="below"
        class="mx-auto mt-2 w-full max-w-3xl short:col-start-2 short:row-start-2"
        data-viewer-below
      >
        <slot name="below" />
      </div>
      <p
        v-else-if="caption !== undefined"
        ref="captionBox"
        class="mx-auto mt-2 h-[3lh] w-full max-w-prose shrink-0 overflow-y-auto text-sm whitespace-pre-line text-white/80 short:col-start-2 short:row-start-2 short:h-auto short:min-h-0"
        data-viewer-caption
      >
        {{ caption }}
      </p>
    </div>
  </dialog>
</template>
