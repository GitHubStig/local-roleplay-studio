/**
 * A Scenario's People, its summary on Home, and Expand's suggestions. Shared by the server and the
 * web app: types and plain values only.
 */

/** Anyone the story treats as someone: a human, an alien, a monster, a talking car. */
export interface Person {
  /** From the name (`personId`): what the Scenario's `player` and `character` name. */
  id: string
  name: string
  /** Permanent features (age, build, skin, hair, face), in no art style. */
  looks: string
  /** What they have on at the start. */
  wears: string
  personality: string
  /** Their way of speaking. */
  speaks: string
  background: string
  /** What they want in this story, and what drives them. */
  goal: string
  /** What holds about them whatever anyone does, whoever plays them. */
  truths: string[]
}

export interface ScenarioSummary {
  id: string
  title: string
  description: string
  /** In the player's `scenarios/`, so it can be deleted. */
  own: boolean
  created?: string
  modified?: string
}

export interface ScenarioLoadError {
  file: string
  message: string
}

/**
 * A suggestion for a blank part, for the player to take or leave. `field` names it from the
 * Scenario's type: `place`, `truths`, `people.<id>.goal`.
 */
export interface Suggestion {
  field: string
  text: string
}

/**
 * A Scenario: a story a Session starts from (ADR 0032). What it states holds; what it leaves blank
 * ('' or empty) is the Text Model's to invent. Saved as Markdown (`example-scenarios/*.md`,
 * `docs/scenarios.md`): `scenarioMarkdown` writes it, `parseScenario` reads it back.
 */
export interface Scenario {
  /** File name without extension, e.g. `tavern`. */
  id: string
  title: string
  description: string
  /** The situation when the story starts; the only part a Scenario must have. */
  opening: string
  place: string
  /** The time of day, and the weather. */
  time: string
  /** The art style every picture is made in; '' for the Look to pick one. */
  style: string
  /**
   * What the story's music is like; '' for the Text Model to pick (docs/design.md).
   */
  music: string
  /** What holds about the story whatever anyone does. */
  truths: string[]
  people: Person[]
  /** The id of the Person the player plays by default in a Roleplay. */
  player?: string
  /** The id of the Person the Text Model plays by default in a Roleplay. */
  character?: string
  /** When the file was first saved, as an ISO date; from the file's own dates when it doesn't say. */
  created?: string
  /** When it was last saved, likewise. */
  modified?: string
}
