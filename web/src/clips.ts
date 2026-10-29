import { nextTick } from 'vue'
import { type Clip, CLIP_KIND_NAMES, type ClipKind, type Job } from './api'

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
