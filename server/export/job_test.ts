import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import type { Job } from '../../shared/jobs.ts'
import type { Session } from '../../shared/session.ts'
import { withTempDir } from '../testing.ts'
import { EXPORT_ORDER, EXPORT_ORDER_VERSION, runExport, saveExportOrder } from './job.ts'

const job = { id: 'j1', kind: 'export', export: { folder: 'out' } } as Job
const session = { seed: 1 } as Session
const page = () => Promise.resolve({ html: '', plot: '' })

Deno.test('An export order says its version; one of another version is refused, kept to see', () =>
  withTempDir(async (dir) => {
    await saveExportOrder(dir, { models: [], rows: [] })
    const path = join(dir, EXPORT_ORDER)
    assertEquals(JSON.parse(await Deno.readTextFile(path)), {
      version: EXPORT_ORDER_VERSION,
      models: [],
      rows: [],
    })
    const newer = JSON.stringify({ version: EXPORT_ORDER_VERSION + 1, models: [], rows: [] })
    await Deno.writeTextFile(path, newer)
    await assertRejects(
      () =>
        runExport(
          { sessionDir: dir, page },
          session,
          job,
          () => {},
          new AbortController().signal,
        ),
      Error,
      'saved by another version of the app: export again',
    )
    assertEquals(await Deno.readTextFile(path), newer)
  }))
