/**
 * The Compare dialog's export as a job of its Session (`export`), so it waits its turn, shows its
 * progress in the queue and carries on with the dialog closed. What it writes is saved in the
 * Session's folder as it's queued (`EXPORT_ORDER`), as an edit's painted area is, rather than in
 * the queue, which every poll of it sends; the job reads it as it runs and deletes it once done.
 */
import { join } from '@std/path'
import type { ComparisonExport } from '../../shared/comparison.ts'
import type { Job } from '../../shared/jobs.ts'
import type { Session } from '../../shared/session.ts'
import type { JobEmit } from '../jobs.ts'
import { removeFiles } from '../pictures.ts'
import {
  comparisonTitle,
  type ExportPage,
  parseComparisonExport,
  writeComparison,
} from './comparison.ts'

/**
 * What a Session's export writes, in its folder: one file, as a Session has one export at a time,
 * which a later one asked for before it starts replaces.
 */
export const EXPORT_ORDER = 'export.json'

/** Saves what an export of the Session in `sessionDir` writes, for its job to read. */
export const saveExportOrder = (sessionDir: string, comparison: ComparisonExport) =>
  Deno.writeTextFile(join(sessionDir, EXPORT_ORDER), JSON.stringify(comparison))

/** Deletes what an export was to write, once it's done or dropped. */
export const removeExportOrder = (sessionDir: string) => removeFiles(sessionDir, [EXPORT_ORDER])

/**
 * Writes `job`'s export of `session` into its folder (`Job.export`), from the order saved as it
 * was queued, reporting each picture written; then deletes the order. A failed one keeps it, to
 * retry.
 */
export async function runExport(
  deps: { sessionDir: string; page: () => Promise<ExportPage> },
  session: Session,
  job: Job,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  const text = await Deno.readTextFile(join(deps.sessionDir, EXPORT_ORDER)).catch((err) => {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error('What to export is gone: export again from the Compare dialog')
    }
    throw err
  })
  const comparison = parseComparisonExport(JSON.parse(text))
  if (typeof comparison === 'string') throw new Error(comparison)
  emit({ type: 'phase', phase: 'image' })
  await writeComparison(
    deps.sessionDir,
    job.export!.folder,
    await deps.page(),
    comparison,
    comparisonTitle(new Date(), session.seed),
    { written: (step, total) => emit({ type: 'progress', step, total }), signal },
  )
  await removeExportOrder(deps.sessionDir)
}
