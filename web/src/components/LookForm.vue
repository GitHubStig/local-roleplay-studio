<script setup lang="ts">
import type { Look } from '../api'
import { type SaveLine, useAutosave } from '../composables/useAutosave'
import CollapsibleTextarea from './CollapsibleTextarea.vue'
import LookPerson from './LookPerson.vue'
import SaveStatus from './SaveStatus.vue'

/**
 * A Look edited by hand: a card per person (name and identity), people added or removed, and the
 * art style. Saved once the focus leaves the form, or a person is removed (`useAutosave`); the
 * screen calls `flush` before work that reads it. Shared by Storyboards and Roleplays (ADR 0012).
 */
const props = defineProps<{
  /** The Look as saved; the draft starts again from it whenever it changes elsewhere. */
  look: Look
  /** Saves a Look, returning it as saved. Throws if refused. */
  save: (look: Look) => Promise<Look>
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
  /** Said while saving, e.g. that it waits for the render running. */
  savingText?: string
  /** The Session's line of saves, shared with its other drafts. */
  line?: SaveLine
}>()

const trimmed = (l: Look): Look => ({
  people: l.people.map((p) => ({ name: p.name.trim(), identity: p.identity.trim() })),
  style: l.style.trim(),
})
/** Why the Look can't be saved yet: what the server would refuse it for. */
function hold(look: Look): string | null {
  const l = trimmed(look)
  if (l.people.some((p) => !p.name || !p.identity)) return 'each person needs a name and an identity'
  if (new Set(l.people.map((p) => p.name.toLowerCase())).size < l.people.length) {
    return 'two people have the same name'
  }
  return l.style ? null : 'the Look needs a style'
}
const { draft, status, canRevert, flush, revert, onFocusout } = useAutosave<Look>({
  source: () => props.look,
  save: (look) => props.save(trimmed(look)),
  hold,
  normal: trimmed,
  line: props.line,
})

function remove(i: number) {
  draft.value!.people.splice(i, 1)
  flush()
}

defineExpose({ flush })
</script>

<template>
  <form
    v-if="draft"
    class="flex min-w-0 flex-col gap-2"
    data-look
    @submit.prevent="flush"
    @focusout="onFocusout"
  >
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
      @remove="remove(i)"
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
    <SaveStatus
      :status="status"
      :can-revert="canRevert"
      :disabled="disabled"
      :saving-text="savingText"
      @revert="revert"
    />
  </form>
</template>
