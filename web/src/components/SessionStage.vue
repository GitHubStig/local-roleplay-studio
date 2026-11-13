<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import { PICTURE_RATIO } from './pictureRatio'

/**
 * The story's area under a Session's bar and strip, in every kind of Session: the picked Frame's
 * picture (`picture` slot) beside what goes with it (`side`: a Roleplay's story, a Chain's Action,
 * a Storyboard's Beat), and the floating text box over its foot (`box`). On a wide screen the
 * picture grows to the height there is and the side keeps a book-page width beside it, the two
 * centred; on a phone they stack. The picture's shape (`SessionPicture` sets it once loaded,
 * `ratio` until then) sizes both.
 */
const props = withDefaults(defineProps<{
  /** The picture's shape until one has loaded: the Session's image size. */
  ratio?: number
  /** Whether the picture's side shows. */
  pictured?: boolean
  /**
   * What's beside the picture: a story to read (a Roleplay's), kept at a book-page width, or notes
   * (a Chain's Action, a Storyboard's Beat), narrower on a smaller screen, so the picture has the room.
   */
  side?: 'story' | 'notes'
}>(), { ratio: 1.5, pictured: true, side: 'story' })

const ratio = ref(props.ratio)
watch(() => props.ratio, (r) => (ratio.value = r))
provide(PICTURE_RATIO, ratio)
</script>

<template>
  <main class="story relative flex min-w-0 flex-1 flex-col">
    <div
      class="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 px-4 pt-3 lg:max-w-[calc((100dvh-14rem)*var(--ratio)+var(--side)+6rem)] lg:flex-row lg:gap-6 lg:px-6 lg:pt-4"
      :class="$slots.box ? 'pb-24 lg:pb-[6.5rem]' : 'pb-4'"
      :style="{ '--ratio': ratio, '--side': side === 'story' ? '38rem' : 'clamp(20rem, 28vw, 34rem)' }"
      :data-ratio="ratio.toFixed(3)"
      data-stage
    >
      <section
        v-if="pictured && $slots.picture"
        class="flex shrink-0 justify-center lg:min-w-0 lg:flex-1 lg:items-start lg:justify-end lg:[container-type:size]"
        data-picture-side
      >
        <slot name="picture" />
      </section>
      <div
        class="flex min-h-0 flex-1 flex-col"
        :class="{ 'lg:w-(--side) lg:flex-none': pictured && $slots.picture }"
        data-stage-side
      >
        <slot name="side" />
      </div>
    </div>
    <!-- Floating over the foot of the story: the picture and the side end just above it at one
         line, and as it grows it rises over them. -->
    <div
      v-if="$slots.box"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-3xl px-3 pb-4 *:pointer-events-auto lg:pb-6"
    >
      <slot name="box" />
    </div>
  </main>
</template>
