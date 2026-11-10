/**
 * The kinds of job, and what the queue needs to know of each: one row per kind. To add a kind, add
 * it to `JobKind` and give it a row; then its runner (`app.ts`'s `runJob`, by the Session's kind)
 * and its name in the web app (`web/src/jobs.ts`).
 */
import type { Feature } from '../shared/features.ts'
import type { JobKind } from '../shared/jobKinds.ts'

interface JobKindInfo {
  /**
   * The Feature it needs: one whose Feature is off can't be queued. Picturing a Frame (its Image
   * Prompt, by the Text Model) needs none, so a Roleplay can be rendered later; music is a setting,
   * not a Feature, which the app checks as it's queued.
   */
  feature: Feature | null
  /** It asks the Text Model, and keeps the one its Session had when queued (`Job.text`). */
  text?: true
  /** It makes or uses a picture with an image model, which unloads the Text Model first. */
  image?: true
  /** It takes minutes and may be late: other image work goes ahead of it while queued. */
  late?: true
  /**
   * A restart doesn't make it again from the start, if its ComfyUI finished or still makes what it
   * asked for: a clip or a track can take minutes. A picture can't be picked up, as it comes back
   * only over the WebSocket that died with the server.
   */
  resumed?: true
  /**
   * It's about the Session rather than one Frame (a Roleplay's voice and its music scored with
   * hindsight, the style scores' embeddings): queued as Frame 0's, which needn't exist yet, as a
   * voice can be designed while the Cast is reviewed, before the scene begins. Its calls are logged
   * with the setup's, not Frame 0's.
   */
  ofSession?: true
  /** It works on the picture its Frame shows when it runs, recording no model. */
  onShownPicture?: true
  /**
   * What it waits for, when queued earlier on its Frame (or, for the Session's own jobs, on any
   * Frame): a render for its Image Prompt, an upscale for its render, 3D for its upscale, a spoken
   * line for its voice, the style scores for every picture; an edit for the render or edit it's
   * made from, and what's made from a picture for its edits (a clip too). Not work on another
   * Image Model's picture (a render by it, ahead of a clip of this one's): both record theirs
   * (`Job.image`). Jobs on one machine also keep their order.
   */
  needs: readonly JobKind[]
}

export const JOBS: Record<JobKind, JobKindInfo> = {
  picture: { feature: null, text: true, needs: [] },
  render: { feature: 'images', image: true, needs: ['picture'] },
  upscale: {
    feature: 'upscale',
    image: true,
    onShownPicture: true,
    needs: ['picture', 'render', 'edit'],
  },
  voice: { feature: 'voices', text: true, ofSession: true, needs: [] },
  speak: { feature: 'voices', text: true, needs: ['voice'] },
  'speak-thought': { feature: 'voices', text: true, needs: ['voice'] },
  scene: {
    feature: 'scenes',
    image: true,
    onShownPicture: true,
    needs: ['picture', 'render', 'edit', 'upscale'],
  },
  figure: {
    feature: 'figures',
    image: true,
    onShownPicture: true,
    needs: ['picture', 'render', 'edit', 'upscale'],
  },
  lito: {
    feature: 'lito',
    image: true,
    onShownPicture: true,
    needs: ['picture', 'render', 'edit', 'upscale'],
  },
  style: { feature: 'style', ofSession: true, needs: ['picture', 'render', 'edit'] },
  edit: {
    feature: 'edits',
    image: true,
    onShownPicture: true,
    needs: ['picture', 'render', 'edit'],
  },
  clip: {
    feature: 'video',
    image: true,
    late: true,
    resumed: true,
    needs: ['picture', 'render', 'edit'],
  },
  direct: { feature: null, text: true, needs: [] },
  'score-roleplay': { feature: null, text: true, ofSession: true, needs: [] },
  music: { feature: null, image: true, late: true, resumed: true, needs: [] },
  steer: { feature: null, text: true, needs: [] },
}

export const JOB_KINDS = Object.keys(JOBS) as JobKind[]
const kindsThat = (flag: Exclude<keyof JobKindInfo, 'feature' | 'needs'>): readonly JobKind[] =>
  JOB_KINDS.filter((kind) => JOBS[kind][flag])

export const JOB_FEATURE = Object.fromEntries(
  JOB_KINDS.map((kind) => [kind, JOBS[kind].feature]),
) as Record<JobKind, Feature | null>
export const NEEDS = Object.fromEntries(
  JOB_KINDS.map((kind) => [kind, JOBS[kind].needs]),
) as Record<JobKind, readonly JobKind[]>
export const TEXT_JOBS = kindsThat('text')
export const IMAGE_JOBS = kindsThat('image')
export const LATE_JOBS = kindsThat('late')
export const RESUMED = kindsThat('resumed')
export const SESSION_JOBS = kindsThat('ofSession')
export const ON_SHOWN_PICTURE = kindsThat('onShownPicture')
