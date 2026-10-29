import { nextTick } from 'vue'
import type { ClipKind, Job } from './api'

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

/** The kinds of clip being made of a Frame (queued or running, not failed), from its jobs. */
export const clipsMaking = (jobs: readonly Job[]): ClipKind[] =>
  jobs.flatMap((j) => (j.kind === 'clip' && j.status !== 'failed' && j.clip ? [j.clip.kind] : []))
