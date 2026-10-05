<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

/**
 * A full-window look at a picture made into a 2.5D scene (Gaussian splats from SHARP: it turns a
 * little, not all the way round), or at a
 * person as a 3D figure (TripoSplat), drawn with Spark on three.js, which load only when one is
 * first opened. A scene opens on the picture's own view; a figure from the front, turning all the
 * way round. Drag to turn, scroll to zoom, right-drag to move, and the buttons turn a set angle or
 * go back. Both invent what the picture never showed, so the further it turns, the more is made up.
 */
const props = defineProps<{
  /** The scene's `.ply`; null keeps the viewer closed. */
  src: string | null
  /** The depth to orbit around, and the camera the scene was made for. */
  pivot?: number
  fov?: number
  aspect?: number
  /** Which Frame it is, e.g. "Frame 3", or whose figure, e.g. "Elara". */
  label?: string
  /** A person as a figure: orbited round its middle, from the front. */
  figure?: boolean
  /** Which model made the figure: each writes its own axes. */
  model?: 'triposplat' | 'lito'
}>()
const emit = defineEmits<{ close: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const stage = useTemplateRef<HTMLDivElement>('stage')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const controlsBar = useTemplateRef<HTMLElement>('controlsBar')
/**
 * A click outside the scene and its buttons closes, as in the picture viewer; a turn that starts on
 * the scene and lets go outside it doesn't.
 */
onClickOutside(canvas, () => dialog.value?.open && dialog.value.close(), { ignore: [controlsBar] })
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref('')
/** How far the camera has turned from the picture's view, in whole degrees. */
const turned = ref({ across: 0, up: 0 })

/** What's drawing now, to stop and free when the viewer closes. */
let stop: (() => void) | null = null
/** Turns the camera to `yaw` degrees from the picture's view, at the picture's distance. */
let home: (yaw: number) => void = () => {}

async function open(src: string) {
  status.value = 'loading'
  turned.value = { across: 0, up: 0 }
  try {
    const [THREE, { SparkRenderer, SplatMesh }, { OrbitControls }] = await Promise.all([
      import('three'),
      import('@sparkjsdev/spark'),
      import('three/addons/controls/OrbitControls.js'),
    ])
    if (props.src !== src || !canvas.value || !stage.value) return
    // A figure stands on the origin, about one unit tall, facing +x (figure/make.py).
    const figure = !!props.figure
    const pivot = figure ? 2 : props.pivot ?? 2
    const aspect = figure ? 3 / 4 : props.aspect ?? 1
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: false })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    const scene = new THREE.Scene()
    scene.add(new SparkRenderer({ renderer }))
    const camera = new THREE.PerspectiveCamera(figure ? 35 : props.fov ?? 50, aspect, 0.05, 200)
    const controls = new OrbitControls(camera, canvas.value)
    controls.enableDamping = true
    controls.maxDistance = pivot * 4
    const mesh = new SplatMesh({ url: src })
    // SHARP and TripoSplat write the OpenCV camera's axes (y down, looking along +z); three.js looks
    // along -z, so they're turned half round x. LiTo writes its own, standing along z: a quarter
    // turn back about x stands it up, facing +x like TripoSplat's.
    if (props.model === 'lito') mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    else mesh.quaternion.set(1, 0, 0, 0)
    scene.add(mesh)

    // A scene orbits a point `pivot` ahead of the picture's camera; a figure, its own middle.
    const centre = figure ? 0 : -pivot
    const front = figure ? 90 : 0
    home = (yaw) => {
      const a = ((front + yaw) * Math.PI) / 180
      camera.position.set(pivot * Math.sin(a), 0, centre + pivot * Math.cos(a))
      controls.target.set(0, 0, centre)
      controls.update()
    }
    home(0)

    // The canvas keeps the picture's shape, as large as fits.
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = stage.value!
      const width = Math.min(w, h * aspect)
      renderer.setSize(width, width / aspect)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(stage.value)
    fit()

    const offset = new THREE.Vector3()
    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
      offset.subVectors(camera.position, controls.target)
      const angle = (Math.atan2(offset.x, offset.z) * 180) / Math.PI - front
      const across = Math.round(((angle + 540) % 360) - 180)
      const up = Math.round((Math.asin(offset.y / offset.length()) * 180) / Math.PI)
      if (across !== turned.value.across || up !== turned.value.up) turned.value = { across, up }
    })
    stop = () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      mesh.dispose()
      renderer.dispose()
      // Hand the GPU memory back now, not whenever the browser collects the canvas.
      renderer.forceContextLoss()
    }
    await mesh.initialized
    if (props.src === src) status.value = 'ready'
  } catch (err) {
    failure.value = (err as Error).message
    status.value = 'failed'
  }
}

function close() {
  stop?.()
  stop = null
}

watch(
  () => props.src,
  (src) => {
    const el = dialog.value
    if (!el) return
    close()
    if (src) {
      if (!el.open) el.showModal()
      void open(src)
    } else if (el.open) el.close()
  },
  { flush: 'post' },
)
onBeforeUnmount(close)

const SCENE_TURNS = [
  { yaw: -30, label: '← 30°' },
  { yaw: -15, label: '← 15°' },
  { yaw: 0, label: 'Picture view' },
  { yaw: 15, label: '15° →' },
  { yaw: 30, label: '30° →' },
]
const FIGURE_TURNS = [
  { yaw: -90, label: '← Side' },
  { yaw: -45, label: '← 45°' },
  { yaw: 0, label: 'Front' },
  { yaw: 45, label: '45° →' },
  { yaw: 90, label: 'Side →' },
  { yaw: 180, label: 'Back' },
]
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/90"
    data-scene-viewer
    @close="close(), emit('close')"
  >
    <div v-if="src" class="flex h-full w-full flex-col gap-2 p-4 text-sm text-white/80 sm:p-8">
      <div ref="controlsBar" class="flex flex-wrap items-center gap-x-3 gap-y-2" data-viewer-controls>
        <span v-if="label" class="text-white">
          {{ label }} · {{ figure ? `${model === 'lito' ? 'LiTo' : 'TripoSplat'}, 3D` : 'SHARP, 2.5D' }}
        </span>
        <span class="tabular-nums" data-turned>
          Turned {{ turned.across }}° across, {{ turned.up }}° up
        </span>
        <span class="flex flex-wrap gap-1.5">
          <button
            v-for="turn in figure ? FIGURE_TURNS : SCENE_TURNS"
            :key="turn.yaw"
            type="button"
            class="rounded-md border border-white/25 px-2 py-0.5 hover:border-white/60 hover:text-white"
            @click="home(turn.yaw)"
          >
            {{ turn.label }}
          </button>
        </span>
        <button type="button" class="ml-auto hover:text-white" aria-label="Close" @click="dialog?.close()">
          Close ✕
        </button>
      </div>
      <div ref="stage" class="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas ref="canvas" class="touch-none rounded-md" />
        <p v-if="status !== 'ready'" class="absolute" :class="{ 'text-danger': status === 'failed' }">
          {{ status === 'failed'
            ? `Couldn't show the ${figure ? 'figure' : 'scene'}: ${failure}`
            : `Loading the ${figure ? 'figure' : 'scene'}…` }}
        </p>
      </div>
      <p class="text-white/60">
        Drag to turn, scroll to zoom, right-drag to move.
        {{ figure
          ? `${model === 'lito' ? 'LiTo' : 'TripoSplat'} invents their back and sides from one picture.`
          : 'SHARP fills in what the picture never showed, so the further you turn, the more it invents.' }}
      </p>
    </div>
  </dialog>
</template>
