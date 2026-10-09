<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import type { Look } from '../api'
import CollapsibleTextarea from './CollapsibleTextarea.vue'
import LookPerson from './LookPerson.vue'

/**
 * A Look edited by hand: a card per person (name and identity), people added or removed, and the
 * art style; Save appears once something changed. Shared by Storyboards and Roleplays (ADR 0012).
 */
const props = defineProps<{
  /** The Look as saved; the draft starts again from it whenever it changes. */
  look: Look
  /** Remembers each card's collapsed state under this, e.g. `storyboard.look`. */
  idPrefix: string
  /** What the Look applies to, after its heading: "every Frame", "every picture". */
  every: string
  disabled?: boolean
  /**
   * A Roleplay's: names come from its Cast and story, so they aren't edited, no one is added by
   * hand, and these people (the Character and Persona) can't be removed.
   */
  kept?: string[]
}>()
const emit = defineEmits<{ save: [look: Look] }>()

const draft = ref<Look>({ people: [], style: '' })
watch(() => props.look, (l) => (draft.value = structuredClone(toRaw(l))), { immediate: true })
const trimmed = (l: Look): Look => ({
  people: l.people.map((p) => ({ name: p.name.trim(), identity: p.identity.trim() })),
  style: l.style.trim(),
})
const changed = computed(() => JSON.stringify(trimmed(draft.value)) !== JSON.stringify(props.look))
</script>

<template>
  <form class="flex min-w-0 flex-col gap-2" data-look @submit.prevent="emit('save', draft)">
    <h3 class="font-medium">Look <span class="font-normal text-muted">· {{ every }}</span></h3>
    <LookPerson
      v-for="(person, i) in draft.people"
      :id="`${idPrefix}.person.${i}`"
      :key="i"
      v-model:name="person.name"
      v-model:identity="person.identity"
      :disabled="disabled"
      :name-fixed="!!kept"
      :kept="kept?.includes(person.name)"
      @remove="draft.people.splice(i, 1)"
    />
    <button
      v-if="!kept"
      type="button"
      class="w-fit text-xs text-muted hover:text-fg disabled:opacity-50"
      :disabled="disabled"
      data-add-person
      @click="draft.people.push({ name: '', identity: '' })"
    >
      + Add a person
    </button>
    <CollapsibleTextarea
      :id="`${idPrefix}.style`"
      v-model="draft.style"
      label="Art style and medium"
      :disabled="disabled"
    />
    <button
      v-if="changed"
      type="submit"
      class="w-fit rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
      :disabled="disabled"
    >
      Save Look
    </button>
  </form>
</template>
