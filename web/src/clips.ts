import { nextTick, ref, watch } from 'vue'
import { type Clip, CLIP_KIND_NAMES, type ClipKind, type Job, type Picture } from './api'

/**
 * Scrolls the Frame tab to its Clip section, once it's drawn: where a clip job in the queue leads
 * (`JobQueue`'s `clip`). Found from `within`, any element of the Session's screen (which has one
 * Frame tab), whether or not that's in the document yet.
 */
export const scrollToClips = (within: Element | null | undefined) =>
  nextTick(() =>
    (within?.getRootNode() as ParentNode | undefined)
      ?.querySelector('[data-frame-clips]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  )

/**
 * The kinds of clip being made of a Frame's picture by Image Model `model` (queued or running, not
 * failed), from the Frame's jobs: another model's picture can have the same kind made meanwhile.
 */
export const clipsMaking = (jobs: readonly Job[], model?: string): ClipKind[] =>
  jobs.flatMap((j) =>
    j.kind === 'clip' && j.status !== 'failed' && j.clip &&
      (!j.image || j.image.imageModel === model)
      ? [j.clip.kind]
      : []
  )

const KIND_ORDER = Object.keys(CLIP_KIND_NAMES) as ClipKind[]
/** A picture's clips in the order the kinds are offered (`CLIP_KIND_NAMES`). */
export const sortClips = (clips: readonly Clip[] = []): Clip[] =>
  [...clips].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))

/**
 * The clip playing over a Frame's picture, from the Frame tab's Clip section, the same on every
 * kind's screen: stopped once another Frame is selected (`selected`, by index), so a loop or a clip
 * held on its last frame doesn't carry on behind.
 */
export function usePlayingClip(selected: () => number | null | undefined) {
  const playing = ref<{ index: number; clip: Clip } | null>(null)
  watch(selected, (index) => {
    if (playing.value && playing.value.index !== index) playing.value = null
  })
  return playing
}

/**
 * How many clips a Frame's picture as shown (`pictureOf`, its picked version) has, for the Frames
 * list: none for a picture by another Image Model than the Session's `model`, shown only until
 * that model renders the Frame.
 */
export const clipCount = (picture: Picture | undefined, model: string): number =>
  picture && picture.imageModel === model ? picture.clips?.length ?? 0 : 0
