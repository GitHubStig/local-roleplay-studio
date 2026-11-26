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
 * Who wrote something with the Text Model, how long it took and its reasoning: a Frame's text, a
 * picture's sentences, a Look, a Score, the music's direction. Shown for debugging and comparing
 * models.
 */
export interface Written {
  /** The Text Model, as a Session can switch Text Model (ADR 0037). */
  model: string
  /** Seconds it took, to one decimal place, including the Limits check. */
  seconds: number
  /** The Text Model's reasoning, when thinking was on. */
  thinking?: string
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
 * A reference sheet of one Subject of a Look: three head-and-shoulders views of it (front,
 * three-quarter, profile) in one render, for the face pass to repaint its face from in every
 * picture (ADR 0045). Made in a Storyboard's plan review or a Roleplay's Cast
 * review, and fixed once the story begins.
 */
export interface Sheet {
  /** The Subject's name in the Look; renamed with it. */
  subject: string
  /** Whether its face is repainted from it; every Subject starts ticked. */
  ticked: boolean
  /** The identity it's made from, word for word, so a sheet and the Look always agree. */
  identity: string
  /** Its seed: the Session's plus the Subject's index, one more for each Redo (ADR 0011). */
  seed: number
  /** The picture, once made; none until then. */
  made?: SheetPicture
}

/** A sheet as made: the render, and its three views cut from it, each mirrored too. */
export interface SheetPicture {
  /** The whole sheet, as rendered. */
  file: string
  /** Its three views, cut from it, left to right: front, three-quarter, profile. */
  views: [string, string, string]
  /** Each view mirrored, in the same order, for a head turned the other way. */
  mirrored: [string, string, string]
  /** The Image Model that rendered it. */
  imageModel: string
  createdAt: string
  /**
   * Why the check found it unfit for the face pass (writing on it, its views out of order), when
   * it was found so twice, the second time kept; none when it was fit, or not checked.
   */
  flaw?: string
  /**
   * The check found no head on it: a thing (a lantern), not a person or creature, so the face
   * pass tells its edit to keep its shape and state rather than a face. False when not checked.
   */
  thing: boolean
}

/**
 * What kind of Session: a Chain makes each Frame from the previous one by an Action; a
 * Storyboard plans all its Frames together from the Brief.
 */
export type SessionKind = 'chain' | 'storyboard' | 'roleplay'

/**
 * Whether a Session's reference sheets are settled: once its story has begun (a Roleplay's
 * opening, a Storyboard's first Frame written), they're made, redone and ticked no more, so no
 * picture is made from a sheet that later changes. One still being made then is finished.
 */
export const sheetsSettled = (
  session: { kind: SessionKind; frames: readonly { image?: unknown }[] },
): boolean =>
  session.kind === 'roleplay' ? session.frames.length > 0 : session.frames.some((f) => f.image)

/** `faces`: a render's face pass, repainting faces from their reference sheets. */
export type Phase = 'text' | 'queued' | 'image' | 'audio' | 'download' | 'faces'

/** What every Frame has, of every kind. */
export interface FrameBase {
  index: number
  /** One per Image Model it was rendered with (`pictures.ts`); none until rendered. */
  pictures: Picture[]
  createdAt: string
}

/** A Chain Frame's image: its Image Prompt, written with the Frame. */
export interface ChainImage {
  /** One paragraph describing the image: exactly what the Image Model renders. */
  prompt: ImagePrompt
}

/**
 * A Storyboard Frame's image, once its sentences are written; a Roleplay Frame's adds who it shows
 * (`RoleplayImage`).
 */
export interface FrameImage {
  /**
   * The seven sentences only this Frame has (pose, expression, camera, clothing, environment,
   * lighting, color).
   */
  body: string
  /**
   * Its expression sentence (each person's facial expression and where they look), kept apart for
   * the face pass to name (ADR 0045): '' when not known, for a Frame written
   * before it was kept, or whose sentences were edited by hand and no longer hold it word for word.
   */
  expression: string
  /**
   * Its clothing sentence (what each person has on, and anything on their skin: a bruise, dirt),
   * kept apart for the face pass to name, as the expression's is: '' when not known, likewise. A
   * Roleplay's is always written, and checked to dress everyone shown while the Limits are on.
   */
  clothing: string
  /**
   * Exactly what the Image Model renders: the identities of the Subjects shown, the body, then the
   * Look's style sentence.
   */
  prompt: ImagePrompt
  /** Why it can't be rendered: it crossed a Limit and must be edited first. */
  blocked?: string
  /** Its sentences, the last time they were written; editing them by hand keeps it. */
  written: Written
}

/** A committed Chain Frame. The Opening Frame has index 0 and no Action. */
export interface ChainFrame extends FrameBase {
  image: ChainImage
  /** Its new Image Prompt, narration and outcome, written together. */
  written: Written
  action: string | null
  /** A terse list of what changed, for the player; never fed back to the Text Model. */
  narration: string
  outcome: Outcome
}

/**
 * A Storyboard Frame: planned as a Beat and who it shows, reviewed, then written out from the plan,
 * and edited and rendered on its own.
 */
export interface StoryboardFrame extends FrameBase {
  /** What happens in this Frame, from the Storyboard's plan. */
  beat: string
  /**
   * The names of the Look's Subjects this Frame shows, the most prominent first, from the plan;
   * empty for a picture of the place alone.
   */
  shown: string[]
  /** Its image, once its sentences are written; none until then. */
  image?: FrameImage
}

export type Frame = ChainFrame | StoryboardFrame

/** The longest a Session's title may be, once trimmed. */
export const SESSION_TITLE_LENGTH = 100

export interface SessionBase {
  id: string
  /**
   * Its name, shown wherever it's listed: its Scenario's title, or the start of its Brief, when it
   * starts (`sessionTitle`), and the player's after that, as they rename it.
   */
  title: string
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
  /** A reference sheet per Subject of its Look, when it has sheets (`settings.sheets`); else none. */
  sheets: Sheet[]
  frames: StoryboardFrame[]
}

export type Session = ChainSession | StoryboardSession | RoleplaySession

/** A saved Session as Home lists it (`GET /api/sessions`). */
export interface SessionSummary {
  id: string
  kind: SessionKind
  scenarioId: string | null
  /** The Scenario's title, or the start of the typed Brief. */
  title: string
  frames: number
  /** The image that shows it there: the one chosen, or else the newest picture. */
  thumbnail: string | null
  /**
   * Shown on its card in place of a picture until there is one: a Roleplay's latest line, a
   * Chain's latest Narration, a Storyboard's first Beat.
   */
  excerpt: string | null
  createdAt: string
  updatedAt: string
  /** What work in progress is doing (speaking a line is `audio`), or null when idle. */
  activity: Phase | null
}

/** The server's answer to a health check (`GET /api/health`). */
export interface Health {
  ok: boolean
}

/**
 * What the server adds to a stored Session as it sends one (`GET /api/sessions/:id`), for the
 * screens; the routes that answer with a Session after changing it send it as stored.
 */
export interface Loaded {
  /** What work in progress is doing (speaking a line is `audio`), or null when idle. */
  activity: Phase | null
  /** Which Frame that work is on, for Storyboards. */
  activeFrame: number | null
  /** The size its pictures render at, from its Settings. */
  imageSize: { width: number; height: number }
}
