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

/** A Frame's picture as a 3D scene of Gaussian splats (SHARP). */
export interface Scene {
  /** `.ply` file inside the Session directory. */
  file: string
  /** The picture it was made from: the Frame's `image`, or its `upscaled`. */
  from: string
  splats: number
  /** The depth to orbit around, so the people near the front stay in view. */
  pivot: number
  /** The camera it was made for: vertical field of view in degrees, and width / height. */
  fov: number
  aspect: number
  /** Seconds it waited for a render and took. */
  timings: { queued?: number; scene: number }
}
