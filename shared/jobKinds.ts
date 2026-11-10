/**
 * The kinds of job. What the queue knows of each is in `server/jobKinds.ts`; what each is called,
 * in `web/src/jobs.ts`. Shared by the server and the web app: types and plain values only.
 */

/**
 * `picture` writes a Roleplay Frame's Image Prompt and `render` renders it; `upscale` takes a
 * picture to 2048 px; `voice` designs a new take of the Character's voice, `speak` voices one
 * Frame's dialogue, and `speak-thought` its thought; `scene` makes a picture into a 2.5D scene
 * (SHARP); `figure` lifts the person in it out as a 3D figure (TripoSplat), and `lito` does so with
 * Apple's LiTo; `style` embeds the Session's pictures for the Compare dialog's style scores; `edit`
 * repaints a picture as told (ADR 0021); `direct` directs the music at a Roleplay Frame (the
 * Music Director, docs/design.md), `score-roleplay` scores a whole Roleplay's with
 * hindsight, `music` makes the track of the Cue that begins on a Frame, and `steer` writes that Cue
 * again as the player asked.
 */
export type JobKind =
  | 'picture'
  | 'render'
  | 'upscale'
  | 'voice'
  | 'speak'
  | 'speak-thought'
  | 'scene'
  | 'figure'
  | 'lito'
  | 'style'
  | 'edit'
  | 'clip'
  | 'direct'
  | 'score-roleplay'
  | 'music'
  | 'steer'
