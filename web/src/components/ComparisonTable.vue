<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import type { Comparison } from '../comparison'
import { useDragReorder } from '../composables/useDragReorder'
import { usePageKeys } from '../composables/usePageKeys'
import Icon from './Icon.vue'
import ImageViewer from './ImageViewer.vue'

/**
 * Pictures side by side, a row per Frame headed by its Image Prompt and a column per Image Model:
 * the Compare dialog's (under a header, given a `title`), and the whole of its exported page. A
 * picture opens in the viewer, where ← and → (or a swipe sideways) step through that Frame's
 * pictures by the other models, and ↑ and ↓ (or a swipe up or down) through the Frames that model
 * rendered, each Frame's caption under its picture. A column moves by dragging its
 * header's grip (or with ← and → on it). With `hideable`, each column has a checkbox: unticked, it
 * moves to the right end, folded to its header. The arrangement is `order` and `hidden`, which the
 * Compare dialog keeps (and exports by); otherwise it lasts until the table is next opened. An
 * `instead` slot shows in place of the table, under the same header (the dialog's style scores),
 * and a `hidden` slot follows each hidden column's name (given its index into `models`).
 */
const props = defineProps<Comparison & { title?: string; hideable?: boolean }>()

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
/** The hidden columns, folded at the right end, each with the index to show it again by. */
const hiddenModels = computed(() =>
  (order.value ?? []).filter((i) => hidden.value.includes(i)).map((i) => ({
    index: i,
    ...props.models[i],
  }))
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
    <div v-if="title" class="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <h2 class="font-medium">{{ title }}</h2>
      <span class="text-muted">
        {{ rows.length }} {{ rows.length === 1 ? 'Frame' : 'Frames' }} · {{ models.length }} models
        <template v-if="hiddenModels.length">({{ hiddenModels.length }} hidden)</template>
      </span>
      <div class="ml-auto flex items-center gap-3">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.instead" ref="instead" class="min-h-0 flex-1 overflow-auto">
      <slot name="instead" />
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
                <input
                  v-if="hideable"
                  type="checkbox"
                  checked
                  :aria-label="`Show ${m.label}`"
                  :title="`Untick to hide ${m.label}, and leave it out of Export`"
                  data-show-model
                  @change="hide(c)"
                />
                {{ m.label }}
                <span v-if="m.current" class="font-normal text-muted">· current</span>
              </span>
            </th>
            <th
              v-for="m in hiddenModels"
              :key="m.label"
              class="sticky top-0 z-10 bg-canvas px-1 py-1 text-left font-normal whitespace-nowrap text-muted"
              data-hidden-column
            >
              <label class="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  :aria-label="`Show ${m.label}`"
                  :title="`Tick to show ${m.label}`"
                  data-show-model
                  @change="show(m.index)"
                />
                {{ m.label }}
              </label>
              <slot name="hidden" :index="m.index" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in rows" :key="row.name" data-compare-row>
            <th
              class="sticky left-0 z-10 bg-canvas pr-2 text-left align-top font-normal"
              :class="promptsShown ? 'w-72 min-w-72' : 'whitespace-nowrap'"
            >
              <div class="text-muted">{{ row.name }}</div>
              <p
                v-if="row.prompt && promptsShown"
                class="mt-1 max-h-56 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap"
                data-compare-prompt
              >
                {{ row.prompt }}
              </p>
            </th>
            <td v-for="(picture, c) in row.pictures" :key="models[c].label" class="align-top">
              <button
                v-if="picture"
                type="button"
                class="block"
                :title="picture.stale ? 'Its Image Prompt changed since it was rendered' : undefined"
                @click="viewing = { row: r, column: c }"
              >
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
              <div
                v-else
                class="flex h-[min(16rem,calc(100dvh-8rem))] w-full min-w-48 items-center justify-center rounded border border-dashed border-line text-muted"
              >
                Not rendered
              </div>
            </td>
            <td v-if="hiddenModels.length" :colspan="hiddenModels.length" />
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
