import type { Head, HeadFinder, HeadRequest, SheetLook } from './heads.ts'
import type { Subject } from '../../shared/session.ts'

/** A sheet as a fit one is seen: three views, front to profile, a head each, nothing written. */
export const FIT_SHEET: SheetLook = {
  views: [
    { label: '', box: [0, 0, 333, 1000], facing: 'front' },
    { label: '', box: [333, 0, 666, 1000], facing: 'three-quarter left' },
    { label: '', box: [666, 0, 1000, 1000], facing: 'profile left' },
  ],
  heads: 3,
  writing: '',
  others: '',
}

/**
 * A head finder for tests: each `find` answers with the next of `found` (none left, none found),
 * each `lookOver` with the next of `looks` (none left, a fit sheet); it records what it was asked.
 */
export function fakeHeadFinder(
  script: { found?: Head[][]; looks?: SheetLook[] } = {},
): HeadFinder & {
  asked: (HeadRequest & { who?: Subject })[]
} {
  const found = [...(script.found ?? [])]
  const looks = [...(script.looks ?? [])]
  const finder = {
    asked: [] as (HeadRequest & { who?: Subject })[],
    find(req: HeadRequest & { who: Subject }, signal: AbortSignal) {
      finder.asked.push(req)
      signal.throwIfAborted()
      return Promise.resolve(found.shift() ?? [])
    },
    lookOver(req: HeadRequest & { who: Subject }, signal: AbortSignal) {
      finder.asked.push(req)
      signal.throwIfAborted()
      return Promise.resolve(looks.shift() ?? FIT_SHEET)
    },
  }
  return finder
}
