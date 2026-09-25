<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePinchZoom } from '../composables/usePinchZoom'

const props = defineProps<{
  /** The image to show; null for none. */
  src: string | null
  alt?: string
  /** The border sweeps while an image renders, slower and dimmer while it waits in the queue. */
  rendering?: 'image' | 'queued' | null
  /** Shown when there's no image. */
  emptyText?: string
  /**
   * Hide the size chip, which otherwise shows the image's pixel size in the top-left corner on
   * hover; screens hide it while their status pill is there.
   */
  hideSize?: boolean
}>()

/** The image on screen; it only changes once the next one has loaded, for a clean crossfade. */
const displayed = ref<{ src: string; alt: string } | null>(null)

watch(
  () => props.src,
  (src) => {
    if (!src) {
      displayed.value = null
      return
    }
    if (src === displayed.value?.src) return
    const img = new Image()
    // Skip if another image was asked for meanwhile.
    const show = () => {
      if (props.src === src) displayed.value = { src, alt: props.alt ?? '' }
    }
    img.onload = show
    img.onerror = show
    img.src = src
  },
  { immediate: true },
)

/** Pinch to zoom the image, not the page; each new image starts unzoomed. */
const frame = ref<HTMLElement | null>(null)
const { zoomed, layerStyle, view, reset } = usePinchZoom(frame)
watch(() => displayed.value?.src, reset)

/** Width ÷ height of the images shown; portrait until the first one loads. */
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
    class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface [container-type:size]"
  >
    <div
      ref="frame"
      class="group relative overflow-hidden rounded-md"
      :class="{ 'render-sweep': rendering, 'cursor-grab active:cursor-grabbing': zoomed }"
      :style="frameStyle"
      :data-rendering="rendering ?? undefined"
    >
      <!-- The zoomed layer: only the image scales, not what's drawn over it. -->
      <div class="absolute inset-0 origin-top-left" :style="layerStyle" data-zoom-layer>
      <!-- Crossfade: the next image is preloaded, then fades in over the last one. -->
      <Transition
        enter-active-class="transition-opacity duration-700 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-700 ease-in"
        leave-to-class="opacity-0"
      >
        <img
          v-if="displayed"
          :key="displayed.src"
          :src="displayed.src"
          :alt="displayed.alt"
          class="absolute inset-0 h-full w-full object-contain"
          draggable="false"
          @load="onImageLoad"
        />
      </Transition>
      </div>
      <span
        v-if="!displayed && emptyText"
        class="absolute inset-0 flex items-center justify-center px-6 text-center text-muted"
      >
        {{ emptyText }}
      </span>
      <span
        v-if="displayed && size && !hideSize"
        class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm tabular-nums text-white opacity-0 transition-opacity group-hover:opacity-100"
        data-size
      >
        {{ size.width }}×{{ size.height }}<template v-if="zoomed">
          · {{ Math.round(view.scale * 100) }}%</template>
      </span>
      <!-- Pills, captions and anything else drawn over the image. -->
      <slot />
    </div>
  </section>
</template>
