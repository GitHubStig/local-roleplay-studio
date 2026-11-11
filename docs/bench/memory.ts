/**
 * Memory for benches: the RAM free for new work, and peaks over a run, the same way on every OS.
 *
 * Deno's `systemMemoryInfo().available` is filled in only on Linux and macOS; on Windows it is
 * always 0, which has read as "no RAM free" in more than one bench. There, `free` is Windows' own
 * available memory (it matched the `\Memory\Available Bytes` counter to within 20 MB, 2026-11-11,
 * the Windows PC).
 */

/** Bytes of RAM free for new work, standby cache included. */
export function availableRam(): number {
  const info = Deno.systemMemoryInfo()
  return Deno.build.os === 'windows' ? info.free : info.available
}

/** What `watchMemory` saw since it started or was last reset. */
export interface MemoryPeaks {
  /** The least RAM available, in bytes. */
  leastRam: number
  /** The most VRAM in use on the first NVIDIA card, in MiB; undefined without `nvidia-smi` (a Mac). */
  peakVramMiB?: number
}

/**
 * Samples RAM, and VRAM where `nvidia-smi` runs, every `everyMs` until stopped. `reset()` starts a
 * new window (one per run) and returns what the last one saw.
 */
export function watchMemory(everyMs = 250) {
  let leastRam = Infinity
  let peakVram: number | undefined
  const ram = setInterval(() => leastRam = Math.min(leastRam, availableRam()), everyMs)
  let smi: Deno.ChildProcess | undefined
  try {
    smi = new Deno.Command('nvidia-smi', {
      // The first card, the one ComfyUI and Ollama use here.
      args: [
        '-i',
        '0',
        '--query-gpu=memory.used',
        '--format=csv,noheader,nounits',
        '-lms',
        String(everyMs),
      ],
      stdout: 'piped',
      stderr: 'null',
    }).spawn()
  } catch {
    // No NVIDIA card here.
  }
  if (smi) {
    ;(async () => {
      let rest = ''
      for await (const chunk of smi.stdout.pipeThrough(new TextDecoderStream())) {
        const lines = (rest + chunk).split('\n')
        rest = lines.pop()!
        for (const line of lines) {
          const used = Number(line.trim())
          if (line.trim() && Number.isFinite(used)) peakVram = Math.max(peakVram ?? 0, used)
        }
      }
    })()
  }
  return {
    reset(): MemoryPeaks {
      const seen = { leastRam: Math.min(leastRam, availableRam()), peakVramMiB: peakVram }
      leastRam = Infinity
      peakVram = smi ? 0 : undefined
      return seen
    },
    stop() {
      clearInterval(ram)
      try {
        smi?.kill()
      } catch {
        // Already gone.
      }
    },
  }
}
