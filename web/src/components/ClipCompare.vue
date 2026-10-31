<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { type Clip, CLIP_KIND_NAMES, type ClipKind, imageUrl } from '../api'
import { clipsByKind, clock, madeIn, useVideoModels, waitedFor } from '../clips'
import Icon from './Icon.vue'

/**
 * A picture's clips of one kind side by side, one per video model, played in step: one Play, one
 * timeline, so the models can be compared moment by moment. Only one is heard at a time (several
 * soundtracks at once are noise): clicking a clip moves the sound to it. The clips differ a little
 * in length (each model has its own frame grid), so they're kept together by time: the longest
 * leads, a shorter one waits on its last frame, and an Idle Loop starts them all again together.
 * The kinds with clips by two or more models can be switched between.
 */
const props = defineProps<{
  sessionId: string
  /** The picture's clips. */
  clips: Clip[]
  /** The kind to compare; null keeps the dialog closed. */
  kind: ClipKind | null
}>()
const emit = defineEmits<{ close: [] }>()

const { labelOf, silent, soundOf } = useVideoModels()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const videos = useTemplateRef<HTMLVideoElement[]>('videos')

/** The kinds with clips by two or more models, to compare. */
const kinds = computed(() => clipsByKind(props.clips).filter((g) => g.clips.length > 1).map((g) => g.kind))
const shown = ref<ClipKind | null>(null)
const compared = computed(() => props.clips.filter((c) => c.kind === shown.value))

const playing = ref(false)
const time = ref(0)
const length = ref(0)
/** The clip heard, by its file. */
const heard = ref<string | null>(null)
/** Each clip's size, by its file, once its video has loaded. */
const sizes = ref<Record<string, string>>({})

const all = () => videos.value ?? []
/** The longest clip leads the timeline. */
const lead = () => all().reduce<HTMLVideoElement | undefined>((a, v) => !a || v.duration > a.duration ? v : a, undefined)

function measure(clip: Clip, video: HTMLVideoElement) {
  sizes.value = { ...sizes.value, [clip.file]: `${video.videoWidth}×${video.videoHeight}` }
  length.value = Math.max(...all().map((v) => v.duration || 0))
}

function seek(to: number) {
  time.value = to
  for (const v of all()) v.currentTime = Math.min(to, v.duration || to)
}

function play() {
  if (time.value >= length.value - 0.05) seek(0)
  for (const v of all()) if (v.currentTime < (v.duration || 0)) v.play().catch(() => {})
  playing.value = true
}

function pause() {
  for (const v of all()) v.pause()
  playing.value = false
}

/** The lead's time is the timeline's; one that's drifted more than a few frames is put back. */
function onTime(video: HTMLVideoElement) {
  if (video !== lead()) return
  time.value = video.currentTime
  for (const v of all()) {
    if (v !== video && v.currentTime < v.duration && Math.abs(v.currentTime - video.currentTime) > 0.15) {
      v.currentTime = Math.min(video.currentTime, v.duration)
    }
  }
}

function onEnded(video: HTMLVideoElement) {
  if (video !== lead()) return
  if (shown.value === 'idle-loop') {
    seek(0)
    play()
  } else playing.value = false
}

function hear(clip: Clip) {
  if (!silent(clip.model)) heard.value = clip.file
}

function open(kind: ClipKind) {
  pause()
  shown.value = kind
  time.value = 0
  length.value = 0
  sizes.value = {}
  heard.value = compared.value.find((c) => !silent(c.model))?.file ?? null
}

watch(() => props.kind, (kind) => {
  const el = dialog.value
  if (!el) return
  if (kind) {
    open(kind)
    if (!el.open) el.showModal()
  } else if (el.open) el.close()
}, { flush: 'post' })
onBeforeUnmount(pause)
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-full max-h-none w-full max-w-none bg-neutral-950 p-0 backdrop:bg-black"
    data-clip-compare
    @close="pause(), emit('close')"
  >
    <div v-if="shown" class="flex h-full w-full flex-col gap-3 p-4 text-sm text-white/80 sm:p-8">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-white">Compare clips</span>
        <span class="flex overflow-hidden rounded-md border border-white/25" role="radiogroup" aria-label="Kind of clip">
          <button
            v-for="k in kinds"
            :key="k"
            type="button"
            role="radio"
            class="px-2 py-0.5"
            :class="k === shown ? 'bg-white/90 text-black' : 'hover:text-white'"
            :aria-checked="k === shown"
            :data-compare-kind="k"
            @click="open(k)"
          >
            {{ CLIP_KIND_NAMES[k] }}
          </button>
        </span>
        <button type="button" class="ml-auto hover:text-white" aria-label="Close" @click="dialog?.close()">
          Close ✕
        </button>
      </div>
      <div
        class="grid min-h-0 flex-1 content-center gap-3"
        :class="compared.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'"
      >
        <figure
          v-for="clip in compared"
          :key="clip.file"
          class="flex min-w-0 flex-col gap-1.5"
          :data-compared="clip.model"
        >
          <button
            type="button"
            class="overflow-hidden rounded-md border-2"
            :class="heard === clip.file ? 'border-white/80' : 'border-transparent'"
            :title="silent(clip.model) ? 'This model makes no sound' : 'Hear this one'"
            :aria-pressed="heard === clip.file"
            @click="hear(clip)"
          >
            <video
              ref="videos"
              :src="imageUrl(sessionId, clip.file)"
              class="block w-full"
              playsinline
              preload="auto"
              :muted="heard !== clip.file"
              @loadedmetadata="measure(clip, $event.target as HTMLVideoElement)"
              @timeupdate="onTime($event.target as HTMLVideoElement)"
              @ended="onEnded($event.target as HTMLVideoElement)"
            />
          </button>
          <figcaption class="flex flex-wrap items-center gap-x-2 text-xs">
            <span class="font-medium text-white">{{ labelOf(clip.model) }}</span>
            <Icon v-if="heard === clip.file" name="speaker" aria-label="Heard" />
            <span class="text-white/60" :title="waitedFor(clip)">
              {{ [`${clip.seconds} s`, sizes[clip.file], soundOf(clip), madeIn(clip)].filter(Boolean).join(' · ') }}
            </span>
          </figcaption>
        </figure>
      </div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-white/25 px-2 py-0.5 hover:border-white/60 hover:text-white"
          data-compare-play
          @click="playing ? pause() : play()"
        >
          <Icon :name="playing ? 'pause' : 'play'" />
          {{ playing ? 'Pause' : 'Play all' }}
        </button>
        <input
          type="range"
          class="min-w-0 flex-1"
          min="0"
          :max="length || 1"
          step="0.01"
          :value="time"
          aria-label="Time in the clips"
          data-compare-time
          @input="pause(), seek(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="tabular-nums">{{ clock(time) }} / {{ clock(length) }}</span>
      </div>
    </div>
  </dialog>
</template>
