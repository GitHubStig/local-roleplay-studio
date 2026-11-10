/**
 * What 3D is made from a picture. Shared by the server and the web app: types and plain values
 * only.
 */

/** A person as a full 3D figure of Gaussian splats, back included (TripoSplat or LiTo). */
export interface Figure {
  /** `.ply` file inside the Session directory. */
  file: string
  splats: number
  /** The picture it was made from: the Frame's upscale if it had one, else its picture. */
  from: string
  /** Seconds it waited for a render, and took to make. */
  timings: { queued?: number; figure: number }
}
