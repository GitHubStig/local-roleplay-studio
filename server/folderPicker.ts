/** The machine's own folder dialog, for choosing a folder by its full path. */

const PROMPT = 'Choose the folder to keep Sessions in'

/** The command that opens the dialog and prints the folder chosen. */
function command(os: typeof Deno.build.os): string[] | undefined {
  if (os === 'darwin') {
    return ['osascript', '-e', `POSIX path of (choose folder with prompt "${PROMPT}")`]
  }
  if (os === 'windows') {
    return [
      'powershell',
      '-NoProfile',
      '-STA',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; ' +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${PROMPT}'; ` +
      'if ($d.ShowDialog() -eq "OK") { $d.SelectedPath }',
    ]
  }
  return ['zenity', '--file-selection', '--directory', `--title=${PROMPT}`]
}

/** Opens the dialog; the folder chosen, or null if the player cancels. */
export async function pickFolder(os = Deno.build.os): Promise<string | null> {
  const [cmd, ...args] = command(os)!
  let out: Deno.CommandOutput
  try {
    out = await new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' }).output()
  } catch {
    throw new Error(`Couldn't open a folder dialog (${cmd} is missing)`)
  }
  const chosen = new TextDecoder().decode(out.stdout).trim()
  if (out.success) return chosen || null
  // Cancelling ends osascript with "User canceled" and zenity with nothing; anything else is a failure.
  const said = new TextDecoder().decode(out.stderr).trim()
  if (!said || /cancel/i.test(said)) return null
  throw new Error(`The folder dialog failed: ${said.split('\n').at(-1)}`)
}
