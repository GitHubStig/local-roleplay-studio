<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { agree, asking, decline, question } from '../ask'

/**
 * The question `ask()` puts, over everything, a viewer too. Escape, a click on the backdrop and
 * leaving the page (the browser's Back stays live behind it) all decline. A viewer that closes on
 * a click outside it has to ignore `[data-confirm-dialog]`.
 */
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(asking, (now) => {
  if (now) dialog.value?.showModal()
  else if (dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

const route = useRoute()
watch(() => route.fullPath, () => {
  if (asking.value) decline()
})

function closed() {
  if (asking.value) decline()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-md rounded-lg border border-line bg-surface text-fg backdrop:bg-black/60"
    aria-labelledby="confirm-dialog-message"
    data-confirm-dialog
    @close="closed"
    @click.self="decline()"
  >
    <form v-if="question" class="flex flex-col gap-4 p-6" @submit.prevent="agree()">
      <p id="confirm-dialog-message" data-confirm-message>{{ question.message }}</p>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-line px-4 py-2"
          data-confirm-cancel
          @click="decline()"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg px-4 py-2 font-medium text-canvas"
          :class="question.danger ? 'bg-danger' : 'bg-fg'"
          :autofocus="!question.danger"
          data-confirm-action
        >
          {{ question.action }}
        </button>
      </div>
    </form>
  </dialog>
</template>
