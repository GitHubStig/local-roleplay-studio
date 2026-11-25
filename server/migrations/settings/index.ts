/**
 * `settings.json`'s versions (ADR 0041): read through `settingsFile.migrate`, saved through
 * `settingsFile.stamp` (`server/settings.ts`). A change to `shared/settings.ts` (or a type it uses)
 * that old files don't fit fails to type-check here until it has a version: a `vN.ts` copied from
 * the last, its step, and `.then(vN)` below.
 */
import type { SettingsFile } from '../../settings.ts'
import { type Migrations, migrations } from '../migrate.ts'
import { v1 } from './v1.ts'
import { v2 } from './v2.ts'
import { v3 } from './v3.ts'

export const settingsFile: Migrations<SettingsFile> = migrations()
  .then(v1)
  .then(v2)
  .then(v3)
  .done((doc): SettingsFile => doc)
