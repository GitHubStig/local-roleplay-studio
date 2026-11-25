/** How much room is left on a drive, which Deno has no call for: asked of the OS. */
import { resolve } from '@std/path'

/**
 * The command that prints the free bytes (Windows) or a `df` table (elsewhere) for `path`, and the
 * environment it runs in. PowerShell joins whatever follows `-Command` into its script, so the path
 * goes in by the environment, never into the script's text: a space can't split it, nor a `;` run.
 */
export function freeSpaceCommand(
  path: string,
  os: typeof Deno.build.os,
): [string, string[], Record<string, string>] {
  if (os === 'windows') {
    const script =
      '([System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($env:LRS_FREE_PATH))).AvailableFreeSpace'
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      LRS_FREE_PATH: path,
    }]
  }
  // `--` so no path can be read as an option.
  return ['df', ['-Pk', '--', path], {}]
}

/** Reads what `freeSpaceCommand` printed: bytes free, or null if it can't be read. */
export function parseFree(out: string, os: typeof Deno.build.os): number | null {
  if (os === 'windows') {
    const n = Number(out.trim())
    return out.trim() && Number.isFinite(n) ? n : null
  }
  // `df -P`: a header, then the filesystem's line, whose fourth column is the KiB available.
  const line = out.trim().split('\n')[1]
  const kib = Number(line?.trim().split(/\s+/)[3])
  return Number.isFinite(kib) ? kib * 1024 : null
}

/** Bytes free on the drive holding `path` (a folder that exists), or null if the OS won't say. */
export async function freeSpace(path: string, os = Deno.build.os): Promise<number | null> {
  // Windows finds the drive from the path's root, which a relative path hasn't.
  const [cmd, args, env] = freeSpaceCommand(resolve(path), os)
  try {
    const out = await new Deno.Command(cmd, { args, env, stdout: 'piped', stderr: 'null' }).output()
    return out.success ? parseFree(new TextDecoder().decode(out.stdout), os) : null
  } catch {
    return null
  }
}
