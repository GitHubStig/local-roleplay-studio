<script setup lang="ts" generic="F extends PicturedFrame">
import { onKeyStroke } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { asPicked, hasVersion, homeImage, type PicturedFrame, setThumbnail, shownPicture } from '../api'
import { useCloseOnLeave } from '../composables/useCloseOnLeave'
import type { StripTile } from './FrameStrip.vue'
import Icon from './Icon.vue'
import ModelComparison from './ModelComparison.vue'

/**
 * Every Frame of a Session at once, opened from the end of its strip, in every kind of Session, in
 * three modes: All Frames, a contact sheet of the strip's tiles with a search across what the
 * Frames say (`text`), the matches marked and the rest faded, a click picking one; Compare, its
 * pictures by each Image Model side by side (`ModelComparison`); and Scores, how varied each
 * model's art style is. Compare shows once there's a picture, Scores once two models have made
 * some. Over the Session's own area, the rail beside it, closed by its ✕ or Esc.
 */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly F[]
    /** The strip's tiles, a tile per Frame. */
    tiles: readonly StripTile[]
    /** What a Frame says, searched: a Message and its Reply, an Action and its Narration, a Beat. */
    text: (frame: F) => string
    /** The Frame picked on the screen, ringed. */
    picked: number | null
    imageModel: string
    thumbnail?: string
    name?: (index: number) => string
    caption?: (frame: F) => string | undefined
    oneStyle?: boolean
  }>(),
  { thumbnail: undefined, name: undefined, caption: undefined },
)
const emit = defineEmits<{ pick: [index: number]; changed: [] }>()
const open = defineModel<boolean>('open', { required: true })

/** Compare's columns as arranged, kept while the Session is open. */
const order = ref<number[]>()

type Mode = 'frames' | 'compare' | 'scores'
const mode = ref<Mode>('frames')
const modelCount = computed(() =>
  new Set(props.frames.flatMap((f) => f.pictures.map((p) => p.imageModel))).size
)
const modes = computed(() => [
  { id: 'frames' as const, label: 'All Frames' },
  ...(modelCount.value ? [{ id: 'compare' as const, label: 'Compare' }] : []),
  ...(modelCount.value > 1 ? [{ id: 'scores' as const, label: 'Scores' }] : []),
])

const STARS = {
  chosen: "This Session's thumbnail on Home, as you chose it: click to stop using it",
  automatic: "This Session's thumbnail on Home for now, as its newest picture: click to keep it",
  none: "Use it as this Session's thumbnail on Home",
}
/**
 * Home's thumbnail, starred on a Frame's picture by the Session's Image Model, as Compare's stars:
 * on the one Home shows, and on hover to choose another; on the one chosen, back to the newest.
 */
const home = computed(() => homeImage(props.frames, props.imageModel, props.thumbnail))
function starOf(index: number) {
  const frame = props.frames.find((f) => f.index === index)
  const picture = frame && shownPicture(frame, props.imageModel)
  if (!picture) return null
  const shown = !!home.value && hasVersion(picture, home.value)
  const star: keyof typeof STARS | undefined = shown
    ? (home.value === props.thumbnail ? 'chosen' : 'automatic')
    : undefined
  return { picture, star }
}
const thumbnailError = ref('')
async function star(index: number) {
  const s = starOf(index)
  if (!s) return
  thumbnailError.value = ''
  try {
    // The version shown, as Compare's star stars it.
    await setThumbnail(props.sessionId, s.star === 'chosen' ? null : asPicked(s.picture).image)
    emit('changed')
  } catch (err) {
    thumbnailError.value = (err as Error).message
  }
}

const query = ref('')
/** The Frames whose words hold every word searched for, by index; all of them with no search. */
const matches = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  return new Set(
    props.frames.filter((f) => {
      const text = props.text(f).toLowerCase()
      return words.every((w) => text.includes(w))
    }).map((f) => f.index),
  )
})

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const sheet = useTemplateRef<HTMLElement>('sheet')
useCloseOnLeave(dialog)
function follow(now: boolean) {
  if (now) {
    mode.value = 'frames'
    // Not modal: over the Session's own area, the rail beside it still to hand.
    dialog.value?.show()
    // At the Frame picked on the screen, which a long Session would otherwise scroll past.
    const tile = sheet.value?.querySelector<HTMLElement>('[aria-current="true"]')
    if (tile && sheet.value) sheet.value.scrollTop = tile.offsetTop - sheet.value.clientHeight / 2
  } else if (dialog.value?.open) dialog.value.close()
}
watch(open, follow, { flush: 'post' })
onKeyStroke('Escape', (e) => {
  if (!open.value || e.defaultPrevented) return
  // A menu or a dialog open over it (Export, Delete) closes first.
  if (document.querySelector('[data-pop-panel], dialog[open]:not([data-all-frames]):not([data-settings-overlay])')) return
  open.value = false
})
onMounted(() => open.value && follow(true))

