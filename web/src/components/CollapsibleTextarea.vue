<script setup lang="ts">
import { computed } from 'vue'
import { useStoredFlag } from '../composables/useStoredFlag'
import { vAutosize } from '../directives/autosize'

/**
 * A labelled textarea that shows all its text (it grows to fit) and can be collapsed to a
 * one-line preview by clicking its label. Whether it's collapsed is remembered per browser, by
 * `id`.
 */
const props = defineProps<{
  /** Remembers this field's collapsed state, e.g. `look.character`. */
  id: string
  label: string
  disabled?: boolean
}>()
const value = defineModel<string>({ required: true })

const collapsed = useStoredFlag(`collapsed:${props.id}`)
const preview = computed(() => value.value.replace(/\s+/g, ' ').trim())
</script>

<template>
  <details
    class="group/field text-xs text-muted"
    :open="!collapsed"
    :data-collapsible="id"
    @toggle="collapsed = !($event.target as HTMLDetailsElement).open"
  >
    <summary class="flex cursor-pointer select-none items-baseline gap-1.5 py-0.5 hover:text-fg">
      <span class="shrink-0 transition-transform group-open/field:rotate-90">›</span>
      <span class="shrink-0">{{ label }}</span>
      <span v-if="collapsed" class="min-w-0 truncate text-muted/80" data-preview>· {{ preview }}</span>
    </summary>
    <textarea
      v-model="value"
      v-autosize
      rows="1"
      class="mt-1 w-full resize-none rounded border border-line bg-surface p-2 text-sm text-fg"
      :disabled="disabled"
      :data-field="id"
    />
  </details>
</template>
