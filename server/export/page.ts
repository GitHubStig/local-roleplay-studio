import { fromFileUrl, join } from '@std/path'
import type { ExportPage } from './comparison.ts'

const WEB = fromFileUrl(new URL('../../web/', import.meta.url))

/** The page as last built (`deno task build:export` in `web/`), as an installed app ships it. */
export async function builtComparisonPage(dir = join(WEB, 'dist-export')): Promise<ExportPage> {
  const built = (file: string) => Deno.readTextFile(join(dir, file))
  return { html: await built('export.html'), plot: await built('plot.js') }
}

/**
 * The exported comparison page, built fresh (`deno task build:export` in `web/`, a fraction of a
 * second) so it always matches the Compare dialog: one HTML file, its script and styles inlined,
 * and Observable Plot beside it as `plot.js`, for an export with style scores. From a clone only:
 * an installed app has no `web/` or Vite, and reads the page built with it (`builtComparisonPage`).
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
  return builtComparisonPage()
}
