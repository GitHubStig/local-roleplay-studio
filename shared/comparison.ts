/** What Pictures' Export sends to be written as a page. Shared by the server and the web app: types and plain values only. */
import type { StyleScores } from './style.ts'

/** A picture by its files in the Session's folder, as `Picture` names them. */
export interface ExportPicture {
  image: string
  upscaled?: string
  stale?: boolean
  /** An edit's instructions (ADR 0021), shown as a mark on its picture. */
  edited?: string[]
}

/** What the Compare dialog sends (`ComparisonExport` in the web app). */
export interface ComparisonExport {
  /**
   * Shown before the page, which then asks the visitor to confirm they're 18 or older, on every
   * visit; absent, the page opens straight away.
   */
  notice?: string
  models: { label: string }[]
  rows: {
    name: string
    prompt?: string
    /** What happens in the Frame, under its picture in the viewer. */
    caption?: string
    pictures: (ExportPicture | null)[]
  }[]
  /**
   * The style scores for the exported models (`StyleScores`, from `style/scores.ts`), with the
   * models' names by id and the Frames compared: the page shows them as a tab of their own.
   */
  styles?: {
    scores: StyleScores
    labels: Record<string, string>
    frames: { index: number; name: string; caption?: string }[]
    /** The Session's Frames all share one style (a Storyboard's, a Roleplay's). */
    oneStyle?: boolean
  }
}
