import type { Look, SessionBase } from '../session.ts'
import type { Delivery } from '../voice.ts'

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

/** Who a picture shows: both, one of them, or no one (an empty room, a closed door). */
export type Shown = 'both' | 'character' | 'persona' | 'none'

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
  /** For debugging: seconds the latest picture took, the model that wrote it, and its reasoning. */
  pictureTimings?: { text: number }
  pictureModel?: string
  /** Written as tags rather than prose (Settings → Art Agent style); absent for prose. */
  pictureStyle?: 'tags'
  pictureThinking?: string
  /** File name of the rendered picture inside the Session directory; null until rendered. */
  image: string | null
  /** The picture upscaled to 2048 px, once upscaled; a re-render drops it. */
  upscaled?: string
  /** The Image Prompt changed since the picture was rendered. */
  stale?: boolean
  /** Seconds the latest render waited for another and took, as for any Frame. */
  renderTimings?: { queued?: number; image: number | null }
  /** The Character's line, spoken; out of date when its voice isn't the Roleplay's voice now. */
  speech?: Speech
  /** The Character's thought (`internal`), spoken in the same voice; out of date likewise. */
  thoughtSpeech?: Speech
  /** The picture made into a 3D scene, once asked for; a re-render drops it. */
  scene?: Scene
  /** The person in the picture lifted out as a full 3D figure; a re-render drops it. */
  figure?: Figure
  createdAt: string
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

/** Who in a Roleplay a portrait and its figure are of. */
export type Who = 'character' | 'persona'
/** How a portrait made for a figure is framed. */
export type Framing = 'full' | 'waist'

/** A person as a full 3D figure of Gaussian splats, back included (TripoSplat). */
export interface Figure {
  /** `.ply` file inside the Session directory. */
  file: string
  splats: number
  /** The picture it was made from: a portrait rendered for it, or a Frame's picture. */
  from: string
  /** For a portrait: how it was framed, and the Image Prompt it was rendered from. */
  framing?: Framing
  prompt?: string
  /** Seconds it waited for a render, took to render the portrait (if any), and to make. */
  timings: { queued?: number; image?: number; figure: number }
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
  /** For debugging: seconds the Look took to write, the model that wrote it, and its reasoning. */
  lookTimings?: { text: number }
  lookModel?: string
  lookThinking?: string
  /** The Character's voice; written the first time a line is spoken. */
  voice?: RoleplayVoice
  /** Each person as a 3D figure, made from a portrait rendered for it from the Look. */
  figures?: Partial<Record<Who, Figure>>
  frames: RoleplayFrame[]
}
