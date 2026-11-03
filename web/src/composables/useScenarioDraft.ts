import { computed } from 'vue'
import type { Scenario, Suggestion } from '../api'
import { useStoredString } from './storage'

/** What the Scenario page was opened on: a Scenario's id, or a typed Brief. */
export type ScenarioSource = { scenarioId: string } | { brief: string }

/**
 * The Scenario being set up on the Scenario page, as edited so far, with Expand's suggestions not
 * yet taken. Remembered per browser, so leaving the page (or reloading it) keeps the edits, and
 * the header leads back to it, as it does to the current Session.
 */
export interface ScenarioDraft {
  from: ScenarioSource
  /** Null until it's loaded, or (for a Brief) expanded. */
  scenario: Scenario | null
  suggestions: Suggestion[]
}

const stored = useStoredString('scenario-draft')

const draft = computed<ScenarioDraft | null>(() => {
  try {
    return stored.value ? JSON.parse(stored.value) : null
  } catch {
    return null
  }
})

export const sameSource = (a: ScenarioSource, b: ScenarioSource) =>
  'brief' in a
    ? 'brief' in b && a.brief === b.brief
    : 'scenarioId' in b && a.scenarioId === b.scenarioId

/** Where the Scenario page opens on a source. */
export const scenarioPagePath = (from: ScenarioSource) =>
  'brief' in from
    ? { name: 'scenario', query: { brief: from.brief } }
    : { name: 'scenario', params: { id: from.scenarioId } }

export function saveScenarioDraft(value: ScenarioDraft) {
  stored.value = JSON.stringify(value)
}

/** Forgets it: its Session has started. */
export function clearScenarioDraft() {
  stored.value = null
}

export function useScenarioDraft() {
  return { scenarioDraft: draft }
}
