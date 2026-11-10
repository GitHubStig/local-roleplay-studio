/**
 * What a Chain's and a Storyboard's system messages share. The prompts are Markdown files in
 * `prompts/chain/`, `prompts/storyboard/` and `prompts/shared/` (`promptFiles.ts`).
 */
import { PROMPT_ORDER } from './imagePrompt.ts'
import { factsOf, truthsOf } from './scenario.ts'
import type { Scenario } from '../shared/scenario.ts'
import { limitsEnabled } from './limits.ts'
import { loadPrompt } from './promptFiles.ts'
import { BODY_ASPECTS } from './frameBody.ts'

/** The parts both Chains and Storyboards include: the format, how to replace, the Limits. */
export async function sharedParts() {
  const aspects = PROMPT_ORDER.map((p, i) => `${i + 1}. ${p.aspect}: ${p.covers}.`).join('\n')
  return {
    format: await loadPrompt('shared/format', { aspects }),
    // As a list item: its lines indented under the bullet.
    replacing: (await loadPrompt('shared/replacing')).replaceAll('\n', '\n  '),
    limits: limitsEnabled() ? await loadPrompt('shared/limits') : '',
    body: BODY_ASPECTS.join(', '),
    placeAlone: await loadPrompt('shared/place-alone'),
    eachPerson: await loadPrompt('shared/each-person'),
    identity: await loadPrompt('shared/identity'),
    shown: await loadPrompt('shared/shown'),
  }
}

/** A system message, with the Scenario's Truths and (if `withFacts`) its facts after it. */
export async function withNotes(rules: string, scenario: Scenario, withFacts: boolean) {
  const parts = [rules]
  const truths = truthsOf(scenario)
  if (truths) parts.push(await loadPrompt('shared/scenario-truths', { truths }))
  const facts = withFacts ? factsOf(scenario) : ''
  if (facts) parts.push(await loadPrompt('shared/scenario-facts', { facts }))
  return parts.join('\n\n')
}
