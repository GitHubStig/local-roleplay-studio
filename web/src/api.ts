export interface Health {
  ok: boolean
}

export type Quantize = null | 4 | 8
export type SeedMode = 'random' | 'fixed'

export interface Settings {
  textModel: string
  thinking: boolean
  imageModel: string
  steps: number
  size: string
  quantize: Quantize
  seedMode: SeedMode
  seed: number
}

export interface ImageModelOption {
  id: string
  label: string
  defaultSteps: number
}

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
}

export interface SettingsOptions {
  textModels: string[]
  /** The Text Models that can reason before answering. */
  thinkingModels: string[]
  textModelsError?: string
  imageModels: ImageModelOption[]
  sizePresets: SizePreset[]
}

export class ApiError extends Error {
  readonly status: number
  readonly issues: string[]

  constructor(message: string, status: number, issues: string[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status, body.issues)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const getHealth = () => request<Health>('/api/health')

export const getSettings = () => request<Settings>('/api/settings')

export const getSettingsOptions = () => request<SettingsOptions>('/api/settings/options')

export const saveSettings = (settings: Settings) =>
  request<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })

export interface ScenarioSummary {
  id: string
  title: string
  description: string
}

export interface ScenarioLoadError {
  file: string
  message: string
}

export interface ScenarioList {
  scenarios: ScenarioSummary[]
  errors: ScenarioLoadError[]
}

export const getScenarios = () => request<ScenarioList>('/api/scenarios')

/**
 * A Session's whole state at one Turn: one paragraph describing the image, written in this order:
 * subject and identity → pose and limbs → expression → camera angle and framing → clothing →
 * environment → lighting → color → art style and medium.
 */
export type ImagePrompt = string

/** How a Turn's Action was received; only `done` changes the Image Prompt. */
export type Outcome = 'done' | 'declined' | 'unclear'

export interface Turn {
  index: number
  action: string | null
  prompt: ImagePrompt
  narration: string
  outcome: Outcome
  /** The Text Model's reasoning, when thinking was on. */
  thinking?: string
  /** Seconds each step took; missing on Turns saved before timings were recorded. */
  timings?: { text: number; queued?: number; image: number | null }
  /** The exact text sent to the Image Model. */
  promptText: string
  image: string
  createdAt: string
}

export interface Session {
  id: string
  scenarioId: string
  settings: Settings
  seed: number
  createdAt: string
  turns: Turn[]
  /** What a Turn in progress is doing, or null when idle (only from `getSession`). */
  activity?: 'text' | 'queued' | 'image' | null
}

export type TurnEvent =
  /** `queued`: waiting for another Session's render to finish. */
  | { type: 'phase'; phase: 'text' | 'queued' | 'image' }
  | { type: 'thinking'; text: string; restart?: boolean }
  | { type: 'progress'; step: number; total: number }
  | { type: 'text'; outcome: Outcome; narration: string; prompt: ImagePrompt }
  | { type: 'committed'; turn: Turn }
  | { type: 'failed'; message: string; sessionDiscarded: boolean }
  | { type: 'cancelled'; sessionDiscarded: boolean }

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const createSession = (scenarioId: string) => post<Session>('/api/sessions', { scenarioId })

export const getSession = (id: string) => request<Session>(`/api/sessions/${id}`)

/** A saved Session as listed on Home. */
export interface SessionSummary {
  id: string
  scenarioId: string
  scenarioTitle: string
  turns: number
  latestImage: string | null
  createdAt: string
  updatedAt: string
  /** What a Turn in progress is doing, or null when idle. */
  activity: 'text' | 'queued' | 'image' | null
}

export const listSessions = () => request<SessionSummary[]>('/api/sessions')

export const deleteSession = (id: string) =>
  request<void>(`/api/sessions/${id}`, { method: 'DELETE' })

/** Undoes the latest Turn, which must be Turn `index`; returns the updated Session. */
export const undoTurn = (id: string, index: number) =>
  request<Session>(`/api/sessions/${id}/turns/${index}`, { method: 'DELETE' })

export async function cancelTurn(id: string): Promise<void> {
  await fetch(`/api/sessions/${id}/cancel`, { method: 'POST' })
}

export const imageUrl = (sessionId: string, file: string) =>
  `/api/sessions/${sessionId}/images/${file}`

/** Splits a server-sent event stream into parsed events, across arbitrary chunk boundaries. */
export function createSseParser(onEvent: (event: TurnEvent) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6))
      if (data.length) onEvent(JSON.parse(data.join('\n')))
    }
  }
}

/**
 * Runs a Turn (the Opening Turn when `action` is null), reporting progress through `onEvent`.
 * Resolves once the stream closes; a stream that closes without a final event is reported as
 * a failure.
 */
export async function streamTurn(
  sessionId: string,
  action: string | null,
  onEvent: (event: TurnEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action === null ? {} : { action }),
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ?? `Turn failed: ${res.status}`, res.status)
  }
  let finished = false
  const parse = createSseParser((event) => {
    if (event.type === 'committed' || event.type === 'failed' || event.type === 'cancelled') {
      finished = true
    }
    onEvent(event)
  })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (let r = await reader.read(); !r.done; r = await reader.read()) parse(r.value)
  if (!finished) {
    onEvent({ type: 'failed', message: 'Lost connection to the server', sessionDiscarded: false })
  }
}
