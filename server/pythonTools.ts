import { fromFileUrl, join } from '@std/path'

/** The Python tools that ship with the app (`python/`), one folder each. */
export const SHIPPED_PYTHON = fromFileUrl(new URL('../python/', import.meta.url))

/** How a tool run once per job (`runModelScript`) is started. */
export interface ToolOptions {
  /** Replaces `uv run <script>`, in tests. */
  command?: string[]
  /** The folder the Python tools run from; the shipped one unless given. */
  python?: string
}

/** A tool's script in the folder the tools run from, as `uv run` is given it. */
export const pythonScript = (python: string, tool: string, file = 'make.py') =>
  join(python, tool, file)

/**
 * Copies the shipped Python tools to `to`, replacing what's there, so `uv` can run them: in an
 * installed app they're inside the executable, where only Deno can read them, and a script's lock
 * and `vendor/` folder must sit beside it. Done at every start, so a new version's scripts replace
 * the old. Read and written file by file, as `Deno.copyFile` can't read from inside the executable.
 */
export async function copyPythonTools(to: string, from = SHIPPED_PYTHON): Promise<string> {
  const fresh = `${to}.new`
  await Deno.remove(fresh, { recursive: true }).catch(() => {})
  await copyTree(from, fresh)
  await Deno.remove(to, { recursive: true }).catch((err) => {
    if (!(err instanceof Deno.errors.NotFound)) throw err
  })
  await Deno.rename(fresh, to)
  return to
}

async function copyTree(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true })
  for await (const entry of Deno.readDir(from)) {
    if (entry.name === '__pycache__') continue
    const [source, target] = [join(from, entry.name), join(to, entry.name)]
    if (entry.isDirectory) await copyTree(source, target)
    else await Deno.writeFile(target, await Deno.readFile(source))
  }
}
