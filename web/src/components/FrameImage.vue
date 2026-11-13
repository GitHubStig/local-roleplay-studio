<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { usePinchZoom } from '../composables/usePinchZoom'

/**
 * The picture in the full-screen viewer (`ImageViewer`): as large as the room allows in its own
 * shape, pinched to zoom and dragged to pan, a new picture shown at once; its pixel size on hover.
 * What's drawn on it zooms with it (the `layer` slot); what's over it (the default slot) and beside
 * it (`side`) doesn't.
 */
const props = defineProps<{
  /** The image to show; null for none. */
  src: string | null
  alt?: string
  /** The border sweeps while an image renders, slower and dimmer while it waits in the queue. */
  rendering?: 'image' | 'queued' | null
}>()

/** The image on screen, shown at once as another is asked for. */
const displayed = computed(() => (props.src ? { src: props.src, alt: props.alt ?? '' } : null))

/** Pinch to zoom the image, not the page; each new image starts unzoomed. */
const frame = useTemplateRef<HTMLElement>('frame')
const { zoomed, layerStyle, view, reset } = usePinchZoom(frame)
watch(() => displayed.value?.src, reset)
/** Whether it's zoomed in: a drag then pans it (the viewer's swipes wait till it's back). */
defineExpose({ zoomed })

/** Width ÷ height of the image shown, once loaded; a portrait's until then. */
const aspect = ref(832 / 1216)
/** Pixel size of the image on screen, once loaded. */
const size = ref<{ width: number; height: number } | null>(null)

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    aspect.value = img.naturalWidth / img.naturalHeight
    size.value = { width: img.naturalWidth, height: img.naturalHeight }
  }
}

/** The largest box of the image's proportions that fits the panel (`cq*` = panel size). */
const frameStyle = computed(() => ({
  width: `min(100cqw, calc(100cqh * ${aspect.value}))`,
  height: `min(100cqh, calc(100cqw / ${aspect.value}))`,
}))
</script>

<template>
  <!-- The image takes all the space it's given and never resizes as text around it changes. The
       frame inside is sized to the image's proportions, so overlays sit on the image itself. -->
  <section
    class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg [container-type:size]"
    :class="{ 'sm:px-48': $slots.side }"
  >
    <!-- What sits beside the image (a column of buttons), on as wide a screen as has room: the same
         room is kept on the other side, so the image stays centred. -->
    <div class="relative" :style="frameStyle">
    <div
      ref="frame"
      data-image-frame
      class="group relative h-full w-full overflow-hidden rounded-md"
      :class="{ 'render-sweep': rendering, 'cursor-grab active:cursor-grabbing': zoomed }"
      :data-rendering="rendering ?? undefined"
      :data-aspect="aspect.toFixed(3)"
    >
      <!-- The zoomed layer: only the image scales, not what's drawn over it. -->
      <div class="absolute inset-0 origin-top-left" :style="layerStyle" data-zoom-layer>
        <img
          v-if="displayed"
          :key="displayed.src"
          :src="displayed.src"
          :alt="displayed.alt"
          class="absolute inset-0 h-full w-full object-contain"
          draggable="false"
          data-frame-picture
          @load="onImageLoad"
        />
        <!-- Drawn on the image itself, zoomed and panned with it (a paint layer), at its size. -->
        <slot v-if="displayed && size" name="layer" :size="size" />
      </div>
      <span
        v-if="displayed && size"
        class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm tabular-nums text-white opacity-0 transition-opacity group-hover:opacity-100"
        data-size
      >
        {{ size.width }}×{{ size.height }}<template v-if="zoomed">
          · {{ Math.round(view.scale * 100) }}%</template>
      </span>
      <!-- Pills, captions and anything else drawn over the image. -->
      <slot />
    </div>
      <div
        v-if="$slots.side"
        class="absolute top-0 left-full ml-3 hidden w-44 sm:block"
        data-image-side
      >
        <slot name="side" />
      </div>
    </div>
  </section>
</template>
