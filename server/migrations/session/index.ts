/**
 * `session.json`'s versions (ADR 0041): read through `sessionFile.migrate`, saved through
 * `sessionFile.stamp` (`server/session.ts`). A change to `shared/session.ts` (or a type it uses)
 * that old files don't fit fails to type-check here until it has a version: a `vN.ts` copied from
 * the last, its step, and `.then(vN)` below.
 */
import type { Session } from '../../../shared/session.ts'
import { type Migrations, migrations } from '../migrate.ts'
import { v1 } from './v1.ts'

export const sessionFile: Migrations<Session> = migrations()
  .then(v1)
  .done((doc): Session => doc)
