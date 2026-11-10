/**
 * What the app lends each part's routes (`app.ts` builds it): the stores and services, the queue,
 * the Session locks and streams, and what Settings and this machine allow now.
 */
import type { AppDeps, LockKind, StreamEvent } from './app.ts'
import type { Backend } from './backends.ts'
import type { Availabilities, Feature } from './features.ts'
import type { FrameDeps, Phase } from './frames.ts'
import { error } from './http.ts'
import type { ImageBackendKind } from './images/imageModels.ts'
import type { EditOrder, JobKind, SessionJobs } from './jobs.ts'
import type { HeavyJob } from './machine.ts'
import type { Previews } from './previews.ts'
import type { RenderQueue } from './renderQueue.ts'
import { briefScenario, type Scenario } from './scenario.ts'
import type { ChainSession, Session, StoryboardSession } from './session.ts'

export interface AppContext {
  deps: AppDeps
  /** Every Session's background work. */
  jobs: SessionJobs
  /** The streamed work in progress per Session: the step it has reached, and its Frame. */
  active: Map<string, { controller: AbortController; phase: Phase; frameIndex: number | null }>
  /** The picture forming: each render's latest preview. */
  previews: Previews
  renderQueue: RenderQueue
  /** Which extras this machine can run. */
  detected: Availabilities
  newSessionId: () => string
  randomSeed: () => number
  /** Takes the Session's lock, loads it and runs `handle` (see app.ts). */
  locked(
    id: string,
    kind: LockKind,
    handle: (session: Session) => Response | Promise<Response>,
  ): Promise<Response>
  /** Runs work as a server-sent event stream (see app.ts). */
  stream(
    session: Session,
    frameIndex: number | null,
    discardOnFailure: boolean,
    run: (send: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  ): Response
  loadSession(id: string): Promise<Session | Response>
  /** The Scenario a Session starts from, or why it has none. */
  scenarioFor(session: Session): Scenario | Response
  frameDeps(session: Session): FrameDeps
  /** Why a Feature can't be used now (a 409), or null if it can. */
  featureOff(feature: Feature): Promise<Response | null>
  /** What can run now, with Settings' backends. */
  availability(): Promise<Availabilities>
  /** The kinds of Image backend whose models a Session can switch to. */
  imageBackends(): Promise<ImageBackendKind[]>
  /** The Backend a heavy job goes to as Settings are now. */
  heavyBackend(job: HeavyJob): Promise<Backend | undefined>
  /** Which Backend a job of `kind` would go to for `session` now. */
  jobBackendOf(session: Session, kind: JobKind, edit?: EditOrder): Promise<Backend | undefined>
}

export const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')

/** A Session's title: its Scenario's, or the start of its typed Brief. */
export const titleOf = (session: Session) =>
  session.scenario?.title ??
    (session.brief ? briefScenario(session.brief).title : session.scenarioId ?? '')

export const needsChain = (s: Session): s is ChainSession => s.kind === 'chain'
export const needsStoryboard = (s: Session): s is StoryboardSession => s.kind === 'storyboard'
export const frameIndexOf = (s: Session, raw: string | undefined): number | Response => {
  const index = Number(raw)
  if (!Number.isInteger(index) || !s.frames[index]) return error('No such Frame', 404)
  return index
}
