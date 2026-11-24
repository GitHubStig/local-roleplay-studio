/** How much room is left on a drive, which Deno has no call for: asked of the OS. */

/** The command that prints the free bytes (Windows) or a `df` table (elsewhere) for `path`. */
function command(path: string, os: typeof Deno.build.os): [string, string[]] {
  if (os === 'windows') {
    // A path's drive, by .NET; the path goes in as an argument, never into the script's text.
    const script =
      '([System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($args[0]))).AvailableFreeSpace'
    return ['powershell', ['-NoProfile', '-Command', `& { ${script} }`, path]]
  }
  return ['df', ['-Pk', path]]
}

/** Reads what `command` printed: bytes free, or null if it can't be read. */
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
  const [cmd, args] = command(path, os)
  try {
    const out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'null' }).output()
    return out.success ? parseFree(new TextDecoder().decode(out.stdout), os) : null
  } catch {
    return null
  }
}