function pick(index: number) {
  emit('pick', index)
  open.value = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="fixed inset-0 z-30 m-0 h-auto max-h-none w-auto max-w-none overflow-hidden bg-canvas p-0 text-fg max-sm:bottom-14 sm:left-12 short:left-12 short:bottom-0"
    aria-label="All Frames"
    data-all-frames
    @close="open = false"
  >
    <div v-if="open" class="flex h-full flex-col">
      <header class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2 text-sm">
        <div class="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Show">
          <button
            v-for="m in modes"
            :key="m.id"
            type="button"
            role="tab"
            class="rounded-md px-2.5 py-1"
            :class="mode === m.id ? 'bg-surface font-medium text-fg shadow-sm' : 'text-muted hover:text-fg'"
            :aria-selected="mode === m.id"
            :data-mode="m.id"
            @click="mode = m.id"
          >
            {{ m.label }}
          </button>
        </div>
        <span v-if="mode === 'frames'" class="text-muted" data-frame-count>
          {{ matches ? `${matches.size} of ${frames.length}` : frames.length }}
          {{ frames.length === 1 ? 'Frame' : 'Frames' }}
        </span>
        <label
          v-if="mode === 'frames'"
          class="ml-auto flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 sm:w-64"
        >
          <Icon name="search" class="text-muted" />
          <input
            v-model="query"
            type="search"
            class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
            placeholder="Search the Frames"
            aria-label="Search the Frames"
            data-search
          />
        </label>
        <button
          type="button"
          class="rounded-md p-1.5 text-muted hover:text-fg max-sm:absolute max-sm:top-2 max-sm:right-2"
          :class="{ 'ml-auto': mode !== 'frames' }"
          title="Close (Esc)"
          aria-label="Close"
          data-close-all-frames
          @click="open = false"
        >
          <Icon name="x" />
        </button>
      </header>

      <!-- Every Frame as a tile, with its number and first words. -->
      <ol
        v-if="mode === 'frames'"
        ref="sheet"
        class="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start gap-x-3 gap-y-4 overflow-y-auto p-4 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
        data-sheet
      >
        <li v-if="thumbnailError" class="col-span-full text-sm text-danger" role="alert">{{ thumbnailError }}</li>
        <li v-for="tile in tiles" :key="tile.index" class="group/tile relative">
          <button
            type="button"
            class="flex w-full flex-col gap-1 text-left transition-opacity"
            :class="{ 'opacity-35': matches && !matches.has(tile.index) }"
            :aria-current="tile.index === picked"
            :data-match="matches?.has(tile.index) || undefined"
            :data-sheet-tile="tile.index"
            @click="pick(tile.index)"
          >
            <span
              class="relative block aspect-[3/2] w-full overflow-hidden rounded-md"
              :class="[
                tile.thumb ? '' : 'border border-dashed border-line bg-surface',
                tile.index === picked || matches?.has(tile.index) ? 'ring-2 ring-fg ring-offset-2 ring-offset-canvas' : '',
                { 'render-sweep': tile.working },
              ]"
              :data-rendering="tile.working === 'queued' ? 'queued' : undefined"
            >
              <img
                v-if="tile.thumb"
                :src="tile.thumb"
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
                :class="{ 'opacity-50': tile.dimmed }"
              />
              <span v-else class="line-clamp-4 p-2 text-xs text-fg">{{ tile.words }}</span>
            </span>
            <span class="line-clamp-1 text-xs" :class="matches?.has(tile.index) ? 'text-fg' : 'text-muted'">
              {{ tile.index + 1 }} · {{ tile.words }}
            </span>
          </button>
          <button
            v-if="tile.thumb && starOf(tile.index)"
            type="button"
            class="absolute top-1.5 right-1.5 flex rounded bg-canvas/85 p-1"
            :class="[
              starOf(tile.index)!.star === 'chosen' ? 'text-warn' : 'text-muted hover:text-fg',
              starOf(tile.index)!.star ? '' : 'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 touch:opacity-100',
            ]"
            :title="STARS[starOf(tile.index)!.star ?? 'none']"
            :aria-label="STARS[starOf(tile.index)!.star ?? 'none']"
            :data-thumbnail="starOf(tile.index)!.star"
            data-sheet-star
            @click="star(tile.index)"
          >
            <Icon :name="starOf(tile.index)!.star === 'chosen' ? 'star-filled' : 'star'" />
          </button>
        </li>
        <li v-if="matches && !matches.size" class="col-span-full text-muted" data-no-match>
          No Frame says "{{ query }}".
        </li>
      </ol>

      <div v-else class="min-h-0 flex-1">
        <ModelComparison
          v-model:order="order"
          :session-id="sessionId"
          :frames="frames"
          :image-model="imageModel"
          :thumbnail="thumbnail"
          :name="name"
          :caption="caption"
          :one-style="oneStyle"
          :scores="mode === 'scores'"
          @changed="emit('changed')"
        />
      </div>
    </div>
  </dialog>
</template>
