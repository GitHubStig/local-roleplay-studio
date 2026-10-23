<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'

/** One stroke of the brush or the eraser, in the picture's pixels. */
export interface Stroke {
  erase: boolean
  size: number
  points: [number, number][]
}

/**
 * What's painted for an edit (ADR 0021): an area painted before (`base`, a mask, as an edit being
 * made again starts from), shown unless cleared, and strokes over it. Kept by whoever paints, so it
 * outlasts this layer, with its undo history.
 */
export interface Sketch {
  base: boolean
  strokes: Stroke[]
}

/**
 * Painting over a picture the area an edit repaints, laid on the image inside the viewer's zoom
 * layer, so it zooms and pans with it. Strokes are in the picture's own pixels; each one finished is
 * handed up (`stroke`) to add to the sketch. `readonly` only shows it: an edit being made shows
 * where it was painted. `mask()` makes the sketch the edit model's mask: white where painted.
 */
const props = defineProps<{
  /** The picture's size in pixels: the mask's. */
  width: number
  height: number
  sketch: Sketch
  /** The mask painted before (an image's URL), white where it was painted. */
  base?: string
  /** The brush's width, in the picture's pixels, and whether it rubs out. */
  size?: number
  erase?: boolean
  readonly?: boolean
}>()
const emit = defineEmits<{ stroke: [stroke: Stroke] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/** A canvas of the picture's size. */
function sized(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = props.width
  c.height = props.height
  return [c, c.getContext('2d')!]
}

/** The base mask as paint: `colour` where it's white, see-through where it's black. */
const baseLayers = ref<{ red: HTMLCanvasElement; white: HTMLCanvasElement } | null>(null)
watch(
  () => props.base,
  (url) => {
    baseLayers.value = null
    if (!url) return
    const img = new Image()
    img.onload = () => {
      if (props.base !== url) return
      const tinted = (colour: [number, number, number]) => {
        const [c, ctx] = sized()
        ctx.drawImage(img, 0, 0, props.width, props.height)
        const data = ctx.getImageData(0, 0, props.width, props.height)
        for (let i = 0; i < data.data.length; i += 4) {
          data.data[i + 3] = data.data[i]
          ;[data.data[i], data.data[i + 1], data.data[i + 2]] = colour
        }
        ctx.putImageData(data, 0, 0)
        return c
      }
      baseLayers.value = { red: tinted([255, 59, 59]), white: tinted([255, 255, 255]) }
    }
    img.src = url
  },
  { immediate: true },
)

/** Nothing painted: an edit then repaints the whole picture. */
const empty = computed(() =>
  !(props.base && props.sketch.base) && !props.sketch.strokes.some((s) => !s.erase)
)

/** Draws the sketch onto `ctx`, the base from `base`, painting in `paint`, erasing as `erase` says. */
function draw(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  base: HTMLCanvasElement | undefined,
  paint: string,
  erase: string | null,
) {
  if (base && props.sketch.base) ctx.drawImage(base, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
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

let drawing: Stroke | null = null

/** Shown in one colour, at one opacity (the canvas's), however strokes overlap. */
function redraw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, props.width, props.height)
  const strokes = drawing ? [...props.sketch.strokes, drawing] : props.sketch.strokes
  draw(ctx, strokes, baseLayers.value?.red, '#ff3b3b', null)
}
watch([() => props.sketch, baseLayers, canvas], redraw, { deep: true, immediate: true })

/** Where the pointer is, in the picture's pixels, however the layer is zoomed. */
function at(e: PointerEvent): [number, number] {
  const rect = canvas.value!.getBoundingClientRect()
  return [
    ((e.clientX - rect.left) / rect.width) * props.width,
    ((e.clientY - rect.top) / rect.height) * props.height,
  ]
}

/** One finger or the mouse paints; the viewer still zooms with the wheel or a trackpad pinch. */
function onDown(e: PointerEvent) {
  if (props.readonly || !e.isPrimary || e.button !== 0) return
  e.stopPropagation()
  canvas.value!.setPointerCapture(e.pointerId)
  drawing = { erase: !!props.erase, size: props.size ?? 60, points: [at(e)] }
  redraw()
}
function onMove(e: PointerEvent) {
  if (!drawing) return
  e.stopPropagation()
  drawing.points.push(at(e))
  redraw()
}
function onUp() {
  if (!drawing) return
  const stroke = drawing
  drawing = null
  emit('stroke', stroke)
}

/**
 * The sketch as the edit model's mask: a PNG of the picture's size, white where painted (softened
 * at the edge, as measured), black elsewhere, in base64; none if nothing is painted.
 */
function mask(): string | undefined {
  if (empty.value) return undefined
  const [sharp, ctx] = sized()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, props.width, props.height)
  draw(ctx, props.sketch.strokes, baseLayers.value?.white, '#fff', '#000')
  const [soft, out] = sized()
  out.filter = 'blur(4px)'
  out.drawImage(sharp, 0, 0)
  return soft.toDataURL('image/png').split(',')[1]
}

defineExpose({ empty, mask })
</script>

<template>
  <canvas
    ref="canvas"
    :width="width"
    :height="height"
    class="absolute inset-0 h-full w-full touch-none opacity-45"
    :class="readonly ? 'pointer-events-none' : 'cursor-crosshair'"
    data-paint-layer
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  />
</template>
