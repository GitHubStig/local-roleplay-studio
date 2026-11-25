/**
 * The machine's own folder windows: its dialog, for choosing a folder by its full path, and its file
 * manager, showing one.
 */

const PROMPT = 'Choose the folder to keep Sessions in'

/** The command that opens the dialog and prints the folder chosen. */
function command(os: typeof Deno.build.os): string[] | undefined {
  if (os === 'darwin') {
    return ['osascript', '-e', `POSIX path of (choose folder with prompt "${PROMPT}")`]
  }
  if (os === 'windows') {
    // Windows keeps a background process's window behind the browser the player just clicked in,
    // so the dialog is shown over an invisible window of its own, made topmost once the dialog is
    // open (by a timer, which ticks in the dialog's loop): that makes the windows it owns topmost too.
    return [
      'powershell',
      '-NoProfile',
      '-STA',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; ' +
      '$o = New-Object System.Windows.Forms.Form -Property @{ Opacity = 0; ShowInTaskbar = $false }; ' +
      '$o.Show(); $t = New-Object System.Windows.Forms.Timer -Property @{ Interval = 200 }; ' +
      '$t.add_Tick({ $t.Stop(); $o.TopMost = $true; $o.Activate() }); $t.Start(); ' +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${PROMPT}'; ` +
      'if ($d.ShowDialog($o) -eq "OK") { $d.SelectedPath }',
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

/** The command that shows a folder in the machine's file manager. */
function opener(os: typeof Deno.build.os): string {
  return os === 'darwin' ? 'open' : os === 'windows' ? 'explorer' : 'xdg-open'
}

/** Shows folder `path` in the machine's file manager: Finder, Explorer, or the desktop's own. */
export async function openFolder(path: string, os = Deno.build.os): Promise<void> {
  const cmd = opener(os)
  let out: Deno.CommandOutput
  try {
    out = await new Deno.Command(cmd, { args: [path], stdout: 'null', stderr: 'piped' }).output()
  } catch {
    throw new Error(`Couldn't open the folder (${cmd} is missing)`)
  }
  // Explorer ends with 1 even when it opened the folder.
  if (out.success || os === 'windows') return
  const said = new TextDecoder().decode(out.stderr).trim()
  throw new Error(`Couldn't open the folder: ${said.split('\n').at(-1) || `${cmd} failed`}`)
}
