<script setup lang="ts">
import { onClickOutside, onKeyStroke, useClipboard } from '@vueuse/core'
import { computed, nextTick, onDeactivated, ref, useTemplateRef, watch } from 'vue'
import { asPicked, hasVersion, homeImage, imageUrl, shownPicture } from '../api'
import type { PictureMenu } from '../composables/usePictureMenu'
import { STAR_ACTIONS, starOf, toggleThumbnail } from '../thumbnail'
import Icon from './Icon.vue'
import PictureButtons from './PictureButtons.vue'

/**
 * A picture's menu, at the pointer where it was right-clicked (or long-pressed), in every kind of
 * Session (`usePictureMenu`): on the picture its Frame shows, Re-render, Upscale and Edit, as its
 * toolbar has them, and Look closer; on any picture, opening it full size in a new tab, copying the
 * Frame's Image Prompt, and making it Home's thumbnail (or no longer). Closed by Esc, a click
 * outside, or doing what it offers. On a phone it opens as a sheet from the bottom, as `PopMenu`.
 */
const props = defineProps<{ menu: PictureMenu }>()
const session = props.menu.session
const target = props.menu.target

const frame = computed(() => target.value && session.value?.frames.find((f) => f.index === target.value!.index))
/** The picture the menu is on, as the version it was opened on. */
const picture = computed(() => {
  const image = target.value?.image
  const p = image && frame.value?.pictures.find((p) => hasVersion(p, image))
  return p ? asPicked(p) : undefined
})
/** It's the picture the Frame shows, which its jobs and the viewer act on. */
const shown = computed(() => {
  const s = frame.value && shownPicture(frame.value, session.value!.imageModel)
  return s && s.image === picture.value?.image ? s : undefined
})
const star = computed(() => {
  const s = session.value
  if (!s || !picture.value) return undefined
  return starOf(picture.value, homeImage(s.frames, s.imageModel, s.thumbnail), s.thumbnail)
})
const full = computed(() =>
  session.value && picture.value && imageUrl(session.value.sessionId, picture.value.upscaled ?? picture.value.image)
)

const panel = useTemplateRef<HTMLElement>('panel')
const close = () => {
  props.menu.close()
  problem.value = ''
}
onClickOutside(panel, close)
onKeyStroke('Escape', (e) => {
  if (!target.value) return
  // So the All Frames view under it stays open.
  e.preventDefault()
  close()
})
onDeactivated(close)
// It goes when its picture does (a Frame deleted, a model's pictures).
watch(picture, (p) => !p && target.value && close())

/** Where it sits: at the pointer, moved back on screen where it would run off an edge. */
const place = ref({ left: 0, top: 0 })
watch(() => target.value?.at, async (at) => {
  if (!at) return
  place.value = { left: at.x, top: at.y }
  await nextTick()
  const box = panel.value?.getBoundingClientRect()
  if (!box) return
  place.value = {
    left: Math.max(8, Math.min(at.x, innerWidth - box.width - 8)),
    top: at.y + box.height + 8 > innerHeight ? Math.max(8, at.y - box.height) : at.y,
  }
})

const problem = ref('')
const { copy } = useClipboard({ legacy: true })
async function copyPrompt() {
  await copy(frame.value?.prompt ?? '')
  close()
}
async function chooseThumbnail() {
  const s = session.value
  if (!s || !picture.value) return
  try {
    await toggleThumbnail(s.sessionId, picture.value.image, star.value)
    s.changed()
    close()
  } catch (err) {
    problem.value = (err as Error).message
  }
}
function act(then: () => void) {
  then()
  close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="target && session && picture"
      ref="panel"
      class="fixed z-50 flex w-64 flex-col rounded-xl border border-line bg-surface p-1 text-sm text-fg shadow-lg max-sm:inset-x-0 max-sm:top-auto! max-sm:bottom-0 max-sm:left-0! max-sm:w-auto max-sm:rounded-b-none max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      :style="{ left: `${place.left}px`, top: `${place.top}px` }"
      role="menu"
      data-pop-panel
      data-picture-menu
      @contextmenu.prevent
    >
      <template v-if="shown">
        <PictureButtons
          part="picture"
          toolbar
          button-class="menu-row"
          :picture="shown"
          :has-job="(kind) => session!.hasJob(target!.index, kind)"
          :can-render="session.canRender(target.index)"
          :busy="session.busy"
          @queue="(kind) => act(() => session!.queue(kind, target!.index))"
          @edit="act(() => session!.edit(target!.index))"
        />
        <button type="button" class="menu-row" data-menu-look @click="act(() => session!.look(target!.index))">
          <Icon name="expand" />Look closer
        </button>
        <hr class="my-1 border-line" />
      </template>
      <a :href="full!" target="_blank" rel="noopener" class="menu-row" data-menu-full-size @click="close">
        <Icon name="external" />Open full size in a new tab
      </a>
      <button v-if="frame?.prompt" type="button" class="menu-row" data-menu-copy-prompt @click="copyPrompt">
        <Icon name="prompt" />Copy the Image Prompt
      </button>
      <button
        type="button"
        class="menu-row"
        :data-thumbnail="star"
        data-menu-thumbnail
        @click="chooseThumbnail"
      >
        <Icon :name="star === 'chosen' ? 'star-filled' : 'star'" :class="{ 'text-warn': star === 'chosen' }" />
        {{ STAR_ACTIONS[star ?? 'none'] }}
      </button>
      <p v-if="problem" class="px-3 py-1 text-xs text-danger" role="alert">{{ problem }}</p>
    </div>
  </Teleport>
</template>
