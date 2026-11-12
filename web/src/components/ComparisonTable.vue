<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import type { Comparison, ComparisonPicture } from '../comparison'
import { useDragReorder } from '../composables/useDragReorder'
import { usePageKeys } from '../composables/usePageKeys'
import Icon from './Icon.vue'
import ImageViewer from './ImageViewer.vue'

/**
 * Pictures side by side, a row per Frame headed by its name and Image Prompt and a column per Image
 * Model: the All Frames view's Compare mode, and the whole of its exported page. Above it, with
 * `hideable`, the models as chips in one row, each on or off: off, its column leaves the table.
 * The arrangement is `order` and `hidden`, which the app keeps (and exports by); on the exported
 * page it lasts until the page is reloaded. A picture opens in the viewer, where ← and → (or a
 * swipe sideways) step through that Frame's pictures by the other models, and ↑ and ↓ (or a swipe
 * up or down) through the Frames that model rendered, each Frame's caption under its picture. A
 * column moves by dragging its header's grip (or with ← and → on it). A prompt shows its first
 * three lines, with Show all. With `starrable`, each picture has a star to make it what Home shows
 * (`choose`), filled on the one chosen. At phone width the rows become pages: one Frame at a time,
 * its models down the screen. The `actions` slot ends the chips' row; a `hidden` slot follows each
 * model that's off (given its index into `models`).
 */
const props = defineProps<Comparison & {
  hideable?: boolean
  /** Each picture has a star, to make it Home's thumbnail. */
  starrable?: boolean
}>()
defineEmits<{ choose: [picture: ComparisonPicture] }>()

/** What a picture's star says. */
const STARS = {
  chosen: "This Session's thumbnail on Home, as you chose it: click to stop using it",
  automatic: "This Session's thumbnail on Home for now, as its newest picture: click to keep it",
  none: "Use it as this Session's thumbnail on Home",
}

/**
 * The models' columns as arranged: indexes into `models`, the hidden ones last; a model rendering
 * since is added after the shown ones.
 */
const order = defineModel<number[]>('order')
/** The hidden columns, as indexes into `models`. */
const hidden = defineModel<number[]>('hidden', { default: () => [] })
watch(() => props.models.length, (n) => {
  const kept = (order.value ?? []).filter((i) => i < n)
  const added = [...Array(n).keys()].filter((i) => !kept.includes(i))
  const shown = kept.filter((i) => !hidden.value.includes(i))
  order.value = [...shown, ...added, ...kept.filter((i) => hidden.value.includes(i))]
  if (hidden.value.some((i) => i >= n)) hidden.value = hidden.value.filter((i) => i < n)
}, { immediate: true })
/** The shown columns, in order; everything below works on these alone. */
const shownOrder = computed(() => (order.value ?? []).filter((i) => !hidden.value.includes(i)))
const models = computed(() => shownOrder.value.map((i) => props.models[i]))
const rows = computed(() =>
  props.rows.map((row) => ({ ...row, pictures: shownOrder.value.map((i) => row.pictures[i]) }))
)
/** What a picture's tooltip says: that it's an edit, and of what; or that it's out of date. */
function pictureTitle(picture: ComparisonPicture): string | undefined {
  const notes = [
    picture.edited && `Edited: ${picture.edited.join('; ')}`,
    picture.stale && 'Its Image Prompt changed since it was rendered',
  ].filter(Boolean)
  return notes.length ? notes.join('. ') : undefined
}

/** Every model as a chip, those on first in the columns' order, each with whether it's on. */
const chips = computed(() =>
  [...shownOrder.value, ...(order.value ?? []).filter((i) => hidden.value.includes(i))]
    .map((i) => ({ index: i, on: !hidden.value.includes(i), ...props.models[i] }))
)

/** Hides a shown column (at `column`, as shown): it moves to the right end. */
function hide(column: number) {
  const i = shownOrder.value[column]
  order.value = [...order.value!.filter((o) => o !== i), i]
  hidden.value = [...hidden.value, i]
}
/** Shows a hidden column again, after the shown ones. */
function show(i: number) {
  const shown = shownOrder.value
  order.value = [...shown, i, ...order.value!.filter((o) => o !== i && !shown.includes(o))]
  hidden.value = hidden.value.filter((h) => h !== i)
}

