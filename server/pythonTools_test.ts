import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { withTempDir } from './testing.ts'
import { copyPythonTools, pythonScript, SHIPPED_PYTHON } from './pythonTools.ts'

/** Every file under `dir`, relative to it. */
async function files(dir: string, under = ''): Promise<string[]> {
  const found: string[] = []
  for await (const e of Deno.readDir(join(dir, under))) {
    const path = under ? `${under}/${e.name}` : e.name
    found.push(...(e.isDirectory ? await files(dir, path) : [path]))
  }
  return found.sort()
}

Deno.test("The shipped tools are copied out with their locks and vendor code, and replace the last version's", () =>
  withTempDir(async (dir) => {
    const from = join(dir, 'shipped')
    await Deno.mkdir(join(from, 'tool', 'vendor', '__pycache__'), { recursive: true })
    await Deno.writeTextFile(join(from, 'tool', 'make.py'), 'print(2)')
    await Deno.writeTextFile(join(from, 'tool', 'make.py.lock'), 'lock')
    await Deno.writeTextFile(join(from, 'tool', 'vendor', 'lib.py'), 'x = 1')
    await Deno.writeTextFile(join(from, 'tool', 'vendor', '__pycache__', 'lib.pyc'), '')
    const to = join(dir, 'python')
    await Deno.mkdir(join(to, 'gone'), { recursive: true })
    await Deno.writeTextFile(join(to, 'gone', 'make.py'), 'print(1)')

    assertEquals(await copyPythonTools(to, from), to)
    assertEquals(await files(to), ['tool/make.py', 'tool/make.py.lock', 'tool/vendor/lib.py'])
    assertEquals(await Deno.readTextFile(pythonScript(to, 'tool')), 'print(2)')
  }))

Deno.test('Each tool the server runs is shipped, with its lock', async () => {
  for (
    const [tool, file] of [['sharp'], ['triposplat'], ['lito'], ['style'], ['voice', 'serve.py']]
  ) {
    const script = pythonScript(SHIPPED_PYTHON, tool, file)
    await Deno.stat(script)
    await Deno.stat(`${script}.lock`)
  }
})
