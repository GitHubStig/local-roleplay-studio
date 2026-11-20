import { assertEquals, assertRejects } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from '../testing.ts'
import { builtComparisonPage } from './page.ts'

Deno.test('An installed app reads the export page it was built with', () =>
  withTempDir(async (dir) => {
    await Deno.writeTextFile(join(dir, 'export.html'), '<table></table>')
    await Deno.writeTextFile(join(dir, 'plot.js'), 'export {}')
    assertEquals(await builtComparisonPage(dir), { html: '<table></table>', plot: 'export {}' })
    await Deno.remove(join(dir, 'plot.js'))
    await assertRejects(() => builtComparisonPage(dir), Deno.errors.NotFound)
  }))
