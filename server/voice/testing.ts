/** A stand-in for a voice engine, for tests. */
import type { DesignRequest, SpeakRequest, VoiceEngine, VoiceProfile } from './voice.ts'

/** Stands in for the voice service in tests: writes a tiny WAV naming what it would say. */
export function fakeVoiceEngine(
  opts: { fail?: string; profile?: VoiceProfile } = {},
): VoiceEngine & {
  calls: { kind: 'design' | 'speak'; req: DesignRequest | SpeakRequest }[]
} {
  const calls: { kind: 'design' | 'speak'; req: DesignRequest | SpeakRequest }[] = []
  const write = async (
    kind: 'design' | 'speak',
    req: DesignRequest | SpeakRequest,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted()
    calls.push({ kind, req })
    if (opts.fail) throw new Error(opts.fail)
    await Deno.writeTextFile(req.out, `RIFF fake ${kind}: ${req.text}`)
  }
  return {
    calls,
    profile: () => Promise.resolve(opts.profile ?? { ref: 'wav', speech: 'mp3', heavy: false }),
    design: (req, signal) => write('design', req, signal),
    speak: (req, signal) => write('speak', req, signal),
  }
}
