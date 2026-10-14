/**
 * The Python programs the server runs once per piece of work, through uv: the 3D ones (SHARP,
 * TripoSplat, LiTo) and the style scores' embeddings.
 */
import { track } from './children.ts'

/**
 * Runs one of the Python scripts (`uv run python/<tool>/make.py …`) to completion and returns the
 * JSON on its last line. `onDownload` hears the script's "Downloading <name>" and "Downloaded"
 * lines, printed while it fetches its weights the first time; `onLine`, every line it prints on
 * stderr (such as its progress).
 */
export async function runModelScript(
  command: string[],
  args: string[],
  name: string,
  signal: AbortSignal,
  onDownload?: (downloading: boolean) => void,
  onLine?: (line: string) => void,
): Promise<Record<string, unknown>> {
  const [cmd, ...rest] = command
  const child = track(
    new Deno.Command(cmd, {
      args: [...rest, ...args],
      stdout: 'piped',
      stderr: 'piped',
      signal,
    }).spawn(),
  )
  const stdout = new Response(child.stdout).text()
  let stderr = ''
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr = (stderr + chunk).slice(-8000)
    for (const line of chunk.split(/[\r\n]+/)) {
      if (line === `Downloading ${name}`) onDownload?.(true)
      if (line === 'Downloaded') onDownload?.(false)
      if (line) onLine?.(line)
    }
  }
  const { success } = await child.status
  signal.throwIfAborted()
  if (!success) {
    const why = stderr.trim().split(/[\r\n]+/).at(-1) || 'no output'
    throw new Error(`${name} failed (needs uv; see README): ${why}`)
  }
  return JSON.parse((await stdout).trim().split('\n').at(-1)!)
}
