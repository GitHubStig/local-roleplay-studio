import { JsonStreamReader } from './jsonStream.ts'
import { type Chat, within } from './text/chat.ts'
import {
  expanded,
  type ExpandFrom,
  expandMessages,
  expandSchema,
  type Expansion,
} from './scenario/expand.ts'
import { cleanSuggestion, suggestMessages, type SuggestRequest } from './scenario/suggest.ts'
import {
  type FrameRequest,
  type FrameText,
  outputSchema,
  parseFrameText,
  systemMessage,
  userMessage,
} from './chain/text.ts'
import { frameSchema, parseLook } from './frameBody.ts'
import {
  parsePlannedBeat,
  parseStoryboardEdit,
  parseStoryboardPlan,
  parseStoryboardWrite,
  type PlanHandlers,
  type StoryboardEdit,
  storyboardEditMessages,
  type StoryboardEditRequest,
  storyboardEditSchema,
  type StoryboardPlan,
  storyboardPlanMessages,
  type StoryboardPlanRequest,
  storyboardPlanSchema,
  type StoryboardWrite,
  storyboardWriteMessages,
  type StoryboardWriteRequest,
} from './storyboard/text.ts'

export interface TextModel {
  /** The model's name, as its Backend lists it: recorded on what it writes. */
  readonly name: string
  /** `onThinking` receives the model's reasoning as it streams in, when thinking is on. */
  write(
    req: FrameRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<FrameText>
  /** Plans a Storyboard: its Look and Beats, reported as they arrive. */
  planStoryboard(
    req: StoryboardPlanRequest,
    signal: AbortSignal,
    on?: PlanHandlers,
  ): Promise<StoryboardPlan>
  /** Writes one Storyboard Frame's seven sentences from the reviewed plan. */
  writeStoryboardFrame(
    req: StoryboardWriteRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardWrite>
  /** Rewrites one Storyboard Frame, following an Action. */
  editStoryboardFrame(
    req: StoryboardEditRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardEdit>
  /** Writes a clip's prompt, as plain text, passing it on as it's written (`video/clipPrompt.ts`). */
  writeClip(
    messages: { system: string; user: string },
    signal: AbortSignal,
    onContent?: (chunk: string) => void,
  ): Promise<string>
  /** Expand, on the Scenario page: a Scenario or Brief sorted, named and suggested for (`scenario/expand.ts`). */
  expandScenario(
    from: ExpandFrom,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<Expansion>
  /** Suggest, on the Scenario page: one suggestion for one part (`scenario/suggest.ts`). */
  suggestForScenario(req: SuggestRequest, signal: AbortSignal): Promise<string>
}

/**
 * Output caps. A small model writing JSON under a schema sometimes never stops (padding with
 * whitespace until its large context fills), so every call gets a token cap and a time limit.
 */
const MAX_TOKENS = {
  answer: 2048,
  perBeat: 120,
  clip: 600,
  expand: 2048,
  suggestion: 200,
}
const TIME_LIMIT_MS = {
  answer: 2 * 60_000,
  thinking: 10 * 60_000,
  /** Added to a Storyboard plan's limit for each Beat it has to write. */
  perBeat: 10_000,
}

/**
 * How much of a Storyboard plan may be written before its next part (the Look, a Beat) is complete,
 * in characters. The Look of five Subjects takes about 1,500, a Beat about 150; a model that goes
 * past this has run away (repeating itself, or padding with whitespace), as Gemma 4 26B did once
 * in a 16-Frame plan on 2026-10-08. Stopped here, the plan is retried in well under a minute, where
 * waiting for its token cap took minutes.
 */
export const RUNAWAY_CHARS = 8000

/** A plan's token cap: room for the Look (a sentence per Subject), then each Beat. */
export const planTokens = (frameCount: number) => 1200 + frameCount * MAX_TOKENS.perBeat

export interface TextModelOptions {
  /** Overrides the time limits, in ms (for tests). */
  timeLimits?: Partial<typeof TIME_LIMIT_MS>
}

/** The Text Model's jobs in a Chain or Storyboard, on any backend's `chat`. */
export function chatTextModel(chat: Chat, opts: TextModelOptions = {}): TextModel {
  const limits = { ...TIME_LIMIT_MS, ...opts.timeLimits }

  /** One streamed call with a system and a user message; see `Chat.stream`. */
  async function streamChat(
    job: string,
    messages: { system: string; user: string } | Promise<{ system: string; user: string }>,
    schema: object | undefined,
    maxTokens: number,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
    onContent?: (chunk: string) => void,
  ): Promise<{ content: string; thinking: string }> {
    const { system, user } = await messages
    return chat.stream({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      schema,
      maxTokens,
      job,
      signal,
      onThinking,
      onContent,
    })
  }

  const withThinking = <T extends object>(value: T, thinking: string) =>
    thinking ? { ...value, thinking } : value

  async function write(
    req: FrameRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<FrameText> {
    const { content, thinking } = await streamChat(
      'write',
      {
        system: await systemMessage(req.scenario, req.prompt === null),
        user: await userMessage(req),
      },
      outputSchema(),
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseFrameText(content), thinking)
  }

  async function plan(
    req: StoryboardPlanRequest,
    signal: AbortSignal,
    on: PlanHandlers = {},
  ): Promise<StoryboardPlan> {
    // What's been written since the last part of the plan was complete, and which part is next.
    let since = 0
    let tail = ''
    let writing = 'the Look'
    const done = (next: string) => {
      since = 0
      writing = next
    }
    const reader = new JsonStreamReader({
      value: (key, value) => {
        if (key === 'look') {
          on.look?.(parseLook(value))
          done('Beat 1')
        }
      },
      element: (key, index, value) => {
        if (key !== 'beats') return
        on.beat?.(index, parsePlannedBeat(value))
        done(`Beat ${index + 2}`)
      },
    })
    const { content, thinking } = await streamChat(
      'plan',
      storyboardPlanMessages(req),
      storyboardPlanSchema(req.frameCount),
      planTokens(req.frameCount),
      signal,
      on.thinking,
      (chunk) => {
        reader.feed(chunk)
        since += chunk.length
        tail = (tail + chunk).slice(-200)
        if (since > RUNAWAY_CHARS) {
          console.warn(`A Storyboard plan ran on; its last words: ${JSON.stringify(tail)}`)
          throw new Error(`The Text Model ran on while writing ${writing}, and was stopped`)
        }
      },
    )
    return withThinking(parseStoryboardPlan(content, req.frameCount), thinking)
  }

  async function writeFrame(
    req: StoryboardWriteRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardWrite> {
    const { content, thinking } = await streamChat(
      'write-frame',
      storyboardWriteMessages(req),
      frameSchema,
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseStoryboardWrite(content), thinking)
  }

  async function edit(
    req: StoryboardEditRequest,
    signal: AbortSignal,
    onThinking?: (chunk: string) => void,
  ): Promise<StoryboardEdit> {
    const { content, thinking } = await streamChat(
      'edit',
      storyboardEditMessages(req),
      storyboardEditSchema(),
      MAX_TOKENS.answer,
      signal,
      onThinking,
    )
    return withThinking(parseStoryboardEdit(content), thinking)
  }

  const answerLimit = () => chat.thinks ? limits.thinking : limits.answer
  return {
    name: chat.model,
    write: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => write(req, s, onThinking)),
    planStoryboard: (req, signal, on) =>
      within(signal, answerLimit() + req.frameCount * limits.perBeat, (s) => plan(req, s, on)),
    writeStoryboardFrame: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => writeFrame(req, s, onThinking)),
    editStoryboardFrame: (req, signal, onThinking) =>
      within(signal, answerLimit(), (s) => edit(req, s, onThinking)),
    // A paragraph, in plain text: no schema.
    writeClip: (messages, signal, onContent) =>
      within(
        signal,
        answerLimit(),
        async (s) =>
          (await streamChat('clip', messages, undefined, MAX_TOKENS.clip, s, undefined, onContent))
            .content,
      ),
    expandScenario: (from, signal, onThinking) =>
      within(signal, answerLimit(), async (s) => {
        const { content } = await chat.stream({
          messages: await expandMessages(from),
          schema: expandSchema(from),
          maxTokens: MAX_TOKENS.expand,
          job: 'expand',
          signal: s,
          onThinking,
        })
        let value: unknown
        try {
          value = JSON.parse(content)
        } catch {
          throw new Error('The Text Model did not reply with valid JSON')
        }
        return expanded(from, value)
      }),
    // Plain text: no schema.
    suggestForScenario: (req, signal) =>
      within(signal, answerLimit(), async (s) => {
        const { content } = await chat.stream({
          messages: await suggestMessages(req),
          maxTokens: MAX_TOKENS.suggestion,
          job: 'suggest part',
          signal: s,
        })
        const text = cleanSuggestion(content)
        if (!text) throw new Error('The Text Model wrote no suggestion')
        return text
      }),
  }
}