/** Moves the column at `from` to `to`, both positions as shown. */
function moveColumn(from: number, to: number) {
  const shown = shownOrder.value
  if (to < 0 || to >= shown.length || to === from) return
  const next = [...shown]
  next.splice(to, 0, next.splice(from, 1)[0])
  order.value = [...next, ...order.value!.filter((i) => hidden.value.includes(i))]
}

/** Dragging a column by its grip: it follows the pointer across the other headers. */
const scroller = useTemplateRef<HTMLElement>('scroller')
const { dragging, grip } = useDragReorder({
  scroller,
  items: '[data-model-column]',
  axis: 'x',
  move: moveColumn,
})

/**
 * Whether the first column shows the prompts or only the Frames' names: shown on a wide screen,
 * folded away on a phone's, upright or on its side (where they'd crowd out the pictures), either
 * way until toggled.
 */
const narrow = useMediaQuery('(max-width: 1023px)')
const promptsShown = ref(!narrow.value)
watch(narrow, (now) => (promptsShown.value = !now))
/** The rows whose prompt shows in full, not its first three lines. */
const opened = ref(new Set<number>())
function toggleOpened(r: number) {
  const next = new Set(opened.value)
  if (!next.delete(r)) next.add(r)
  opened.value = next
}

/** At phone width, one Frame at a time: which. */
const paged = useMediaQuery('(max-width: 639px)')
const page = ref(0)
watch(() => rows.value.length, (n) => (page.value = Math.min(page.value, Math.max(0, n - 1))))
const anyPrompt = computed(() => props.rows.some((r) => r.prompt))
/** With any caption, every picture keeps room for one in the viewer, so none jumps in size. */
const anyCaption = computed(() => props.rows.some((r) => r.caption))

/** The picture open in the viewer: its Frame's row, and its model's column. */
const viewing = ref<{ row: number; column: number } | null>(null)
const viewed = computed(() => {
  const v = viewing.value
  const row = v && rows.value[v.row]
  const picture = v && row?.pictures[v.column]
  if (!v || !row || !picture) return null
  const model = models.value[v.column].label
  return {
    src: picture.full,
    alt: `${row.name} by ${model}`,
    label: `${row.name} · ${model}`,
    caption: anyCaption.value ? row.caption ?? '' : undefined,
  }
})
/** The column of the nearest picture `by` columns along in the open row, if any. */
function along(by: number): number | null {
  const v = viewing.value
  if (!v) return null
  const pictures = rows.value[v.row].pictures
  for (let c = v.column + by; c >= 0 && c < pictures.length; c += by) {
    if (pictures[c]) return c
  }
  return null
}
function step(by: number) {
  const column = along(by)
  if (column !== null) viewing.value = { ...viewing.value!, column }
}
/** The row of the nearest Frame `by` rows along with a picture by the open model, if any. */
function across(by: number): number | null {
  const v = viewing.value
  if (!v) return null
  for (let r = v.row + by; r >= 0 && r < rows.value.length; r += by) {
    if (rows.value[r].pictures[v.column]) return r
  }
  return null
}
function climb(by: number) {
  const row = across(by)
  if (row !== null) viewing.value = { ...viewing.value!, row }
}

