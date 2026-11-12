<script setup lang="ts">
import ComposeBox from './ComposeBox.vue'

/**
 * The floating text box at the foot of a Session's story, in every kind of Session: what's typed,
 * the buttons the kind adds beside it (the default slot: Suggest, Undo, the ⋯ menu), and Send, which
 * stays put; Cancel in its place while the Text Model works. Its border sweeps while the Text Model
 * writes into the story or the box (`working`). It floats over what's behind it, which shows
 * through, blurred. Above it, what the last send said (the `notice` slot: a Limit crossed, an
 * error, a message put back).
 */
defineProps<{
  placeholder: string
  /** Nothing can be typed or sent yet (the scene hasn't begun). */
  disabled?: boolean
  /** The Text Model is at work: Cancel replaces Send. */
  busy?: boolean
  /** It's at work for another tab, which can't be cancelled from here. */
  detached?: boolean
  cancelling?: boolean
  /** The Text Model writes into the story or the box now: the border sweeps. */
  working?: boolean
}>()
const emit = defineEmits<{ send: []; cancel: [] }>()
const draft = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex w-full flex-col gap-1.5" data-floating-box>
    <slot name="notice" />
    <div
      class="flex items-end gap-1 rounded-2xl border border-line bg-surface/90 p-1.5 float-box backdrop-blur-md"
      :class="{ 'render-sweep': working && !cancelling }"
      :data-working="working ? '' : undefined"
    >
      <ComposeBox
        v-model="draft"
        floating
        :placeholder="placeholder"
        :disabled="disabled || busy"
        @send="emit('send')"
      />
      <div class="flex shrink-0 items-center gap-0.5 text-sm text-muted">
        <slot />
        <button
          v-if="!busy"
          type="button"
          class="ml-1 rounded-lg bg-fg px-3.5 py-1.5 font-medium text-canvas disabled:opacity-50"
          :disabled="disabled || !draft.trim()"
          data-send
          @click="emit('send')"
        >
          Send
        </button>
        <button
          v-else-if="!detached"
          type="button"
          class="ml-1 rounded-lg border border-danger px-3.5 py-1.5 font-medium text-danger disabled:opacity-50"
          :disabled="cancelling"
          data-cancel
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
