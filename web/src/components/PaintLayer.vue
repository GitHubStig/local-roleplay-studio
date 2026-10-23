<script setup lang="ts">
import { useManualRefHistory } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

/**
 * Painting over a picture the area an edit repaints (ADR 0021), laid on the image inside the
 * viewer's zoom layer, so it zooms and pans with it. Strokes are kept in the picture's own pixels,
 * as the brush or the eraser drew them, and can be undone and redone one at a time (Clear is one
 * too). `mask()` makes them the edit model's mask: white where painted, black elsewhere.
 */
const props = defineProps<{
  /** The picture's size in pixels: the mask's. */
  width: number
  height: number
  /** The brush's width, in the picture's pixels. */
  size: number
  /** Strokes rub out instead of painting. */
  erase: boolean
}>()

/** One stroke of the brush or the eraser, in the picture's pixels. */
interface Stroke {
  erase: boolean
  size: number
  points: [number, number][]
}

const strokes = ref<Stroke[]>([])
const { commit, undo, redo, canUndo, canRedo } = useManualRefHistory(strokes, { clone: true })
/** Nothing painted: an edit then repaints the whole picture. */
const empty = computed(() => !strokes.value.some((s) => !s.erase))

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/** Draws `list` onto `ctx`: painting in `paint`, erasing as `erase` says (a colour, or cut out). */
function draw(ctx: CanvasRenderingContext2D, list: Stroke[], paint: string, erase: string | null) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of list) {
    ctx.globalCompositeOperation = stroke.erase && !erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = ctx.fillStyle = stroke.erase ? (erase ?? '#000') : paint
    ctx.lineWidth = stroke.size
    const [first, ...rest] = stroke.points
    ctx.beginPath()
    ctx.moveTo(...first)
    // A dot for a click; a line through the points for a drag.
    if (!rest.length) ctx.arc(...first, stroke.size / 2, 0, Math.PI * 2)
    for (const point of rest) ctx.lineTo(...point)
    if (rest.length) ctx.stroke()
    else ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Shown in one colour, at one opacity (the canvas's), however strokes overlap. */
function redraw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, props.width, props.height)
  draw(ctx, strokes.value, '#ff3b3b', null)
}
onMounted(redraw)
watch(strokes, redraw, { deep: true })

/** Where the pointer is, in the picture's pixels, however the layer is zoomed. */
function at(e: PointerEvent): [number, number] {
  const rect = canvas.value!.getBoundingClientRect()
  return [
    ((e.clientX - rect.left) / rect.width) * props.width,
    ((e.clientY - rect.top) / rect.height) * props.height,
  ]
}

let drawing: Stroke | null = null
/** One finger or the mouse paints; the viewer still zooms with the wheel or a trackpad pinch. */
function onDown(e: PointerEvent) {
  if (!e.isPrimary || e.button !== 0) return
  e.stopPropagation()
  canvas.value!.setPointerCapture(e.pointerId)
  drawing = { erase: props.erase, size: props.size, points: [at(e)] }
  strokes.value = [...strokes.value, drawing]
}
function onMove(e: PointerEvent) {
  if (!drawing) return
  e.stopPropagation()
  drawing.points.push(at(e))
  redraw()
}
function onUp() {
  if (!drawing) return
  drawing = null
  commit()
}

function clear() {
  if (!strokes.value.length) return
  strokes.value = []
  commit()
}

/**
 * The strokes as the edit model's mask: a PNG of the picture's size, white where painted (softened
 * at the edge, as measured), black elsewhere, in base64; none if nothing is painted.
 */
function mask(): string | undefined {
  if (empty.value) return undefined
  const sharp = document.createElement('canvas')
  sharp.width = props.width
  sharp.height = props.height
  const ctx = sharp.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, props.width, props.height)
  draw(ctx, strokes.value, '#fff', '#000')
  const soft = document.createElement('canvas')
  soft.width = props.width
  soft.height = props.height
  const out = soft.getContext('2d')!
  out.filter = 'blur(4px)'
  out.drawImage(sharp, 0, 0)
  return soft.toDataURL('image/png').split(',')[1]
}

defineExpose({ undo, redo, canUndo, canRedo, clear, empty, mask })
</script>

<template>
  <canvas
    ref="canvas"
    :width="width"
    :height="height"
    class="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-45"
    data-paint-layer
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  />
</template>
