<script setup lang="ts" generic="T extends string">
import { onKeyStroke } from '@vueuse/core'
import Icon from './Icon.vue'

/**
 * The drawer beside a Session's story, in every kind of Session, in place of the old Frame panel:
 * closed until asked for (the picture's Prompt, Look & Cast or Music in the Session's bar), and
 * remembered by the caller. Its tabs switch between what it holds; the ✕, Esc or the same button
 * again close it. On a desktop it sits beside the story and takes its room; below `lg` it slides
 * up as a sheet from the bottom, the picture still in view above it. Each tab's content is the
 * slot of its id; all stay in the page while it's closed.
 */
defineProps<{ tabs: readonly { id: T; label: string }[] }>()
const tab = defineModel<T | null>({ required: true })
onKeyStroke('Escape', (e) => {
  if (tab.value === null || e.defaultPrevented) return
  // A menu or dialog open over it closes first.
  if (document.querySelector('[data-pop-panel], dialog[open]')) return
  tab.value = null
})
</script>

<template>
  <!-- Hidden rather than taken out, so what's being edited in it stays as it was. -->
  <aside
    v-show="tab !== null"
    class="z-30 flex flex-col border-line bg-canvas max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[70dvh] max-lg:rounded-t-xl max-lg:border-t max-lg:shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.4)] lg:w-[26rem] lg:shrink-0 lg:border-l"
    data-drawer
    :data-drawer-tab="tab"
  >
    <div class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 text-sm whitespace-nowrap" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="-mb-px shrink-0 border-b-2 px-2.5 py-2"
        :class="t.id === tab ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg'"
        :aria-selected="t.id === tab"
        :data-drawer-button="t.id"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
      <button
        type="button"
        class="sticky right-0 ml-auto shrink-0 rounded-md bg-canvas p-1.5 text-muted hover:text-fg"
        title="Close (Esc)"
        aria-label="Close"
        data-drawer-close
        @click="tab = null"
      >
        <Icon name="x" />
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <template v-for="t in tabs" :key="t.id">
        <div v-show="t.id === tab" :data-drawer-panel="t.id"><slot :name="t.id" /></div>
      </template>
    </div>
  </aside>
</template>
