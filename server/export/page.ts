import { fromFileUrl, join } from '@std/path'
import type { ExportPage } from './comparison.ts'

const WEB = fromFileUrl(new URL('../../web/', import.meta.url))

/**
 * The exported comparison page, built fresh (`deno task build:export` in `web/`, a fraction of a
 * second) so it always matches the Compare dialog: one HTML file, its script and styles inlined,
 * and Observable Plot beside it as `plot.js`, for an export with style scores.
 */
export async function buildComparisonPage(): Promise<ExportPage> {
  const { success, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ['task', 'build:export'],
    cwd: WEB,
    stdout: 'null',
    stderr: 'piped',
  }).output()
  if (!success) {
    throw new Error(`Building the export page failed: ${new TextDecoder().decode(stderr).trim()}`)
  }
  const built = (file: string) => Deno.readTextFile(join(WEB, 'dist-export', file))
  return { html: await built('export.html'), plot: await built('plot.js') }
}
