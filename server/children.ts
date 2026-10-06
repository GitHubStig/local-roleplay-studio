/**
 * Child processes the server starts (mflux renders, the voice service), killed if the server stops
 * or restarts so the GPU memory they hold is freed.
 */
const running = new Set<Deno.ChildProcess>()

function killAll() {
  for (const child of running) {
    try {
      child.kill()
    } catch {
      // Already exited.
    }
  }
}

let cleanupInstalled = false
function installCleanup() {
  if (cleanupInstalled) return
  cleanupInstalled = true
  // `deno run --watch` fires `unload` when it restarts the server; Ctrl+C and kill don't.
  globalThis.addEventListener('unload', killAll)
  // Windows has no SIGTERM to listen for (Deno allows only SIGINT and SIGBREAK there).
  const signals = Deno.build.os === 'windows'
    ? ['SIGINT', 'SIGBREAK'] as const
    : ['SIGINT', 'SIGTERM'] as const
  for (const signal of signals) {
    Deno.addSignalListener(signal, () => {
      killAll()
      Deno.exit(signal === 'SIGINT' ? 130 : 143)
    })
  }
}

/** Kills `child` along with the server; forgets it once it exits. */
export function track(child: Deno.ChildProcess): Deno.ChildProcess {
  installCleanup()
  running.add(child)
  child.status.finally(() => running.delete(child))
  return child
}
