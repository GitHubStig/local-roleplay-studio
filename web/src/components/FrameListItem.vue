<script setup lang="ts">
/**
 * One Frame in a Session's Frames list, the same in every kind of Session: its picture small (or
 * its number, until it has one), then what the Session says of it (the default slot). Selecting
 * it is the caller's, through `@click` on the button.
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
  }>(),
  { thumb: null, current: false, dimmed: false, writing: false },
)
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
    :class="{ 'bg-surface': current }"
    :aria-current="current"
  >
    <img
      v-if="thumb"
      :src="thumb"
      alt=""
      class="h-20 w-14 shrink-0 rounded object-cover"
      :class="{ 'opacity-50': dimmed }"
    />
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
