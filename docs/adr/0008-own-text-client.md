---
status: accepted
---

# The Text Model is reached through our own small client, behind one `Chat` interface

The app talks to a Text Model through `server/text/`. The rest of the app sees only the `Chat`
interface (`chat.ts`): one streamed call that takes:

- messages, and an optional JSON schema;
- a token cap, a temperature and a repeat penalty;
- whether to think.

It returns the reply and any reasoning, as they stream. `TextModel` (`textModel.ts`) and `RoleplayModel` (`roleplay/model.ts`) are built on any
`Chat`; `main.ts` picks the backend from Settings for each Session.

Two backends implement it (`backend.ts`):

- **Ollama**, on its own API (`ollama.ts`). It has the thinking switch, model capabilities (which
  models can think), and unloading before a render, which its OpenAI API doesn't.
- **An OpenAI-compatible server** (`openAi.ts`): LM Studio, llama.cpp's server, vLLM, OpenAI,
  OpenRouter. It uses `/chat/completions` with `response_format: json_schema`, and `/models`.
  - Fields outside the API's core are dropped one at a time when a server names one in a refusal,
    and stay dropped: `reasoning_effort`, `repeat_penalty` and `repeat_last_n`, and `max_tokens`
    (renamed `max_completion_tokens`).
  - Thinking off sends `reasoning_effort: "none"`, because thinking models reason by default.
  - Reasoning is read from `reasoning` or `reasoning_content`, whichever the server uses.

The backend, its address and the model are Settings, copied into each Session as before. The API key is kept in
`settings.json` but outside `Settings`, so it never reaches a Session's file or the browser
(`SettingsStore.loadApiKey`).

## Considered Options

- **A unified LLM library** (Vercel AI SDK, pi-ai, LangChain.js; compared in
  [llm-libraries.md](../research/llm-libraries.md)). Not now. Their main features (tools and
  agents, cost tracking, switching models mid-conversation, many providers' sign-in) are ones this
  app doesn't use. What it does need is a JSON-schema reply that streams, thinking on and off,
  Ollama's repeat penalty, and unloading:
  - pi-ai offers a schema only for tool calls.
  - LangChain adds layers for orchestration.
  - The AI SDK comes closest. It still leaves unloading and model listing to us, puts Ollama's own
    API on a community package, and has had a breaking major version every year.
  Our client is about 200 lines.
- **Only the OpenAI API, for Ollama too** (its `/v1`). Gave the same results at the same speed with
  gemma4 (2026-10-06: Frame 3.6 s against 3.9 s, Cast 4.8 s against 4.7 s, Thinking off). But it
  would lose unloading (Ollama's model would stay loaded during a render, five times slower on a 48
  GB Mac), knowing which models can think, and, it seems, the repeat penalty (Ollama's `/v1`
  accepts the field without complaint, but nothing shows it uses it).
- **The API key in an environment variable.** Kept in `settings.json` instead (gitignored), so it
  can be set from Settings, on Windows too, without a shell.

## Consequences

- To move to a library, write one `Chat` implementation on it (a new file in `server/text/`) and
  pick it in `backend.ts`. Nothing outside the folder changes.
- A cloud service can refuse a dark Roleplay that a local uncensored model plays, and its own
  content rules apply on top of the Limits.
- On a server on the OpenAI API, nothing unloads the Text Model before a render. On the same
  machine, picture rendering competes with it for memory.
- On a cloud service, the Replies lose the repeat penalty, so long Roleplays may start repeating
  their own phrases again.
