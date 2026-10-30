<script setup lang="ts" generic="Id extends string">
import Icon from './Icon.vue'

/** A row of tabs over a panel; the one picked is `v-model`. A `busy` tab shows a spinner, as work is going on. */
defineProps<{ tabs: readonly { id: Id; label: string; busy?: boolean }[] }>()
const picked = defineModel<Id>({ required: true })
</script>

<template>
  <div role="tablist" class="flex shrink-0 border-b border-line text-sm">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="flex-1 px-4 py-2 text-muted aria-selected:border-b-2 aria-selected:border-fg aria-selected:font-medium aria-selected:text-fg"
      :aria-selected="picked === tab.id"
      :data-tab="tab.id"
      @click="picked = tab.id"
    >
      {{ tab.label }}
      <Icon
        v-if="tab.busy"
        name="spinner"
        class="ml-1.5 animate-spin align-[-0.125em] text-info"
        title="Working"
        data-tab-busy
      />
    </button>
  </div>
</template>
