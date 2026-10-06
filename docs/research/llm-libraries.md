# Unified LLM libraries, for the Text backend (2026-10-06)

The question: before writing an OpenAI-compatible Text backend beside Ollama, would a library that
unifies LLM APIs (providers, auth, token and cost tracking, model hand-off) serve better? The
three most used in TypeScript, checked against what this app needs. Versions, licences and
weekly downloads are from the npm registry on 2026-10-06.

## What the app needs from a Text backend

Every Text Model call in the app (`server/text/chat.ts`) is one streamed chat call that must:

1. **Constrain the reply to a JSON schema** (every job but Suggest), and still stream the raw text,
   which a Roleplay Reply and a Storyboard plan read field by field as they arrive
   (`server/jsonStream.ts`).
2. **Stream the reasoning apart from the answer**, and turn thinking on or off per call. Off must
   be asked for: gemma4 reasons by default on Ollama's `/v1`, checked.
3. **Pass non-standard fields**: Ollama's and llama.cpp's `repeat_penalty` and `repeat_last_n`,
   without which long Roleplays loop (`server/roleplay/model.ts`).
4. **Unload the model** before a render (Ollama's `keep_alive: 0`): 67 s against 375 s for a
   Qwen-Image render on a 48 GB Mac.
5. **List the models** a server offers, for Settings.
6. Run in **Deno**, cancel on an `AbortSignal`, and take any model name a local server has.

Most of what these libraries sell isn't needed. Tool calling and agents: the app uses neither.
Cost tracking: the app is local-first. Hand-off between models mid-Session: the app keeps one Text
Model for every job ([AGENTS.md](../../AGENTS.md)). Auth resolution: one key, in `settings.json`.

## The three

| | Vercel AI SDK | pi-ai | LangChain.js |
|---|---|---|---|
| Package | `ai` 7.0 + `@ai-sdk/openai-compatible` 3.0 | `@earendil-works/pi-ai` 1.0 (was `@mariozechner/pi-ai`) | `langchain` 1.5 + `@langchain/openai` 1.6 |
| Licence | Apache-2.0 | MIT | MIT |
| Weekly downloads | 34.5M | 8.1M (+1.1M old name) | 3.8M |
| Dependencies | 3, plus `zod` as a peer | 10, including the OpenAI, Anthropic, Google and AWS Bedrock SDKs | `@langchain/core` and its 7 |
| Runtime | Node, Deno, edge, browser | Node ≥ 22.19 (Deno not documented) | Node, Deno, edge |

**[Vercel AI SDK](https://ai-sdk.dev/providers/openai-compatible-providers)** is the best fit of
the three, and close to a fit.
- `streamText` with `Output.object` streams partial JSON under a schema.
- The OpenAI-compatible provider takes any base URL, key and model id, and has a
  `supportsStructuredOutputs` flag.
- It reads reasoning from both `reasoning` and `reasoning_content` (checked in its build), and
  passes unknown `providerOptions` into the request body (which would carry `repeat_penalty`).
- Ollama's own API comes through community providers: `ollama-ai-provider-v2`, 1.1M a week,
  which has `think`.
- It wouldn't do unloading or model listing, so those stay ours.
- It has a major version a year (v4 to v7 since 2024, each with breaking changes), it's built around
  Zod schemas (ours are plain JSON Schema; its `jsonSchema()` helper takes them), and Ollama's own API
  would rest on a community package.

**[pi-ai](https://cdn.jsdelivr.net/npm/@earendil-works/pi-ai@0.84.0/README.md)** is where the
features listed in the question come from (its tagline: "unified LLM API with automatic model
discovery, provider configuration, token and cost tracking, and simple context persistence and
hand-off to other models mid-session").
- It is built for agents that use tools, and its catalogue lists only models that can call tools.
- Its README documents a JSON schema only for tool definitions, not as a reply format: the app's
  central need (1) would have to be bent into a "tool call" that local models make less reliably.
- It brings every cloud provider's SDK, and targets Node.
- Good at what it's for (it powers the pi coding agent); not this.

**[LangChain.js](https://www.pkgpulse.com/guides/langchainjs-vs-vercel-ai-sdk-2026)** has the
widest set of integrations, and the most layers between a call and the wire: chat models,
runnables, output parsers and callbacks, for orchestration and retrieval the app doesn't do. For
plain chat completions, its own comparisons point to the AI SDK. Heavier for no gain here.

[TanStack AI](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk) (0.64, alpha) and the
official [`openai`](https://github.com/openai/openai-node) client were also looked at:
- TanStack AI is too early.
- The `openai` client is a typed wrapper over the same HTTP calls written here, with no
  reasoning fields of its own, so it would save little.

## Decision

Our own client, behind one small interface: [ADR 0008](../adr/0008-own-text-client.md). The client is
about 200 lines for both APIs. It keeps Ollama on its own API (thinking, capabilities and
unloading), and handles the differences found so far between servers in one place
(`server/text/openai/`). The interface (`Chat` in `server/text/chat.ts`) is what the rest of the
app sees, so a library could later replace the client by implementing that interface in one file.

**Switch to the AI SDK** if the backends multiply past what the fallbacks handle: a provider that
needs its own native API (Anthropic's or Google's), or prompt caching and token counts per provider.
