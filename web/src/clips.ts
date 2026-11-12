import { useLocalStorage } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import {
  type Clip,
  CLIP_KIND_NAMES,
  type ClipKind,
  type ClipOrder,
  type ClipSize,
  type Job,
  type Picture,
} from './api'
import { isOpen } from './jobs'
import { useFeatures } from './composables/useFeatures'
import { useSettingsOptions } from './composables/useSettingsOptions'

/**
 * A clip being made: its order, by its video model (none for Settings' default), its prompt and
 * all, to show in the form until it's made.
 */
export type ClipMaking = ClipOrder

/**
 * The clips being made of a Frame's picture by Image Model `model` (queued or running, not
 * failed), from the Frame's jobs: another model's picture can have the same kind made meanwhile.
 */
export const clipsMaking = (jobs: readonly Job[], model?: string): ClipMaking[] =>
  jobs.flatMap((j) =>
    j.kind === 'clip' && isOpen(j) && j.clip &&
      (!j.image || j.image.imageModel === model)
      ? [j.clip]
      : []
  )

const KIND_ORDER = Object.keys(CLIP_KIND_NAMES) as ClipKind[]
/**
 * A picture's clips in the order the kinds are offered (`CLIP_KIND_NAMES`), each kind's in the
 * order its video models' were made.
 */
export const sortClips = (clips: readonly Clip[] = []): Clip[] =>
  [...clips].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))

/** A picture's clips by kind, in order, for the kinds it has. */
export const clipsByKind = (clips: readonly Clip[] = []): { kind: ClipKind; clips: Clip[] }[] =>
  KIND_ORDER.map((kind) => ({ kind, clips: clips.filter((c) => c.kind === kind) }))
    .filter((group) => group.clips.length)

/**
 * The clip playing over a Frame's picture, from the drawer's Clips, the same on every
 * kind's screen: stopped once another Frame is selected (`selected`, by index), so a loop or a clip
 * held on its last frame doesn't carry on behind; and once the Session switches Image Model
 * (`imageModel`), as a clip is of its picture by the model it was on.
 */
export function usePlayingClip(
  selected: () => number | null | undefined,
  imageModel: () => string | undefined,
) {
  const playing = ref<{ index: number; clip: Clip } | null>(null)
  watch(selected, (index) => {
    if (playing.value && playing.value.index !== index) playing.value = null
  })
  watch(imageModel, () => (playing.value = null))
  return playing
}

/**
 * How many clips a Frame's picture as shown (`pictureOf`, its picked version) has, for the Frames
 * list: none for a picture by another Image Model than the Session's `model`, shown only until
 * that model renders the Frame.
 */
export const clipCount = (picture: Picture | undefined, model: string): number =>
  picture && picture.imageModel === model ? picture.clips?.length ?? 0 : 0

/** The lengths a clip can be, in seconds, up to a model's longest at its size. */
export const CLIP_SECONDS = [3, 4, 5, 6, 8, 10]

/**
 * The video models, by name, whether one makes no sound (Wan 2.2), the size each makes clips at
 * (Settings', else its own) and the lengths it offers there. With `sessionId`, also the one a
 * Session's clips are made with (`chosen`): the last picked there, in this browser, else Settings'
 * default.
 */
export function useVideoModels(sessionId?: () => string) {
  const options = useSettingsOptions()
  const { settings } = useFeatures()
  const models = computed(() => options.value?.videoModels ?? [])
  const labelOf = (id: string) => models.value.find((m) => m.id === id)?.label ?? id
  const silent = (id: string) => models.value.find((m) => m.id === id)?.sound === false
  const sizeOf = (id: string): ClipSize | undefined =>
    settings.value?.videoSizes?.[id] ?? models.value.find((m) => m.id === id)?.size
  /** The lengths `id` makes at its size: every one until the models load. */
  const lengthsOf = (id: string) => {
    const model = models.value.find((m) => m.id === id)
    const longest = model?.longest[sizeOf(id) ?? model.size] ?? Infinity
    return CLIP_SECONDS.filter((s) => s <= longest)
  }
  /** Clips in the order of the video models, wherever each was made first. */
  const inModelOrder = (clips: readonly Clip[]) => {
    const at = (id: string) => {
      const i = models.value.findIndex((m) => m.id === id)
      return i < 0 ? Infinity : i
    }
    return [...clips].sort((a, b) => at(a.model) - at(b.model))
  }
  /** What a clip has to hear: none from a model that makes no sound, else speech or not. */
  const soundOf = (clip: Clip) =>
    silent(clip.model) ? 'no sound' : clip.speech ? 'with speech' : 'no dialogue'
  const picked = useLocalStorage(() => `clip-video-model:${sessionId?.() ?? ''}`, '')
  const chosen = computed({
    get: () => picked.value || settings.value?.videoModel || models.value[0]?.id || '',
    set: (id: string) => picked.value = id,
  })
  return { models, labelOf, silent, soundOf, sizeOf, lengthsOf, inModelOrder, chosen }
}

/** Seconds as minutes and seconds, "1:42". */
export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, '0')}`

/**
 * How long a clip took to make, "made in 7:15"; not its wait for another render, which is the
 * queue's, not the video model's.
 */
export const madeIn = (clip: Clip) => `made in ${clock(clip.timings.clip)}`

/** What a clip waited for another render first, if it had to: "Waited 0:30 for another render". */
export const waitedFor = (clip: Clip) =>
  clip.timings.queued ? `Waited ${clock(clip.timings.queued)} for another render` : undefined
