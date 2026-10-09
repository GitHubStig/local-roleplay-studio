---
status: accepted
---

# A Roleplay is a conversation with a Cast, replying in three fields

A Roleplay is a third kind of Session, built as its own module (`server/roleplay/`, `web/src/roleplay/`) beside Chains and Storyboards. It is set up in two steps. First a Text Model call writes the **Cast** from the Brief (the Character, the Persona the player plays, the Setting where it starts), and the player reviews it: edits it, or has it rewritten. Then **Begin** writes the Character's opening Reply, with the same system message every later Reply gets, so the opening matches the Cast as the player left it. After that, each Frame is one exchange: the player's Message and the Character's Reply.

Its prompts are Markdown files in `server/prompts/roleplay/`, with `{{placeholders}}` and notes for editors in `<!-- -->` comments, read fresh on every call (`server/promptFiles.ts`), so they can be reviewed and edited as the model sees them.

Every call sends the whole conversation as chat messages:

- **System**: the rules, the Cast, the reply format and the Limits. It is identical on every call (until the Cast is edited), so Ollama can reuse its work on it instead of re-reading it; with gemma4 a follow-up reply takes about 10–20 s against about 55 s for the setup.
- **History**: the Character's opening as the first assistant message (gemma4 keeps the system message with an assistant turn first; checked), then each Message as a user message and each Reply as the same JSON the model wrote.
- **The new Message** last.

The Reply is JSON with three required fields in writing order: `internal` (a brief first-person thought, or ""), `actions` (what the Character does, third-person sensory prose) and `dialogue` (what they say, or ""). The system message explains what each field means; Ollama's structured output enforces the shape, since the model doesn't see the schema itself. Separate fields let the screen show thought, action and speech differently, keep the Character from writing the player's side, and give a future Art Agent the visual part (`actions`) on its own.

## Considered Options

- **Prose replies.** Rejected: nothing separates speech from action or thought, and a model drifts into narrating the player.
- **Optional fields.** Rejected: under a schema some models always fill optional fields and some never do; required fields that may be "" behave the same everywhere.
- **Tracking scene state (pose, mood, time, weather) each Frame**, in the reply or in a second call. Deferred: the history already carries it for the Character, and the Art Agent will read the history when it renders. Revisit if the Character loses track.
- **Several made-up exchanges before the first Message**, to show the format. Rejected: the model treats them as things that happened. The opening Reply alone shows the format.
- **One call writing the Cast and the opening together.** Tried first: faster to start, but the opening was written before the player could see or edit the Cast, so edits applied only from the second Reply.
- **Prompts as strings in code.** Moved to Markdown files: the prompt is most of the text, and in code it was mixed in with parsing. JSON would need every line escaped.
- **The Scenario's notes in the Roleplay's prompts.** Left out: they're written for image prompts. A Scenario's Setup facts and Opening serve as the Brief.

## Consequences

The Limits (ADR 0002) apply with one adjustment. The Cast is checked against every Limit, and so is each Message, before the Character sees it. The Character's own prose (its thought, actions and dialogue) is checked for minors and sexual content only, and without the colloquial "kid": both the restraint list's words ("she restrains him from going back out into the storm") and "Listen, kid" are everyday in prose and declined ordinary replies in testing. The Character is told every Limit, and any image the Art Agent writes will be checked in full before it's rendered. A declined Message or Reply saves nothing, and the Message stays in the box to reword.

Replies are written with `repeat_penalty` 1.15 over the whole context (`repeat_last_n: 131072`, as many tokens as the context holds; the documented `-1` is refused by models on Ollama's GGUF engine). Replaying Frame 24 of a 30-Frame Roleplay, 7–29% of each Reply's five-word phrases repeated earlier Replies ("the rain hammers the roof…"); with the penalty, 0–1%. An instruction not to repeat didn't help, and presence and frequency penalties broke the output. Other calls don't use it: they need to repeat, such as a picture keeping someone's clothes the same.

Pictures (the Art Agent) keep each person's identity in its own sentence of the Look, and each picture says who is in it; offered a choice of "both", "character" or "persona", the model always chose the first, so it answered a yes or no per person until 2026-10-09, and now names them (ADR 0012), adding anyone new the story brings in. A picture includes only the identities of the people shown, so someone who has left isn't drawn back in.

The history grows with every exchange. The Text Model's context (131,072 tokens for gemma4 as Ollama loads it) is far larger than a session's worth of replies, so nothing trims it yet (open thread). The context size is deliberately not set per call: a different size makes Ollama reload the model.
