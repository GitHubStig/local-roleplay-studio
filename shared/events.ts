/** What a stream of work sends as it goes (server-sent events): each kind of work's own events, and how any stream ends. Shared by the server and the web app: types and plain values only. */
import type { ImageBackendKind } from './images.ts'
import type { Cast, Reply, RoleplayFrame, RoleplaySession, Score } from './roleplay.ts'
import type {
  ChainFrame,
  Look,
  Outcome,
  Phase,
  StoryboardFrame,
  StoryboardSession,
} from './session.ts'

/** Progress any piece of work reports as it happens, in a Chain or a Storyboard. */
export type ProgressEvent =
  /**
   * `queued`: waiting for another Session's render to finish; `download`: downloading a model the
   * first time it's used, before rendering (or speaking) with it.
   */
  /** `imageBackend`: the kind of backend a render runs on, once it starts (`phase: 'image'`). */
  | { type: 'phase'; phase: Phase; imageBackend?: ImageBackendKind }
  /** More of the Text Model's reasoning; `restart` when a retry starts reasoning afresh. */
  | { type: 'thinking'; text: string; restart?: boolean }
  /** Image Model steps completed so far. */
  | { type: 'progress'; step: number; total: number }

/** Progress of a Chain Frame, streamed to the player as it happens. */
export type FrameEvent =
  | ProgressEvent
  | { type: 'committed'; frame: ChainFrame }
  /** The Action crossed a Limit, or the Text Model declined it: nothing was saved. */
  | { type: 'declined'; message: string }
  /** The Text Model couldn't tell what to change, and asks: nothing was saved. */
  | { type: 'unclear'; message: string }
  /** The Text Model took the Action but left the Image Prompt as it was: nothing was saved. */
  | { type: 'unchanged'; message: string }

/** Progress of Storyboard work, streamed to the player as it happens. */
export type StoryboardEvent =
  | ProgressEvent
  /** Parts of the plan, as the Text Model writes them; provisional until `planned`. */
  | { type: 'look'; look: Look }
  | { type: 'planned-beat'; index: number; beat: string; shown: string[] }
  | { type: 'planned'; session: StoryboardSession }
  /** A Frame written from the plan, saved as it comes; `written` once the last one is. */
  | { type: 'written-frame'; frame: StoryboardFrame }
  | { type: 'written'; session: StoryboardSession }
  | { type: 'rendered'; frame: StoryboardFrame }
  /** A Frame edited by Action: how the Action was received, and the Storyboard after it. */
  | { type: 'edited'; outcome: Outcome; narration: string; session: StoryboardSession }

export type ClipPromptEvent =
  | { type: 'phase'; phase: Phase }
  /** The prompt as written so far, untidied. */
  | { type: 'clip-prompt-part'; text: string }
  /** The whole prompt, tidied. */
  | { type: 'clip-prompt'; text: string }

/** Progress of a Roleplay's setup or reply, streamed to the player as it happens. */
export type RoleplayEvent =
  | ProgressEvent
  /** The Cast, once written. */
  | { type: 'cast'; cast: Cast; session: RoleplaySession }
  /** One field of the reply, the moment the model finishes writing it. */
  | { type: 'reply-part'; key: keyof Reply; value: string }
  | { type: 'replied'; frame: RoleplayFrame; session: RoleplaySession }
  /** The message or the reply crossed a Limit: nothing was saved. */
  | { type: 'declined'; message: string }
  /** The Art Agent's Look, written the first time a Frame is pictured. */
  | { type: 'look'; look: Look }
  /** The Score, written (`score.ts`). */
  | { type: 'score'; score: Score; session: RoleplaySession }
  /** A Frame's music, directed (`director.ts`). */
  | { type: 'directed'; frame: RoleplayFrame; session: RoleplaySession }
  /** The whole Roleplay's music, scored with hindsight (`hindsight.ts`). */
  | { type: 'scored'; session: RoleplaySession }
  /** A Frame's picture: its Image Prompt, not yet rendered. */
  | { type: 'pictured'; frame: RoleplayFrame; session: RoleplaySession }
  /** A Frame's picture, rendered. */
  | { type: 'rendered'; frame: RoleplayFrame; session: RoleplaySession }
  /** Suggest: the Message as it's written, then whole and tidied. */
  | { type: 'suggestion-part'; text: string }
  | { type: 'suggestion'; text: string }

/**
 * How a stream ends when its work doesn't: the last event, in place of the work's own result.
 * `sessionDiscarded`: the Session was removed with it (an Opening Frame, a first plan).
 */
export type EndEvent =
  | { type: 'failed'; message: string; sessionDiscarded: boolean }
  | { type: 'cancelled'; sessionDiscarded: boolean }
