import type { Look, SessionBase } from '../session.ts'

/**
 * A Roleplay's Look: each person's identity sentence, and the art style, used word for word in
 * every picture. A picture includes only the identities of the people it shows.
 */
export interface RoleplayLook {
  /** The Character's identity: name, age, build, skin, hair, face. */
  character: string
  /** The Persona's identity, the same way. */
  persona: string
  /** The art style and medium. */
  style: string
}

/** Who a picture shows. */
export type Shown = 'both' | 'character' | 'persona'

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
   * subject, these, then the Look's style) as written and as sent to the Image Model.
   */
  body?: string
  prompt?: string
  promptText?: string
  /** Why the picture can't be rendered: its Image Prompt crosses a Limit. */
  blocked?: string
  /** Who the picture shows; pictures from before this was recorded show both. */
  shown?: Shown
  /** The picture's clothing sentence, checked to dress everyone shown while the Limits are on. */
  clothing?: string
  /** For debugging: seconds the latest picture took, and the Art Agent's reasoning, if any. */
  pictureTimings?: { text: number }
  pictureThinking?: string
  /** File name of the rendered picture inside the Session directory; null until rendered. */
  image: string | null
  /** The picture upscaled to 2048 px, once upscaled; a re-render drops it. */
  upscaled?: string
  /** The Image Prompt changed since the picture was rendered. */
  stale?: boolean
  /** Seconds the latest render waited for another and took, as for any Frame. */
  renderTimings?: { queued?: number; image: number | null }
  createdAt: string
}

/** A conversation with a Character, one Frame per exchange. */
export interface RoleplaySession extends SessionBase {
  kind: 'roleplay'
  /** Null until the Roleplay is set up. */
  cast: Cast | null
  /**
   * Who is shown and in what style, shared by every picture; written when one is first pictured.
   * A Look with a single `subject` sentence is from before pictures chose who is shown: the next
   * picture replaces it.
   */
  look?: RoleplayLook | Look | null
  /** For debugging: seconds the Look took to write, and the Art Agent's reasoning, if any. */
  lookTimings?: { text: number }
  lookThinking?: string
  frames: RoleplayFrame[]
}
