---
status: accepted
---

# A Session switches Text Model, and each Frame says which wrote it

A Session copied the Text Model and Thinking from Settings when it started, and nothing changed them after, so changing the Text Model in Settings never reached a running Session (noticed by the owner, 2026-11-10). Trying a new model on a long Roleplay meant starting it over, and a Session shared with someone whose Backends don't have its model couldn't write at all (ADR 0022). Since 2026-11-10, as the Image Model has been since ADR 0015:

- **The Text Model is switched in the Session** (the picker beside its switches, `TextModelPicker`; `PUT /sessions/:id/text-model` with `{ textModel }`). Settings' Text Model is only the one new Sessions start with. The picker lists the models of the Backend Settings send text to, and the Session's own if that Backend doesn't list it.
- **Thinking stays as the Session started**, copied from Settings, with no switch of its own in the Session (the owner, 2026-11-10: not needed). A model that can't think, switched to with Thinking on, answers without it, as the backends already drop `think` when a model refuses it.
- **Every text job uses the Session's Text Model** as it is when the job starts, as before: a Reply, the Cast, a plan, Suggest, a clip's prompt and the rest. One being written when the Session switches finishes on the old model.
- **A job that asks the Text Model keeps the one it was queued with** (`Job.text`, for `TEXT_JOBS`: a picture, music direction, scoring, steering, a voice's design and a spoken line's directions), as a render keeps its Image Model (ADR 0020). Its machine was picked from that model's Backend when it was queued, so running it by the new one could load a model on the wrong machine. A retried job keeps it too.
- **Each Frame records the Text Model that wrote it** (`textModel`: a Chain's Frame, a Storyboard's Frame each time its sentences are written, a Roleplay's Reply), shown with how long it took ("Text 9.8 s by gemma4:26b", "Replied in 9.8 s by …"). A Roleplay already recorded the model of its Look and of each picture. It's required on a Chain's and a Roleplay's Frames; the Mac's Sessions were given it by hand on 2026-11-10, each Frame its Session's model (none could switch before), except a Roleplay switched that day, whose earlier Frames were given the model it had before.

Nothing written before a switch is rewritten: the Cast, the Look, the Score, the voice's description and the Frames stay as the old model wrote them, to edit by hand as before.

## Considered Options

- **Running Sessions follow Settings.** One place to choose, but changing it would switch every Session at once, no two Sessions could use different models, and nothing would say which model wrote what. Turned down for the Image Model in ADR 0015 for the same reasons.
- **Leave it fixed.** Simplest, but the only way to try a model on a story was to start the story again, and a shared Session needs its model on the new machine's Backends.
- **Queued text jobs take the Session's model when they run.** Simpler (no `Job.text`), but a job queued on one machine's line could run a model on another's, the failure ADR 0020 fixed for renders.

## Consequences

- **Switching costs a model load.** All text calls take turns in one line per machine (ADR 0029), so two open Sessions on different Text Models make the Backend swap between them, which takes a while for a 26B model and may not fit beside the other on the PC (12 GB). This goes against [one Text Model](../../AGENTS.md) only while two Sessions run on different models at once. The picker's hint says it loads the model.
- **The same seed no longer means the same story if the model changed.** A Text Model call's seed is the Session's seed, a hash of what's asked and a count (`server/text/seeded.ts`); it leaves out the model, so a replay matches only when the model is the same. Each Frame's `textModel` shows where it changed.
- **In a Roleplay, the new model takes the old one's Replies as its own**, as the whole conversation is sent. Good for continuity, but the first few Replies after a switch are a muddier comparison of the two models than a fresh Roleplay.
- **A smaller model can run out of context sooner.** A Roleplay sends its whole history (ADR 0007), so a long one moved to a model with a smaller context fails saying so, as it would on any model that outgrew it.
- **The workarounds were measured on Gemma 4** (a reply under a schema saying how it ends, `repeat_penalty` 1.15, and the others in [text-models.md](../research/text-models.md)); a switch to another model may need them checked again, as AGENTS.md says when the Text Model changes.
- **Only the preferred text Backend's models are listed.** A model only another text Backend has can't be picked in the Session yet, though a Session already on one keeps it. Listing every text Backend's models is open, if it's wanted.
- Built on 2026-11-10, on the Mac, against fakes in tests; the switch hasn't been tried on a real Backend yet, nor on the PC.
