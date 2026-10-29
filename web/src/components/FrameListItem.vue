<script setup lang="ts">
import Icon from './Icon.vue'

/**
 * One Frame in a Session's Frames list, the same in every kind of Session: its picture small (or
 * its number, until it has one), with how many clips the picture has in its corner, then what the
 * Session says of it (the default slot). Selecting it is the caller's, through `@click` on the
 * button.
 */
withDefaults(
  defineProps<{
    /** The picture's address, or none for the number in its place. */
    thumb?: string | null
    /** Shown in place of the picture. */
    number: number | string
    /** The selected Frame. */
    current?: boolean
    /** The picture is out of date (changed since it was rendered). */
    dimmed?: boolean
    /** The Frame is being written: its number's box sweeps. */
    writing?: boolean
    /** How many clips the picture shown has (ADR 0025). */
    clips?: number
  }>(),
  { thumb: null, current: false, dimmed: false, writing: false, clips: 0 },
)
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
    :class="{ 'bg-surface': current }"
    :aria-current="current"
  >
    <span v-if="thumb" class="relative h-20 w-14 shrink-0">
      <img
        :src="thumb"
        alt=""
        class="h-full w-full rounded object-cover"
        :class="{ 'opacity-50': dimmed }"
      />
      <span
        v-if="clips"
        class="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1 text-[0.7rem] leading-4 text-white tabular-nums"
        :title="clips === 1 ? '1 clip' : `${clips} clips`"
        data-clip-count
      >
        <Icon name="play" />{{ clips }}
      </span>
    </span>
    <span
      v-else
      class="flex h-20 w-14 shrink-0 items-center justify-center rounded border border-dashed border-line text-xs text-muted"
      :class="{ 'render-sweep': writing }"
      :data-writing-frame="writing ? '' : undefined"
    >
      {{ number }}
    </span>
    <span class="flex min-w-0 flex-col gap-1"><slot /></span>
  </button>
</template>
