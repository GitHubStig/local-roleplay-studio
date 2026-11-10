/**
 * What every kind of Session has: a Look, an outcome, timings. Shared by the server and the web
 * app: types and plain values only.
 */

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
