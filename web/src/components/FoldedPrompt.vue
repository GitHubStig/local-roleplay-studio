<script setup lang="ts">
import { useStoredFlag } from '../composables/useStoredFlag'

/**
 * A Frame's Image Prompt in its Frame tab, the same on every kind's screen: folded to a line by
 * clicking its label, so a long one doesn't push the Clip section out of reach. Whether it's folded
 * is remembered per browser, once for every screen. `actions` sits at the end of its label's line.
 */
defineProps<{
  label?: string
  /** Shown after the label while it's folded. */
  preview?: string
}>()

const folded = useStoredFlag('collapsed:frame.image-prompt')
</script>

<template>
  <section class="flex flex-col gap-1.5" data-image-prompt>
    <div class="flex items-center justify-between gap-2">
      <h4 class="min-w-0 text-xs font-medium text-muted">
        <button
          type="button"
          class="flex w-full min-w-0 items-baseline gap-1.5 text-left hover:text-fg"
          :aria-expanded="!folded"
          data-toggle-image-prompt
          @click="folded = !folded"
        >
          <span class="shrink-0 transition-transform" :class="{ 'rotate-90': !folded }">›</span>
          <span class="shrink-0">{{ label ?? 'Image Prompt' }}</span>
          <slot name="note" />
          <span v-if="folded && preview" class="min-w-0 truncate font-normal text-muted/80" data-preview>
            · {{ preview }}
          </span>
        </button>
      </h4>
      <slot name="actions" />
    </div>
    <slot v-if="!folded" />
  </section>
</template>
