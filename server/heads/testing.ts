import type { Head, HeadFinder, HeadRequest } from './heads.ts'
import type { Subject } from '../../shared/session.ts'

/**
 * A head finder for tests: each `find` answers with the next of `found` (none left, none found),
 * each `count` with the next of `counted`; it records what it was asked.
 */
export function fakeHeadFinder(
  script: { found?: Head[][]; counted?: Head[][] } = {},
): HeadFinder & {
  asked: (HeadRequest & { who?: Subject })[]
} {
  const found = [...(script.found ?? [])]
  const counted = [...(script.counted ?? [])]
  const finder = {
    asked: [] as (HeadRequest & { who?: Subject })[],
    find(req: HeadRequest & { who: Subject }, signal: AbortSignal) {
      finder.asked.push(req)
      signal.throwIfAborted()
      return Promise.resolve(found.shift() ?? [])
    },
    count(req: HeadRequest, signal: AbortSignal) {
      finder.asked.push(req)
      signal.throwIfAborted()
      return Promise.resolve(counted.shift() ?? [])
    },
  }
  return finder
}
