<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, useId, useTemplateRef } from 'vue'
import SuggestButton, { type Hint } from './SuggestButton.vue'

/**
 * One of a Scenario's text parts, as a row: its name in a column on the left (what to write there
 * on hover, `guide`), the text on the right, as tall as it is, with no box until it's edited.
 * Blank leaves it to the Text Model, unless a suggestion is taken. Suggest shows on the part being
 * edited or pointed at, and always on a touch screen, rather than on every part at once: in the
 * box's bottom-right corner, which the text keeps clear of.
 */
const props = defineProps<{
  /** The part's name, as Expand's suggestions have it: `place`, `people.<id>.goal`. */
  field: string
  label: string
  /** What goes there, on hover over its name. */
  guide?: string
  /** Shown while it's blank and nothing's suggested (the Opening's, which can't be left out). */
  placeholder?: string
  /** Its Suggest button's state; none for a part that can't be suggested for. */
  hint?: Hint
  disabled?: boolean
}>()
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ suggest: [] }>()

const shownPlaceholder = computed(() =>
  props.hint?.offer ? `Suggested: ${props.hint.offer}` : props.placeholder ?? 'Left to the Text Model'
)
const boxId = useId()
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
useTextareaAutosize({ element: textarea, input: value, styleProp: 'minHeight' })
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="group/part grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 max-sm:grid-cols-1">
    <label :for="boxId" class="pt-1.5 text-sm text-muted" :title="guide">{{ label }}</label>
    <!-- The box and an invisible copy of its placeholder share one grid cell, so a blank part is
         as tall as its placeholder: a browser sizes a box by what's typed. -->
    <div class="relative grid min-w-0">
      <textarea
        :id="boxId"
        ref="textarea"
        v-model="value"
        rows="1"
        class="col-start-1 row-start-1 block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-fg hover:border-line focus:border-line focus:bg-surface focus:outline-none disabled:opacity-60"
        :class="{ 'pr-[4.5rem]': hint }"
        :disabled="disabled || hint?.busy"
        :placeholder="shownPlaceholder"
        :data-field="field"
      />
      <div
        v-if="!value"
        aria-hidden="true"
        class="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words border border-transparent px-1.5 py-1 text-sm"
        :class="{ 'pr-[4.5rem]': hint }"
      >
        {{ shownPlaceholder }}
      </div>
      <SuggestButton
        v-if="hint"
        class="absolute bottom-1 right-1 z-10"
        :class="{ 'opacity-0 group-focus-within/part:opacity-100 group-hover/part:opacity-100 touch:opacity-100': !hint.busy }"
        :hint="hint"
        :disabled="disabled"
        @suggest="emit('suggest')"
      />
    </div>
    <p v-if="hint?.error" class="text-xs text-danger sm:col-start-2" data-suggest-error>{{ hint.error }}</p>
  </div>
</template>
