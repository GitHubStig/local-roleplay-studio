---
status: accepted
---

# A Roleplay's Look is written in the Cast review, as a queued job

Until 2026-11-25 a Roleplay's Look (each Subject's identity, and the art style) was written the first time a Frame was pictured, by the same job that pictured it. Reference sheets ([reference-sheets-plans.md](../reference-sheets-plans.md)) are made from the Look and settled before the story begins, so the Look has to exist by then; and the owner thought it better anyway, as the player can read and edit it in Look & Cast before anything is pictured. Since 2026-11-25:

- **Every Roleplay's Look is written while its Cast is reviewed**, with pictures on or off: one path, for consistency (the owner). The call costs little: 2.2 s on the Mac (Gemma 4 26B, Thinking off), against 8.7 s for the Cast before it.
- **It's a job of its own (`look`), queued by the server as the Cast is saved**, as what follows a Reply is ([ADR 0031](0031-the-server-queues-what-follows-a-reply.md)), so it runs while the Text Model is still loaded for the Cast. Begin doesn't wait for it, nor do edits: it holds no lock. The first picture waits for it, as a job waits for what it needs.
- **No fallback at the first picture.** A Frame is pictured only once the Look exists; one asked for before is refused, saying so. A Look that fails or is cancelled leaves the Cast as it was, and Look & Cast offers to write it.
- **Rewriting the Cast writes the Look again**, replacing any still being written: new people need new identities.
- **A hand edit to the Cast's start** (names, the Character's age and looks, the Persona, the Setting: what can't change once begun) leaves the Look as it is and marks it behind the Cast (`lookBehindCast`); Look & Cast asks whether to write it again or keep it. Saving the Look, or writing it, clears the mark. So hand edits to the Look are never thrown away without the player's click. An edit to what only steers the Character (its personality, goal…) doesn't touch it.
- **Restart keeps the Look and its job**, as it keeps the Cast and the voice.

## Considered Options

- **Written in the Cast's own stream**, after the Cast in the same request. Simpler, but it holds the Session's lock: Begin and every edit are refused until it's done, longer with Thinking on.
- **Only for a Roleplay started with reference sheets.** Two paths for one thing; the owner chose one.
- **The lazy write kept as a fallback** for Sessions without a Look. The owner chose none: the only one that had none was a Session still in review, deleted, and the PC's Sessions are cleared regularly.
- **Writing the Look again after every Cast edit.** It would throw away the player's edits to the Look over a change that may not need it.

## Consequences

- `session.json` version 4 adds `lookBehindCast`, false for every Roleplay before it.
- A new job kind, `look`, a Session's own (queued as Frame 0's, like the voice); a picture needs it.
- The Art Agent's first call is now the Look in the Cast review, not at the first picture, so its log is the setup's.
