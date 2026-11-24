<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { SESSION_TITLE_LENGTH } from '../api'
import { useRename } from '../composables/useRename'

/**
 * A Session's own bar, across the top of its screen in every kind: its kind and title on the left,
 * what's about the whole Session on the right (the `default` slot: Look & Cast, Music, its models
 * and switches). What the Session is doing now (`status`) shows after the title. Clicking the title
 * renames the Session (`useRename`).
 */
const props = defineProps<{ id: string; kind: string; status?: string }>()
const title = defineModel<string>('title', { required: true })

const { editing, draft, failed, edit, save, cancel } = useRename(
  () => props.id,
  title,
  useTemplateRef<HTMLInputElement>('field'),
)
</script>

<template>
  <header class="flex min-h-11 shrink-0 items-center gap-3 border-b border-line px-4 py-1.5" data-session-bar>
    <div class="flex min-w-0 flex-1 items-baseline gap-2">
      <span class="shrink-0 text-[0.7rem] uppercase tracking-wide text-muted max-sm:hidden">{{ kind }}</span>
      <input
        v-if="editing"
        ref="field"
        v-model="draft"
        :maxlength="SESSION_TITLE_LENGTH"
        aria-label="Title"
        class="field min-w-0 flex-1 py-0.5 text-sm font-semibold"
        data-session-title-field
        @keydown.enter.prevent="save"
        @keydown.escape.prevent="cancel"
        @blur="save"
      >
      <h1 v-else class="min-w-0 truncate text-sm font-semibold" data-session-title>
        <button
          type="button"
          class="-mx-1 max-w-full truncate rounded px-1 hover:bg-surface"
          title="Rename"
          data-session-rename
          @click="edit"
        >{{ title }}</button>
      </h1>
      <span v-if="failed" class="min-w-0 truncate text-sm text-danger" role="alert">{{ failed }}</span>
      <span v-else-if="status && !editing" class="min-w-0 truncate text-sm text-muted animate-pulse" role="status">{{ status }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-0.5 text-sm text-muted sm:gap-1">
      <slot />
    </div>
  </header>
</template>
