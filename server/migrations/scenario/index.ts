/**
 * A Scenario file's versions (ADR 0041): its frontmatter's `version`, read through
 * `scenarioFile.migrate` (`parseScenario`) and written by `scenarioFileText` (`server/scenario.ts`).
 * A change to what a Scenario file holds needs a version: a `vN.ts` copied from the last, its step,
 * and `.then(vN)` below.
 */
import type { ScenarioSource } from '../../scenario.ts'
import { type Migrations, migrations } from '../migrate.ts'
import { v1 } from './v1.ts'

export const scenarioFile: Migrations<ScenarioSource> = migrations()
  .then(v1)
  .done((doc): ScenarioSource => doc)
