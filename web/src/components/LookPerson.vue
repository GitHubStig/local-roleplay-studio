<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useStoredFlag } from '../composables/useStoredFlag'

/**
 * One person in a Look, in a card of their own: their name and identity. The card
 * collapses to the name and a one-line preview by clicking its header; whether it's collapsed is
 * remembered per browser, by `id`.
 */
const props = defineProps<{
  /** Remembers this card's collapsed state, e.g. `storyboard.look.person.0`. */
  id: string
  disabled?: boolean
  /** The name comes from elsewhere (a Roleplay's Cast or story): shown, not edited. */
  nameFixed?: boolean
  /** Hides Remove, for someone the Look must keep (a Roleplay's Character and Persona). */
  kept?: boolean
}>()
const name = defineModel<string>('name', { required: true })
const identity = defineModel<string>('identity', { required: true })
const emit = defineEmits<{ remove: [] }>()

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
useTextareaAutosize({ element: textarea, input: identity })

const collapsed = useStoredFlag(`collapsed:${props.id}`)
const preview = computed(() => identity.value.replace(/\s+/g, ' ').trim())
</script>

<template>
  <details
    class="group/person min-w-0 rounded border border-line text-xs text-muted"
    :open="!collapsed"
    :data-collapsible="id"
    data-person
    @toggle="collapsed = !($event.target as HTMLDetailsElement).open"
  >
    <summary class="flex cursor-pointer select-none items-baseline gap-1.5 px-2 py-1.5 hover:text-fg">
      <span class="shrink-0 transition-transform group-open/person:rotate-90">›</span>
      <span class="shrink-0 text-sm font-medium text-fg">{{ name.trim() || 'New person' }}</span>
      <span v-if="collapsed" class="min-w-0 flex-1 truncate text-muted/80" data-preview>
        · {{ preview }}
      </span>
      <button
        v-if="!kept"
        type="button"
        class="ml-auto shrink-0 rounded px-1.5 text-muted hover:text-fg disabled:opacity-50"
        :aria-label="`Remove ${name.trim() || 'this person'}`"
        :disabled="disabled"
        @click.prevent="emit('remove')"
      >
        Remove
      </button>
    </summary>
    <div class="flex flex-col gap-2 border-t border-line p-2">
      <label v-if="!nameFixed" class="flex flex-col gap-1">
        Name
        <input
          v-model="name"
          class="rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          :disabled="disabled"
          data-person-name
        />
      </label>
      <label class="flex flex-col gap-1">
        Identity
        <textarea
          ref="textarea"
          v-model="identity"
          rows="1"
          class="w-full resize-none overflow-hidden rounded border border-line bg-surface p-2 text-sm text-fg"
          placeholder="Their name, age, build, skin, hair and face"
          :disabled="disabled"
        />
      </label>
    </div>
  </details>
</template>
