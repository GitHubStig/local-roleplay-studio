<script setup lang="ts">
/** A version of a picture as its button shows it: a render or edit, or an edit being made. */
export interface VersionEntry {
  key: string
  /** The edit model whose line it's in, headed once above its versions; none for the Original. */
  group?: string
  label: string
  /** Shown on hover: what it was told to paint. */
  title?: string
  /** An edit still being made, or one that failed. */
  state?: 'editing' | 'failed'
  selected: boolean
}

/**
 * A picture's versions (ADR 0021) as buttons, Original first, then each edit model's, under its
 * name, its edits being made last;
 * what can be done to the one chosen follows them (the default slot). A column beside the picture,
 * or a row under it where there's no room.
 */
defineProps<{ versions: VersionEntry[]; vertical: boolean; disabled?: boolean }>()
defineEmits<{ choose: [key: string] }>()
</script>

<template>
  <div
    class="flex gap-2 text-sm text-white/80"
    :class="vertical ? 'flex-col items-stretch' : 'flex-wrap items-center justify-center'"
    data-versions
  >
    <div
      v-if="versions.length > 1"
      class="flex overflow-hidden rounded-lg border border-white/30 bg-black/70"
      :class="vertical ? 'flex-col' : ''"
      role="group"
      aria-label="Versions of the picture"
    >
      <template v-for="(v, i) in versions" :key="v.key">
      <span
        v-if="v.group && v.group !== versions[i - 1]?.group"
        class="border-t border-white/20 px-2 pt-1 text-[0.7rem] leading-tight text-white/50"
        :class="vertical ? 'max-w-32' : 'self-center border-l border-t-0 pt-0'"
        :title="v.group"
        data-version-group
      >{{ v.group }}</span>
      <button
        type="button"
        class="px-2 py-1 text-left disabled:opacity-50"
        :class="v.selected ? 'bg-white/90 text-black' : 'hover:text-white'"
        :aria-pressed="v.selected"
        :disabled="disabled"
        :title="v.title"
        :data-version="v.key"
        @click="!v.selected && $emit('choose', v.key)"
      >
        <span class="block whitespace-nowrap">{{ v.label }}</span>
        <span v-if="v.state === 'editing'" class="block animate-pulse text-xs">editing</span>
        <span v-else-if="v.state === 'failed'" class="block text-xs text-danger">failed</span>
      </button>
      </template>
    </div>
    <slot />
  </div>
</template>
