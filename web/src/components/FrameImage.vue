<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  /** The image to show; null for none. */
  src: string | null
  alt?: string
  /** The border sweeps while an image renders, slower and dimmer while it waits in the queue. */
  rendering?: 'image' | 'queued' | null
  /** Shown when there's no image. */
  emptyText?: string
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

/** Width ÷ height of the images shown; portrait until the first one loads. */
const aspect = ref(832 / 1216)

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) aspect.value = img.naturalWidth / img.naturalHeight
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
      class="relative overflow-hidden rounded-md"
      :class="{ 'render-sweep': rendering }"
      :style="frameStyle"
      :data-rendering="rendering ?? undefined"
    >
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
          @load="onImageLoad"
        />
      </Transition>
      <span
        v-if="!displayed && emptyText"
        class="absolute inset-0 flex items-center justify-center px-6 text-center text-muted"
      >
        {{ emptyText }}
      </span>
      <!-- Pills, captions and anything else drawn over the image. -->
      <slot />
    </div>
  </section>
</template>
