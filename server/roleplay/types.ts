import type { SessionBase } from '../session.ts'
import type { Look } from '../../shared/session.ts'
import type { Figure, Scene } from '../../shared/threeD.ts'
import type { Picture } from '../../shared/pictures.ts'
import type { Cast, Cue, FrameMusic, Reply, Score, Speech } from '../../shared/roleplay.ts'

export type { Figure, Scene }

/**
 * One exchange: the player's message and the Character's reply. The Opening Frame (index 0) has
 * no message: the Character speaks first.
 */
export interface RoleplayFrame {
  index: number
  message: string | null
  reply: Reply
  /**
   * What happened instead, when the judge found the Message broke one of the Truths (`judge.ts`);
   * the Character was told it with the Message.
   */
  outcome?: string
  /** The Text Model's reasoning, when thinking was on. */
  thinking?: string
  /** Seconds the reply took. */
  timings: { text: number }
  /** The Text Model that wrote the Reply, as a Session can switch Text Model (ADR 0037). */
  textModel: string
  /**
   * Once pictured by the Art Agent: the Frame's seven sentences, and its Image Prompt (the Look's
   * subject, these, then the Look's style), exactly what the Image Model renders.
   */
  body?: string
  prompt?: string
  /** Why the picture can't be rendered: its Image Prompt crosses a Limit. */
  blocked?: string
  /**
   * Who the picture shows, by their names in the Look, the most prominent first; none for a
   * picture of the place alone.
   */
  shown?: string[]
  /** The picture's clothing sentence, checked to dress everyone shown while the Limits are on. */
  clothing?: string
  /** For debugging: seconds the latest picture took, the model that wrote it, and its reasoning. */
  pictureTimings?: { text: number }
  pictureModel?: string
  pictureThinking?: string
  /** One per Image Model it was rendered with (`pictures.ts`); none until rendered. */
  pictures: Picture[]
  /** The Character's line, spoken; out of date when its voice isn't the Roleplay's voice now. */
  speech?: Speech
  /** The Character's thought (`internal`), spoken in the same voice; out of date likewise. */
  thoughtSpeech?: Speech
  /** How the music was directed at this Frame, once it has been (`director.ts`). */
  music?: FrameMusic
  createdAt: string
}

/**
 * The Character's voice: a description in words, written from the Cast and editable, and the
 * reference clip designed from it, which every line is spoken by cloning.
 */
export interface RoleplayVoice {
  description: string
  /** WAV file inside the Session directory; absent until designed, or after the description changes. */
  ref?: string
  /** The model that wrote the description, until it's edited by hand. */
  model?: string
  /**
   * How many takes have been designed: the next is seeded with the Session's seed plus this, so a
   * fixed seed gives the same first voice for a description, and each new take a different one.
   */
  takes?: number
}

/** A conversation with a Character, one Frame per exchange. */
export interface RoleplaySession extends SessionBase {
  kind: 'roleplay'
  /** Null until the Roleplay is set up. */
  cast: Cast | null
  /**
   * Each Subject's identity and the art style, shared by every picture (ADR 0012): written from the
   * Cast when a Frame is first pictured, and joined by anyone the story brings into a picture.
   */
  look: Look | null
  /** For debugging: seconds the Look took to write, the model that wrote it, and its reasoning. */
  lookTimings?: { text: number }
  lookModel?: string
  lookThinking?: string
  /** The Character's voice; written the first time a line is spoken. */
  voice?: RoleplayVoice
  /**
   * The music's identity, shared by every Cue (docs/design.md): written from the Cast, the
   * Brief, the Scenario's Music and the Music taste when asked for, or the first time the music is
   * directed; editable. Absent until then, and while Music is off.
   */
  score?: Score
  /** For debugging: seconds the Score took to write, the model that wrote it, and its reasoning. */
  scoreTimings?: { text: number }
  scoreModel?: string
  scoreThinking?: string
  /** The music's Cues, in the order of the Frames they began on (`director.ts`). */
  cues: Cue[]
  /** For debugging: the last time the whole Roleplay was scored with hindsight (`hindsight.ts`). */
  hindsight?: {
    model: string
    chunks: number
    /** How each chunk heard the course between them, written before its turns. */
    courses: string[]
    timings: { text: number }
  }
  frames: RoleplayFrame[]
}
