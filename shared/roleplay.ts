/**
 * A Roleplay's Cast, Reply and music types. Shared by the server and the web app: types and plain
 * values only.
 */

/** Who the Text Model plays. */
export interface Character {
  name: string
  /** The Character's age in years. */
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
  /**
   * What holds whatever anyone does: the Scenario's, copied as the Cast is first written (ADR 0032),
   * then the player's to edit, before or after the scene begins.
   */
  truths: string[]
  /**
   * The story's other People, a line each (name, then what the Scenario says of them): copied as
   * the Cast is first written (ADR 0032), then the player's to edit. They may act and speak briefly
   * in the Character's `actions`. None in a story of two.
   */
  others: string[]
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

/** A Cue's music: what the music model made from its values. */
export interface CueTrack {
  /** File name inside the Session directory. */
  file: string
  seconds: number
  bpm: number
  seed: number
  /** Seconds it waited for other heavy work (only if it had to) and took. */
  timings: { queued?: number; music: number }
}

/**
 * A Roleplay's musical identity, as a film's score keeps one sound while its moods change: what
 * every Cue is made in. Its avoid list binds what writes the Cues; it never reaches a music model,
 * as naming a thing pulls it in.
 */
export interface Score {
  /** A short phrase: "dark folk", "late-romantic orchestral". */
  genre: string
  /** The instruments its Cues are drawn from; voices aren't among them (the Cue's Vocals say). */
  palette: string[]
  /** One or two sentences: how the music feels throughout. */
  atmosphere: string
  /** The range every Cue's tempo keeps within, in beats per minute. */
  tempo: { slowest: number; fastest: number }
  /** Short phrases: instruments, styles or clichés the music never uses. */
  avoid: string[]
}
