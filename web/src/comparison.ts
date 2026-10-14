/**
 * Pictures side by side, as the Compare dialog and its exported page show them: a row per Frame
 * and a column per Image Model.
 */
export interface Comparison {
  models: ComparisonModel[]
  rows: ComparisonRow[]
}

export interface ComparisonModel {
  label: string
  /** The Session's Image Model. */
  current?: boolean
}

export interface ComparisonRow {
  /** What the Frame is called, e.g. "Frame 3". */
  name: string
  /** Its Image Prompt, once written. */
  prompt?: string
  /**
   * What happens in it, under its picture in the viewer: a Chain Frame's Narration, a Storyboard
   * Frame's Beat, a Roleplay Reply's actions.
   */
  caption?: string
  /** Its picture by each model, in the models' order; null where that model rendered none. */
  pictures: (ComparisonPicture | null)[]
}

export interface ComparisonPicture {
  /** Shown in the table. */
  thumb: string
  /** Shown in the viewer: the upscaled picture, when there is one. */
  full: string
  /** The thumbnail's size, so its cell has its width before it loads (an export's). */
  width?: number
  height?: number
  /** Its Image Prompt changed since it was rendered. */
  stale?: boolean
}
