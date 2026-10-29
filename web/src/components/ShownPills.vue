<script setup lang="ts">
/**
 * Who a Frame shows, as pills, the same on every kind's screen: given `editable`, every one of
 * `names` is a button that toggles whether it's shown (a Storyboard's); otherwise only those shown
 * are listed (a Roleplay's, chosen by the Art Agent). More, after them, in the slot.
 */
defineProps<{
  /** Everyone who could be shown, in order. */
  names: readonly string[]
  shown: readonly string[]
  editable?: boolean
  disabled?: boolean
}>()
defineEmits<{ toggle: [name: string] }>()

const pill = 'rounded-full border border-line px-2 py-0.5'
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs" data-shown>
    <span class="text-muted">Shows</span>
    <template v-if="editable">
      <button
        v-for="name in names"
        :key="name"
        type="button"
        :class="[pill, 'text-muted aria-pressed:bg-surface aria-pressed:text-fg disabled:opacity-50']"
        :aria-pressed="shown.includes(name)"
        :disabled="disabled"
        @click="$emit('toggle', name)"
      >
        {{ name }}
      </button>
    </template>
    <template v-else>
      <span
        v-for="name in names.filter((n) => shown.includes(n))"
        :key="name"
        :class="[pill, 'bg-surface text-fg']"
        data-shown-name
      >
        {{ name }}
      </span>
    </template>
    <span v-if="!shown.length" class="text-muted">· the place alone</span>
    <slot />
  </div>
</template>
