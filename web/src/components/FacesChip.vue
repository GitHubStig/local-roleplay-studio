<script setup lang="ts">
import { computed, ref } from 'vue'
import { pickedEdit, type Picture, useFaces } from '../api'
import { HOLD_MS } from '../contextMenu'
import { usePictureMenu } from '../composables/usePictureMenu'
import PopMenu from './PopMenu.vue'

/**
 * "Faces from sheets" on a picture whose faces were repainted from their reference sheets
 * (docs/reference-sheets-plans.md), as Edited is on an edited one. Clicking it says whose faces
 * were repainted, with Without the face pass, which uses the render for that Frame; the chip then
 * offers the faces back. Holding it (a long press on a touch screen, as a long press on the
 * picture opens its menu) shows the other version while held (`peek`). Shown while the picture's
 * Original is what the Frame shows, not one of its edits.
 */
const props = defineProps<{ picture?: Picture; index?: number }>()
const emit = defineEmits<{ peek: [file: string | null] }>()
const menu = usePictureMenu()
const faces = computed(() =>
  props.picture?.faces && !pickedEdit(props.picture) ? props.picture.faces : undefined
)
const names = computed(() => new Intl.ListFormat('en').format(faces.value?.subjects ?? []))
const label = computed(() => (faces.value?.without ? 'Without the face pass' : 'Faces from sheets'))

/** Held: the other version shows while the pointer stays down. A hold isn't also a click. */
let timer: ReturnType<typeof setTimeout> | undefined
let held = false
function press() {
  held = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    held = true
    emit('peek', faces.value!.other.upscaled ?? faces.value!.other.file)
  }, HOLD_MS)
}
function lift() {
  clearTimeout(timer)
  if (held) emit('peek', null)
}
function click(toggle: () => void) {
  if (held) held = false
  else toggle()
}

const busy = ref(false)
const failed = ref('')
async function use(without: boolean, close: () => void) {
  const s = menu?.session.value
  if (!s || props.index === undefined) return
  busy.value = true
  failed.value = ''
  try {
    await useFaces(s.sessionId, props.index, without)
    s.changed()
    close()
  } catch (err) {
    failed.value = (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PopMenu v-if="faces" align="end" panel-class="w-72 p-3 text-sm" data-faces>
    <template #button="{ toggle }">
      <button
        type="button"
        class="shrink-0 rounded-full bg-black/70 px-2.5 py-0.5 text-sm whitespace-nowrap text-white select-none [-webkit-touch-callout:none]"
        :title="`${label}: ${names}`"
        data-faces-chip
        @pointerdown="press"
        @pointerup="lift"
        @pointercancel="lift"
        @pointerleave="lift"
        @contextmenu.prevent.stop
        @click.stop="click(toggle)"
      >
        {{ label }}
      </button>
    </template>
    <template #default="{ close }">
      <p>
        <b>{{ label }}</b>
        <template v-if="!faces.without"> · {{ names }}</template>
        <template v-else> · {{ names }}'s faces as rendered</template>
      </p>
      <p class="text-muted">
        <span class="touch:hidden">Hold</span><span class="hidden touch:inline">Press and hold</span>
        to see the picture {{ faces.without ? 'with the faces from sheets' : 'before' }}.
      </p>
      <button
        v-if="menu"
        type="button"
        class="mt-2 flex items-center justify-center rounded border border-line px-2.5 py-1 hover:border-fg disabled:opacity-50 max-sm:w-full max-sm:py-2"
        :disabled="busy"
        data-faces-use
        @click="use(!faces.without, close)"
      >
        {{ faces.without ? 'Faces from sheets' : 'Without the face pass' }}
      </button>
      <p v-if="failed" class="mt-1 text-danger">{{ failed }}</p>
    </template>
  </PopMenu>
</template>
