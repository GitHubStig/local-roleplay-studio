<script setup lang="ts">
import { computed } from 'vue'
import { pickedEdit, type Picture } from '../api'

/**
 * "Edited" on a picture that shows one of its edits (ADR 0021) rather than its render, with what
 * it was told on hover; its versions are in the viewer.
 */
const props = defineProps<{ picture?: Picture }>()
const edit = computed(() => props.picture && pickedEdit(props.picture))
</script>

<template>
  <span
    v-if="edit"
    class="rounded-full bg-black/70 px-2.5 py-0.5 text-sm text-white"
    :title="`Edit ${picture!.picked}: ${edit.instructions.join('; ')}`"
    data-edited
  >
    Edited
  </span>
</template>
