import type { Look, SessionBase } from '../session.ts'
import type { Delivery } from '../voice/voice.ts'
import type { Scene } from '../3d/scene.ts'
import type { Figure } from '../3d/figure.ts'
import type { Picture } from '../pictures.ts'

export type { Figure, Scene }

/** Who the Text Model plays. */
export interface Character {
  name: string
  /** Always 18 or over; the engine refuses anything younger. */
  age: number
  appearance: string
  personality: string
  /** How they speak: vocabulary, rhythm, habits. */
  voice: string
  background: string
  /** What they want in this scene, and what drives them; keeps them acting, not just reacting. */
  goal: string
}

/** Who the player plays, so the Character knows who they're dealing with. */
export interface Persona {
  name: string
  /** Who they are to the Character. */
  role: string
  appearance: string
}

/** Where and when the scene starts; the conversation carries it from there. */
export interface Setting {
  place: string
  time: string
  weather: string
}

/** Everything a Roleplay is set up with, written once when it starts; editable later. */
export interface Cast {
  character: Character
  persona: Persona
  setting: Setting
}

/** The Character's reply to one message, in the order the model writes it. */
export interface Reply {
  /** A brief first-person thought; "" if none. */
  internal: string
  /** What the Character physically does, as sensory prose. */
  actions: string
  /** What the Character says aloud; "" if silent. */
  dialogue: string
}

/**
 * One exchange: the player's message and the Character's reply. The Opening Frame (index 0) has
 * no message: the Character speaks first.
 */
export interface RoleplayFrame {
  index: number
  message: string | null
  reply: Reply
  /** The Text Model's reasoning, when thinking was on. */
  thinking?: string
  /** Seconds the reply took. */
  timings?: { text: number }
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
  /** Written as tags rather than prose (Settings → Art Agent style); absent for prose. */
  pictureStyle?: 'tags'
  pictureThinking?: string
  /** One per Image Model it was rendered with (`pictures.ts`); none until rendered. */
  pictures: Picture[]
  /** The Character's line, spoken; out of date when its voice isn't the Roleplay's voice now. */
  speech?: Speech
  /** The Character's thought (`internal`), spoken in the same voice; out of date likewise. */
  thoughtSpeech?: Speech
  createdAt: string
}

/** A Frame's dialogue spoken in the Character's voice. */
export interface Speech {
  /** WAV file inside the Session directory. */
  file: string
  /** The voice it was spoken in: the reference clip, as `RoleplayVoice.ref`. */
  ref: string
  /** Seconds it waited for a render and took to speak. */
  timings: { queued?: number; audio: number }
  /** How it was directed: absent if directing failed and it was spoken as written. */
  delivery?: Delivery
  /**
   * Why directing failed, when it did and the line was spoken as written: shown beside Listen, so
   * the player can speak it again (a Text Model that crashed, say, may load the next time).
   */
  undirected?: string
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
   * Each person's identity and the art style, shared by every picture (ADR 0012): written from the
   * Cast when a Frame is first pictured, and joined by anyone the story brings into a picture.
   */
  look?: Look | null
  /** For debugging: seconds the Look took to write, the model that wrote it, and its reasoning. */
  lookTimings?: { text: number }
  lookModel?: string
  lookThinking?: string
  /** The Character's voice; written the first time a line is spoken. */
  voice?: RoleplayVoice
  frames: RoleplayFrame[]
}
