/** A stand-in for LTX 2.5, for tests. */
import { join } from '@std/path'
import type { ClipRequest, VideoGenerator } from './videoGenerator.ts'

/** Stands in for LTX 2.5 in tests: writes a tiny file naming its pictures. */
export function fakeVideoGenerator(opts: { fail?: string } = {}): VideoGenerator & {
  made: ClipRequest[]
} {
  const made: ClipRequest[] = []
  return {
    made,
    async makeClip(req, signal, onProgress) {
      signal.throwIfAborted()
      made.push(req)
      onProgress?.(1, 2)
      if (opts.fail) throw new Error(opts.fail)
      const file = `${req.name}.mp4`
      await Deno.writeTextFile(join(req.dir, file), `mp4 fake clip of ${req.first} to ${req.last}`)
      return file
    },
  }
}
