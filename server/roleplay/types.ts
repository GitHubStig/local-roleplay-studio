import type { Look, SessionBase } from '../session.ts'
import type { Delivery } from '../voice/voice.ts'
import type { Scene } from '../3d/scene.ts'
import type { Figure } from '../3d/figure.ts'
import type { Picture } from '../pictures.ts'

export type { Figure, Scene }

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
   * then the player's to edit, before or after the scene begins. None in a Cast from before them.
   */
  truths?: string[]
  /**
   * The story's other People, a line each (name, then what the Scenario says of them): copied as
   * the Cast is first written (ADR 0032), then the player's to edit. They may act and speak briefly
   * in the Character's `actions`. None in a Cast from before them, or a story of two.
   */
  others?: string[]
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
  /**
   * What happened instead, when the judge found the Message broke one of the Truths (`judge.ts`);
   * the Character was told it with the Message.
   */
  outcome?: string
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

/** What the Music Director decides at a Frame (docs/music-plans.md). */
export const DECISIONS = ['continue', 'transition', 'silence'] as const
export type Decision = (typeof DECISIONS)[number]
/** How a change comes in: a crossfade, or a cut. Ignored when the music continues. */
export const ENTRIES = ['gentle', 'sharp'] as const
export type Entry = (typeof ENTRIES)[number]

/** The Music Director's reading of a Frame, and what it decided. */
export interface FrameMusic {
  /** The Cue this Frame plays under (`Cue.id`). */
  cue: string
  /** How the ground between the people stands now, and how it has moved since the Cue began. */
  reading: string
  decision: Decision
  entry: Entry
  /** The line that caused a change, quoted; '' when the music continues. */
  line: string
  /** The model that directed it, and seconds it took (the cue writer's too, on a change). */
  model: string
  timings: { text: number }
  /**
   * Directed by Score the Roleplay, with hindsight (`hindsight.ts`), rather than as it was played;
   * its timings are then the cue writer's alone, as the pass reads many Frames at once.
   */
  hindsight?: true
  /**
   * A stinger: a short accent placed here with hindsight, over the music playing, which goes on.
   * Recorded for now; played once there's music (docs/music-plans.md, stage 4).
   */
  stinger?: { reading: string; line: string }
}

export const ENERGIES = ['calm', 'restrained', 'building', 'intense'] as const
export const DENSITIES = ['sparse', 'layered', 'full'] as const
export const TEMPOS = ['slow', 'moderate', 'fast'] as const
/** What voices a Cue may have, as far as the Vocals setting lets it. */
export const CUE_VOCALS = ['none', 'wordless', 'choir'] as const
/** Which good caption a Cue's is made from (`prompts/roleplay/cue.md`). */
export const CUE_SHAPES = ['intimate', 'reflective', 'sacred', 'danger'] as const
/**
 * The keys a Cue may be in: each once, by its usual name, all of them ones ACE-Step's node takes
 * (it refuses others).
 */
export const CUE_KEYS = [
  'C major',
  'Db major',
  'D major',
  'Eb major',
  'E major',
  'F major',
  'Gb major',
  'G major',
  'Ab major',
  'A major',
  'Bb major',
  'B major',
  'C minor',
  'C# minor',
  'D minor',
  'Eb minor',
  'E minor',
  'F minor',
  'F# minor',
  'G minor',
  'G# minor',
  'A minor',
  'Bb minor',
  'B minor',
] as const

/** What the cue writer picks for a Cue, within the Score. */
export interface CueValues {
  /** Short phrases: the feeling and its texture. */
  mood: string
  energy: (typeof ENERGIES)[number]
  density: (typeof DENSITIES)[number]
  /** Turned into beats per minute within the Score's range (`bpmOf`). */
  tempo: (typeof TEMPOS)[number]
  /** Drawn from the Score's palette; one outside it is flagged in the Music tab, not refused. */
  instruments: string[]
  vocals: (typeof CUE_VOCALS)[number]
  /** A `danger` one, which the Text Model's words can't carry, takes `withDanger`'s words. */
  shape: (typeof CUE_SHAPES)[number]
  key: (typeof CUE_KEYS)[number]
  /** What the music model is told it sounds like and how it develops, in its own style (ADR 0035). */
  caption: string
  /** Section tags following the caption, with lines of vowels for any voices to sing. */
  lyrics: string
}

/**
 * A stretch of music over several Frames, from the Frame where it began until the next Cue: the
 * Score plus its values, or silence. Kept with the reading and the line that started it.
 */
export interface Cue {
  id: string
  /** The Frame it began on. */
  start: number
  /** Its music; none for a silence. */
  values?: CueValues
  /** How it came in. */
  entry: Entry
  /** The Director's reading at the Frame it began on, and the line that caused it ('' if none). */
  reading: string
  line: string
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
   * Each Subject's identity and the art style, shared by every picture (ADR 0012): written from the
   * Cast when a Frame is first pictured, and joined by anyone the story brings into a picture.
   */
  look?: Look | null
  /** For debugging: seconds the Look took to write, the model that wrote it, and its reasoning. */
  lookTimings?: { text: number }
  lookModel?: string
  lookThinking?: string
  /** The Character's voice; written the first time a line is spoken. */
  voice?: RoleplayVoice
  /**
   * The music's identity, shared by every Cue (docs/music-plans.md): written from the Cast, the
   * Brief, the Scenario's Music and the Music taste when asked for, or the first time the music is
   * directed; editable. Absent until then, and while Music is off.
   */
  score?: Score
  /** For debugging: seconds the Score took to write, the model that wrote it, and its reasoning. */
  scoreTimings?: { text: number }
  scoreModel?: string
  scoreThinking?: string
  /** The music's Cues, in the order of the Frames they began on (`director.ts`). */
  cues?: Cue[]
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
