/**
 * `queue.json`'s versions (ADR 0041): read through `queueFile.migrate`, saved through
 * `queueFile.stamp` (`server/queueStore.ts`). A change to `shared/jobs.ts` (or a type it uses)
 * that old files don't fit fails to type-check here until it has a version: a `vN.ts` copied from
 * the last, its step, and `.then(vN)` below.
 */
import type { QueueFile } from '../../queueStore.ts'
import { type Migrations, migrations } from '../migrate.ts'
import { v1 } from './v1.ts'
import { v2 } from './v2.ts'

export const queueFile: Migrations<QueueFile> = migrations()
  .then(v1)
  .then(v2)
  .done((doc): QueueFile => doc)
