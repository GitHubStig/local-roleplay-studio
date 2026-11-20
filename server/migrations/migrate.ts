/**
 * Migrates a data file to the latest version as it's read (ADR 0041). Each kind of file has a
 * chain of steps, one per version (`session/v1.ts`…), and its `index.ts` puts them together:
 *
 *   export const sessionFile = migrations().then(v1).then(v2).done((doc): Session => doc)
 *
 * A file's `version` is how many steps it has had; one without it is version 0. The runner, not a
 * step, says which version a step makes: its place in the chain.
 */

type Leaf = string | number | boolean | bigint | symbol | null | undefined

/** The members of union `B` that `A` fits. */
type Matching<A, B> = B extends unknown ? ([A] extends [B] ? B : never) : never

/** Every key of every member of `B`. */
type KeysOf<B> = B extends unknown ? keyof B : never

/** `B[K]` across the members of `B` that have `K`. */
type At<B, K> = B extends unknown ? (K extends keyof B ? B[K] : never) : never

type Prefixed<K extends string, P> = P extends string ? `${K}.${P}` : never

/**
 * The fields of `A` that `B` has no place for, as dotted paths ("frames.look"), however deep;
 * never when there are none. A field the app dropped fits it still (extra fields are allowed), so
 * this is what says a file would keep carrying one.
 */
export type Dropped<A, B> = A extends Leaf ? never
  : A extends readonly (infer E)[]
    ? Dropped<E, NonNullable<B> extends readonly (infer F)[] ? F : never>
  : A extends object ? DroppedIn<A, Matching<A, B>>
  : never

type DroppedIn<A, B> = {
  [K in keyof A & string]-?: K extends KeysOf<B>
    ? Prefixed<K, Dropped<NonNullable<A[K]>, NonNullable<At<B, K>>>>
    : K
}[keyof A & string]

/** A kind of file's migrations, put together (`done`). */
export interface Migrations<T> {
  /** The latest version: the number of steps. */
  readonly latest: number
  /**
   * A file's parsed JSON migrated to the latest version, without its `version`; throws an Error
   * naming the file (`name`) if it isn't an object, or its version is one this app can't read.
   */
  migrate(file: unknown, name: string): T
  /** What to save: the document with the latest version, first. */
  stamp(doc: T): T & { version: number }
}

/**
 * What `done` gives when the latest version has fields the app's type no longer has: not
 * `Migrations`, so the file's `index.ts`, which says it's one, fails to type-check, naming them.
 */
export interface DroppedFields<P> {
  droppedFields: P
}

/** A chain of steps being put together, the last making `V`. */
export interface Chain<V> {
  /** Adds the step to the next version, which takes what the last step made. */
  then<U>(step: (doc: V) => U): Chain<U>
  /**
   * Ends the chain at the app's type. `fits` is `(doc): Session => doc`, which type-checks only
   * while the latest version still fits the app's type; and it gives `DroppedFields` rather than
   * `Migrations` while the latest has fields the app's type no longer has. Either way, the app's
   * type changed in a way old files don't fit, and needs a version.
   */
  done<T>(
    fits: (doc: V) => T,
  ): [V] extends [T] // when it doesn't fit, `fits` says why; this would only list every field
    ? [Dropped<V, T>] extends [never] ? Migrations<T> : DroppedFields<Dropped<V, T>>
    : Migrations<T>
}

type Step = (doc: never) => unknown

/** Starts a kind of file's chain of steps, from version 0 (`unknown`: whatever is on disk). */
export function migrations(): Chain<unknown> {
  // Untyped inside: `Chain` types it where it's used, which is what its checks need.
  const build = (steps: Step[]): Chain<unknown> =>
    ({
      then: (step: Step) => build([...steps, step]),
      done: (fits: (doc: unknown) => unknown) => ({
        latest: steps.length,
        migrate(file: unknown, name: string) {
          if (typeof file !== 'object' || file === null || Array.isArray(file)) {
            throw new Error(`${name} isn't a JSON object`)
          }
          const { version = 0, ...doc } = file as Record<string, unknown>
          if (!Number.isInteger(version) || (version as number) < 0) {
            throw new Error(
              `${name}: version must be a whole number, not ${JSON.stringify(version)}`,
            )
          }
          if ((version as number) > steps.length) {
            throw new Error(
              `${name} is version ${version}, from a newer app: this one reads up to ${steps.length}`,
            )
          }
          return fits(
            steps.slice(version as number).reduce<unknown>((d, step) => step(d as never), doc),
          )
        },
        stamp: (doc: object) => ({ version: steps.length, ...doc }),
      }),
    }) as unknown as Chain<unknown>
  return build([])
}
