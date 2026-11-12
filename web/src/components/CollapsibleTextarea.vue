<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, useId, useTemplateRef } from 'vue'
import { useStoredFlag } from '../composables/useStoredFlag'

/**
 * A labelled textarea that shows all its text (it grows to fit) and can be collapsed to a
 * one-line preview by clicking its label. Whether it's collapsed is remembered per browser, by
 * `id`. With `alwaysOpen` it doesn't collapse, for a box inside a part that collapses itself.
 */
const props = defineProps<{
  /** Remembers this field's collapsed state, e.g. `look.character`. */
  id: string
  label: string
  disabled?: boolean
  /** Shown while it's empty. */
  placeholder?: string
  alwaysOpen?: boolean
  /** Its label as a part's title, for a box that stands as a part of its own (a Look's art style). */
  heading?: boolean
  /** Its label as a section's heading, as the Look's and the Cast's are (a Storyboard's Beat). */
  section?: boolean
}>()
const value = defineModel<string>({ required: true })

// As tall as its text (as it's typed, when its value changes, and when its width changes the
// wrapping), so a panel of these scrolls as one instead of trapping the wheel in each box. A
// minimum height, so an empty box can grow to its placeholder (below).
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
useTextareaAutosize({ element: textarea, input: value, styleProp: 'minHeight' })

const collapsed = useStoredFlag(`collapsed:${props.id}`)
const boxId = useId()
const preview = computed(() => value.value.replace(/\s+/g, ' ').trim())
</script>

<template>
  <!-- Buttons for the box (the `actions` slot) sit in its bottom-right corner, over a strip of
       padding about half a line tall: small ones (18 px) fit it, overlapping only the space below
       the last line's letters. -->
  <div v-if="alwaysOpen" class="flex flex-col gap-1 text-xs text-muted">
    <label :for="boxId" :class="{ 'text-sm font-medium text-fg': heading }">{{ label }}</label>
    <!-- The box and an invisible copy of its placeholder share one grid cell, so an empty box is
         as tall as its placeholder: a browser sizes it by what's typed, and a long placeholder ran
         on under the buttons. -->
    <div class="relative grid">
      <textarea
        :id="boxId"
        ref="textarea"
        v-model="value"
        rows="1"
        class="col-start-1 row-start-1 block w-full resize-none overflow-hidden rounded border border-line bg-surface p-2 text-sm text-fg disabled:opacity-60"
        :class="{ 'pb-5': $slots.actions }"
        :disabled="disabled"
        :placeholder="placeholder"
        :data-field="id"
      />
      <div
        v-if="!value && placeholder"
        aria-hidden="true"
        class="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words border border-transparent p-2 text-sm"
        :class="{ 'pb-5': $slots.actions }"
      >
        {{ placeholder }}
      </div>
      <div v-if="$slots.actions" class="absolute right-1 bottom-1 flex gap-1">
        <slot name="actions" />
      </div>
    </div>
  </div>
  <details
    v-else
    class="group/field text-xs text-muted"
    :open="!collapsed"
    :data-collapsible="id"
    @toggle="collapsed = !($event.target as HTMLDetailsElement).open"
  >
    <summary class="flex cursor-pointer select-none items-baseline gap-1.5 py-0.5 hover:text-fg">
      <span class="fold-caret group-open/field:rotate-90">›</span>
      <span
        class="shrink-0"
        :class="section ? 'text-base font-semibold text-fg' : heading ? 'text-sm font-medium text-fg' : ''"
      >{{ label }}</span>
      <span v-if="collapsed" class="min-w-0 truncate text-muted/80" data-preview>· {{ preview }}</span>
    </summary>
    <textarea
      ref="textarea"
      v-model="value"
      rows="1"
      class="mt-1 w-full resize-none overflow-hidden rounded border border-line bg-surface p-2 text-sm text-fg disabled:opacity-60"
      :disabled="disabled"
      :placeholder="placeholder"
      :data-field="id"
    />
  </details>
</template>
