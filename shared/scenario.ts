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
