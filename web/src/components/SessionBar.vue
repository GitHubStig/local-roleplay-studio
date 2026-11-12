<script setup lang="ts">
/**
 * A Session's own bar, across the top of its screen in every kind: its kind and title on the left,
 * what's about the whole Session on the right (the `default` slot: Look & Cast, Music, its models
 * and switches). What the Session is doing now (`status`) shows after the title.
 */
defineProps<{ kind: string; title: string; status?: string }>()
</script>

<template>
  <header class="flex min-h-11 shrink-0 items-center gap-3 border-b border-line px-4 py-1.5" data-session-bar>
    <div class="flex min-w-0 flex-1 items-baseline gap-2">
      <span class="shrink-0 text-[0.7rem] uppercase tracking-wide text-muted max-sm:hidden">{{ kind }}</span>
      <h1 class="truncate text-sm font-semibold" data-session-title>{{ title }}</h1>
      <span v-if="status" class="min-w-0 truncate text-sm text-muted animate-pulse" role="status">{{ status }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-0.5 text-sm text-muted sm:gap-1">
      <slot />
    </div>
  </header>
</template>