/** Page Up and Down scroll the table, or what shows instead, though the focus is in the header. */
const instead = useTemplateRef<HTMLElement>('instead')
usePageKeys(() => instead.value ?? scroller.value, () => viewing.value !== null)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- The models, each on or off, and what the screen adds at the end (Export). -->
    <div
      v-if="hideable || $slots.actions"
      class="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 text-sm"
      data-model-chips
    >
      <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        <template v-if="hideable">
          <span v-for="m in chips" :key="m.label" class="group/chip flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="flex items-center gap-1 rounded-full border px-2.5 py-0.5 whitespace-nowrap"
              :class="m.on ? 'border-fg bg-surface text-fg' : 'border-dashed border-line text-muted hover:text-fg'"
              :aria-pressed="m.on"
              :title="m.on ? `Hide ${m.label}${$slots.hidden ? ', and leave it out of Export' : ''}` : `Show ${m.label}`"
              data-show-model
              @click="m.on ? hide(shownOrder.indexOf(m.index)) : show(m.index)"
            >
              <span v-if="m.on" aria-hidden="true">✓</span>{{ m.label }}<span v-if="m.current" class="text-muted">· this Session's</span>
            </button>
            <!-- What can be done to a model that's off: shown while the pointer is over it. -->
            <span
              v-if="!m.on && $slots.hidden"
              class="hidden group-hover/chip:inline focus-within:inline touch:inline"
            ><slot name="hidden" :index="m.index" /></span>
          </span>
        </template>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-3"><slot name="actions" /></div>
    </div>
    <div v-if="$slots.instead" ref="instead" class="min-h-0 flex-1 overflow-auto">
      <slot name="instead" />
    </div>
    <!-- At phone width: one Frame at a time, its models down the screen. -->
    <div v-else-if="paged" class="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm" data-compare-pages>
      <template v-if="rows[page]">
        <div class="flex items-center gap-2">
          <h3 class="min-w-0 flex-1 truncate font-medium" data-page-name>{{ rows[page].name }}</h3>
          <span class="shrink-0 text-xs text-muted tabular-nums">{{ page + 1 }} of {{ rows.length }}</span>
          <button type="button" class="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40" :disabled="page === 0" aria-label="The Frame before" data-page-previous @click="page--">
            <Icon name="chevron-left" />
          </button>
          <button type="button" class="rounded-md p-1.5 text-muted hover:text-fg disabled:opacity-40" :disabled="page === rows.length - 1" aria-label="The Frame after" data-page-next @click="page++">
            <Icon name="chevron-right" />
          </button>
        </div>
        <p v-if="rows[page].prompt" class="mt-1 line-clamp-2 text-xs text-muted">{{ rows[page].prompt }}</p>
        <div class="mt-3 flex flex-col gap-3">
          <figure v-for="(picture, c) in rows[page].pictures" :key="models[c].label" data-page-picture>
            <figcaption class="mb-1 text-xs text-muted">
              {{ models[c].label }}<template v-if="models[c].current"> · this Session's</template>
            </figcaption>
            <button
              v-if="picture"
              type="button"
              class="relative block w-full"
              :title="pictureTitle(picture)"
              @click="viewing = { row: page, column: c }"
            >
              <img :src="picture.thumb" :alt="`${rows[page].name} by ${models[c].label}`" class="w-full rounded" :class="{ 'opacity-50': picture.stale }" />
            </button>
            <div v-else class="flex h-24 items-center justify-center rounded border border-dashed border-line text-muted">
              Not rendered
            </div>
          </figure>
        </div>
      </template>
    </div>
    <div v-else ref="scroller" class="min-h-0 flex-1 overflow-auto">
      <table class="border-separate border-spacing-2 text-sm">
        <thead>
          <tr>
            <th class="sticky left-0 top-0 z-20 bg-canvas text-left font-normal">
              <button
                v-if="anyPrompt"
                type="button"
                class="text-xs whitespace-nowrap text-muted hover:text-fg"
                :aria-expanded="promptsShown"
                data-toggle-prompts
                @click="promptsShown = !promptsShown"
              >
                {{ promptsShown ? '‹ Hide prompts' : 'Prompts ›' }}
              </button>
            </th>
            <th
              v-for="(m, c) in models"
              :key="m.label"
              class="sticky top-0 z-10 bg-canvas px-1 py-1 text-left font-medium"
              :class="{ 'opacity-60': dragging === c }"
              data-model-column
            >
              <span class="flex items-center gap-1">
                <button
                  type="button"
                  class="-ml-1 cursor-grab touch-none p-1 text-muted hover:text-fg active:cursor-grabbing"
                  :aria-label="`Move ${m.label}'s column (drag, or ← and →)`"
                  :title="`Drag to move ${m.label}'s column`"
                  data-move-column
                  v-on="grip(c)"
                  @keydown.left.prevent="moveColumn(c, c - 1)"
                  @keydown.right.prevent="moveColumn(c, c + 1)"
                >
                  <Icon name="grip" />
                </button>
                {{ m.label }}
                <span v-if="m.current" class="font-normal text-muted">· this Session's</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in rows" :key="row.name" data-compare-row>
            <th
              class="sticky left-0 z-10 bg-canvas pr-2 text-left align-top font-normal"
              :class="promptsShown ? 'w-52 min-w-52' : 'whitespace-nowrap'"
            >
              <div class="font-medium">{{ row.name }}</div>
              <template v-if="row.prompt && promptsShown">
                <p
                  class="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-muted"
                  :class="{ 'line-clamp-3': !opened.has(r) }"
                  data-compare-prompt
                >
                  {{ row.prompt }}
                </p>
                <button
                  type="button"
                  class="mt-0.5 text-xs text-muted underline underline-offset-2 hover:text-fg"
                  data-show-prompt
                  @click="toggleOpened(r)"
                >
                  {{ opened.has(r) ? 'Show less' : 'Show all' }}
                </button>
              </template>
            </th>
            <td v-for="(picture, c) in row.pictures" :key="models[c].label" class="align-top">
              <div v-if="picture" class="group/cell relative">
              <!-- Home's thumbnail: shown on the one Home shows, and on hover to choose another. -->
              <button
                v-if="starrable"
                type="button"
                class="absolute top-1 right-1 z-1 flex rounded bg-canvas/85 p-1 touch:opacity-100"
                :class="[
                  picture.star === 'chosen' ? 'text-warn' : 'text-muted hover:text-fg',
                  picture.star ? '' : 'opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100',
                ]"
                :title="STARS[picture.star ?? 'none']"
                :aria-label="STARS[picture.star ?? 'none']"
                :data-thumbnail="picture.star"
                data-star
                @click="$emit('choose', picture)"
              >
                <Icon :name="picture.star === 'chosen' ? 'star-filled' : 'star'" />
              </button>
              <span
                v-else-if="picture.star"
                class="absolute top-1 right-1 z-1 flex rounded bg-canvas/85 p-1 text-muted"
                :data-thumbnail="picture.star"
              >
                <Icon :name="picture.star === 'chosen' ? 'star-filled' : 'star'" />
              </span>
              <button
                type="button"
                class="relative block rounded"
                :title="pictureTitle(picture)"
                data-compare-picture
                @click="viewing = { row: r, column: c }"
              >
                <span
                  v-if="picture.edited"
                  class="absolute top-1 left-1 rounded bg-canvas/85 px-1.5 text-xs"
                  data-edited
                >
                  Edited
                </span>
                <img
                  :src="picture.thumb"
                  :alt="`${row.name} by ${models[c].label}`"
                  :width="picture.width"
                  :height="picture.height"
                  loading="lazy"
                  class="h-[min(16rem,calc(100dvh-8rem))] w-auto max-w-none rounded"
                  :class="{ 'opacity-50': picture.stale }"
                />
              </button>
              </div>
              <div
                v-else
                class="flex h-[min(16rem,calc(100dvh-8rem))] w-full min-w-48 items-center justify-center rounded border border-dashed border-line text-muted"
              >
                Not rendered
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ImageViewer
      :src="viewed?.src ?? null"
      :alt="viewed?.alt"
      :label="viewed?.label"
      :caption="viewed?.caption"
      :has-previous="along(-1) !== null"
      :has-next="along(1) !== null"
      @previous="step(-1)"
      @next="step(1)"
      vertical
      vertical-name="Frame"
      :has-up="across(-1) !== null"
      :has-down="across(1) !== null"
      @up="climb(-1)"
      @down="climb(1)"
      @close="viewing = null"
    />
  </div>
</template>
