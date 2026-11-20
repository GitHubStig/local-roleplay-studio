/**
 * A Scenario file at version 1 (2026-11-20): as Scenario files were before versions began, now
 * numbered: its frontmatter (its `version` aside) and its Markdown body. Players write these by
 * hand as often as the app does, so neither is typed further than this: `parseScenario` checks
 * every key and section of the latest version, saying what's wrong. A step that changes a key or a
 * section works on these, and the next version copies this file and marks what it changes (ADR
 * 0041).
 */

interface ScenarioFile {
  front: Record<string, unknown>
  body: string
}

export type V1 = ScenarioFile

/** A file from before versions: already this shape, so only numbered. */
export const v1 = (doc: unknown): V1 => doc as V1
