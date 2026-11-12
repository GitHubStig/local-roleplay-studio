<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import Icon from './Icon.vue'

/** One Frame's tile: its picture small, or its words where it has none. */
export interface StripTile {
  index: number
  /** The picture's address, if it has one. */
  thumb?: string | null
  /** What the Frame says (the Message, the Beat), shown where it has no picture. */
  words?: string
  /** Work on it: running, or waiting its turn. */
  working?: 'running' | 'queued' | null
  /** The picture is out of date (changed since it was rendered). */
  dimmed?: boolean
  /** How many clips its picture has. */
  clips?: number
}

/**
 * A Session's Frames as a strip of tiles under its bar, in every kind of Session: the strip is the
 * Frames list. The picked tile is ringed and kept in view; clicking a tile picks it. A short window
 * folds the tiles to a thin line of numbers, and a phone on its side hides the strip. ← and → pick
 * the tile before or after, the focus going with it, so holding a key runs through them. What follows
 * the tiles (a Frame being written) is the `end` slot's.
 */
const props = defineProps<{ tiles: readonly StripTile[]; picked: number | null }>()
const emit = defineEmits<{ pick: [index: number] }>()
const strip = useTemplateRef<HTMLElement>('strip')

async function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const at = props.tiles.findIndex((t) => t.index === props.picked)
  const next = props.tiles[at + (e.key === 'ArrowLeft' ? -1 : 1)]
  if (!next) return
  emit('pick', next.index)
  await nextTick()
  strip.value?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
}

// The first time straight there, so the strip doesn't glide past (and load) every tile on the way;
// then gliding, as the pick moves.
let placed = false
watch(() => [props.picked, props.tiles.length], async () => {
  await nextTick()
  const tile = strip.value?.querySelector('[aria-current="true"]')
  if (!tile) return
  tile.scrollIntoView({ behavior: placed ? 'smooth' : 'instant', block: 'nearest', inline: 'nearest' })
  placed = true
}, { immediate: true })
</script>

<template>
  <nav
    ref="strip"
    class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line px-4 py-2 [scrollbar-width:thin] short:hidden"
    aria-label="Frames"
    data-strip
    @keydown="onKey"
  >
    <button
      v-for="tile in tiles"
      :key="tile.index"
      type="button"
      class="relative h-12 w-20 shrink-0 overflow-hidden rounded text-left [@media(max-height:640px)]:h-6 [@media(max-height:640px)]:w-9"
      :class="[
        tile.index === picked ? 'ring-2 ring-fg ring-offset-1 ring-offset-canvas' : 'hover:ring-1 hover:ring-muted',
        tile.thumb ? '' : 'border border-dashed border-line bg-surface',
        { 'render-sweep': tile.working },
      ]"
      :data-rendering="tile.working === 'queued' ? 'queued' : undefined"
      :aria-current="tile.index === picked"
      :title="tile.words"
      :data-tile="tile.index"
      @click="emit('pick', tile.index)"
    >
      <img
        v-if="tile.thumb"
        :src="tile.thumb"
        alt=""
        class="h-full w-full object-cover [@media(max-height:640px)]:hidden"
        :class="{ 'opacity-50': tile.dimmed }"
        loading="lazy"
      />
      <span
        v-else
        class="line-clamp-2 p-1 text-[0.6rem] leading-tight text-fg [@media(max-height:640px)]:hidden"
      >{{ tile.words }}</span>
      <span
        class="absolute bottom-0 left-1 text-[0.6rem] tabular-nums [@media(max-height:640px)]:inset-0 [@media(max-height:640px)]:grid [@media(max-height:640px)]:place-items-center [@media(max-height:640px)]:text-muted"
        :class="tile.thumb ? 'text-white [text-shadow:0_0_3px_black]' : 'text-muted'"
      >{{ tile.index + 1 }}</span>
      <span
        v-if="tile.clips"
        class="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded bg-black/70 px-0.5 text-[0.55rem] leading-3 text-white [@media(max-height:640px)]:hidden"
        :title="tile.clips === 1 ? '1 clip' : `${tile.clips} clips`"
      ><Icon name="play" />{{ tile.clips }}</span>
    </button>
    <slot name="end" />
  </nav>
</template>
