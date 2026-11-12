<script setup lang="ts" generic="S extends { id: string; settings: SessionSettings; frames: readonly PicturedFrame[] }">
import type { PicturedFrame, SessionSettings } from '../api'
import { useFeatures } from '../composables/useFeatures'
import { useImageModels } from '../composables/useSettingsOptions'
import Icon from './Icon.vue'
import ImageModelPicker from './ImageModelPicker.vue'
import PopMenu from './PopMenu.vue'
import TextModelPicker from './TextModelPicker.vue'

/**
 * A Session's models and switches, behind one button in its bar that names its Image Model (the
 * one that matters to see; the owner, 2026-11-12): the Text Model, the Image Model and its steps,
 * then the kind's own switches (the default slot).
 */
defineProps<{ session: S; title: string }>()
const emit = defineEmits<{ switched: [session: S]; failed: [message: string] }>()
const { on: featureOn } = useFeatures()
const { labelOf } = useImageModels()
</script>

<template>
  <PopMenu align="end" panel-class="w-[26rem] p-4 text-sm" data-session-settings>
    <template #button="{ open, toggle }">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface hover:text-fg"
        :class="{ 'bg-surface text-fg': open }"
        :title="`${title}'s models and switches`"
        data-session-settings-button
        @click="toggle"
      >
        <Icon name="sliders" />
        <span v-if="featureOn('images')" class="max-w-40 truncate max-md:hidden">{{ labelOf(session.settings.imageModel) }}</span>
      </button>
    </template>
    <div class="flex flex-col gap-3">
      <h2 class="font-semibold">{{ title }}</h2>
      <TextModelPicker
        class="justify-between"
        :session="session"
        @switched="(s) => emit('switched', s as S)"
        @failed="(m) => emit('failed', m)"
      />
      <ImageModelPicker
        v-if="featureOn('images')"
        class="flex-wrap justify-between"
        :session="session"
        @switched="(s) => emit('switched', s)"
        @failed="(m) => emit('failed', m)"
      />
      <div v-if="$slots.default" class="flex flex-col gap-3 border-t border-line pt-3">
        <slot />
      </div>
    </div>
  </PopMenu>
</template>
