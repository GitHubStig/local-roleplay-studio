import { fromFileUrl, join } from '@std/path'

const WEB = fromFileUrl(new URL('../../web/', import.meta.url))

/**
 * The exported comparison page, built fresh (`deno task build:export` in `web/`, a fraction of a
 * second) so it always matches the Compare dialog: one HTML file, its script and styles inlined.
 */
export async function buildComparisonPage(): Promise<string> {
  const { success, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ['task', 'build:export'],
    cwd: WEB,
    stdout: 'null',
    stderr: 'piped',
  }).output()
  if (!success) {
    throw new Error(`Building the export page failed: ${new TextDecoder().decode(stderr).trim()}`)
  }
  return await Deno.readTextFile(join(WEB, 'dist-export', 'export.html'))
}
