/**
 * What every kind of Session has: a Look, an outcome, timings. Shared by the server and the web
 * app: types and plain values only.
 */
import type { ImagePrompt } from './images.ts'
import type { Picture } from './pictures.ts'
import type { RoleplaySession } from './roleplay.ts'
import type { Scenario } from './scenario.ts'
import type { SessionSettings } from './settings.ts'

/**
 * How a Frame's Action was received. Only `done` can change the Image Prompt; `declined` (it
 * crossed a limit) and `unclear` (it couldn't be understood) leave the Image Prompt and image as
 * they were.
 */
export type Outcome = 'done' | 'declined' | 'unclear'

/**
 * How long writing a Frame took, in seconds (one decimal place): the new Image Prompt, including
 * the Limits check. Each picture keeps its own render's timings.
 */
export interface FrameTimings {
  text: number
}

/**
 * One Subject of a Look: a person, creature, animal or object the story follows. Every Frame that
 * shows it uses its identity word for word.
 */
export interface Subject {
  name: string
  /**
   * What it is, by the features of its kind (a person's age, build, skin, hair and face): the
   * subject sentence, for this Subject.
   */
  identity: string
}

/**
 * The identities and art style a Storyboard's Frames share, word for word: each Frame takes the
 * identities of the Subjects it shows.
 */
export interface Look {
  /** Everyone and everything the story follows; none for a Storyboard of places alone. */
  subjects: Subject[]
  /** The art-style-and-medium sentence. */
  style: string
}

/**
 * What kind of Session: a Chain makes each Frame from the previous one by an Action; a
 * Storyboard plans all its Frames together from the Brief.
 */
export type SessionKind = 'chain' | 'storyboard' | 'roleplay'

export type Phase = 'text' | 'queued' | 'image' | 'audio' | 'download'

/** What every Frame has, in a Chain or a Storyboard. */
export interface FrameBase {
  index: number
  /** One paragraph describing the image: exactly what the Image Model renders. */
  prompt: ImagePrompt
  /** One per Image Model it was rendered with (`pictures.ts`); none until rendered. */
  pictures: Picture[]
  createdAt: string
}

/** A committed Chain Frame. The Opening Frame has index 0 and no Action. */
export interface ChainFrame extends FrameBase {
  timings: FrameTimings
  /** The Text Model that wrote it, as a Session can switch Text Model (ADR 0037). */
  textModel: string
  action: string | null
  /** A terse list of what changed, for the player; never fed back to the Text Model. */
  narration: string
  outcome: Outcome
  /** The Text Model's reasoning for this Frame, when thinking was on. */
  thinking?: string
}

/**
 * A Storyboard Frame: planned as a Beat and who it shows, reviewed, then written out from the plan,
 * and edited and rendered on its own.
 */
export interface StoryboardFrame extends FrameBase {
  /** How long its sentences took to write, and the Text Model that wrote them (ADR 0037), last
   * time they were written; none until written. */
  timings?: FrameTimings
  textModel?: string
  /** What happens in this Frame, from the Storyboard's plan. */
  beat: string
  /**
   * The seven sentences only this Frame has (pose, expression, camera, clothing, environment,
   * lighting, color); the prompt is the identities of the Subjects it shows, these, then the Look's
   * style sentence. Empty, with an empty prompt, until the Frame is written.
   */
  body: string
  /**
   * The names of the Look's Subjects this Frame shows, the most prominent first; empty for a
   * picture of the place alone.
   */
  shown: string[]
  /** Why the Frame can't be rendered: it crossed a Limit and must be edited first. */
  blocked?: string
}

export type Frame = ChainFrame | StoryboardFrame

export interface SessionBase {
  id: string
  /** The typed Brief this Session started from; null when it started from a Scenario. */
  brief: string | null
  /** The Scenario file it started from; null when started from a typed Brief. */
  scenarioId: string | null
  /**
   * Its own copy of that Scenario, taken when it started, so editing or deleting the file leaves
   * it alone and it works where the file isn't (ADR 0032); absent for a typed Brief.
   */
  scenario?: Scenario
  /**
   * What it keeps of Settings, as they were when it started: its models (`SESSION_SETTINGS`). Its
   * Text Model, and its Image Model and steps, change only when switched in it (ADR 0037,
   * `switchImageModel`); the rest is read from Settings as they are now.
   */
  settings: SessionSettings
  /** The seed every image in this Session is rendered with. */
  seed: number
  createdAt: string
  /** The image chosen to show it on Home (`homeImage`); absent, Home shows the newest picture. */
  thumbnail?: string
}

export interface ChainSession extends SessionBase {
  kind: 'chain'
  frames: ChainFrame[]
}

export interface StoryboardSession extends SessionBase {
  kind: 'storyboard'
  /** How many Frames to plan. */
  frameCount: number
  /**
   * Null until the Storyboard has been planned; edited, with the Beats, only until its first Frame
   * is written.
   */
  look: Look | null
  frames: StoryboardFrame[]
}

export type Session = ChainSession | StoryboardSession | RoleplaySession
