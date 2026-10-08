---
status: accepted
---

# A Session's seed seeds every model, moved on for each repeat

Each Session has one seed (fixed in Settings, or picked at random when it starts), and everything it
makes is seeded from it (2026-10-08):

- pictures and upscales: the seed itself;
- spoken lines: the seed plus the Frame's index;
- takes of the voice: the seed plus how many takes came before (`voice.takes`; editing the
  description starts the count again);
- Text Model calls (`server/text/seeded.ts`, wrapped around the `Chat` in `main.ts`): the seed,
  plus a hash of the call's messages and schema, plus how many times the Session made that call
  before.

So a fixed-seed Session played the same way asks every model with the same seeds, in whatever order
its calls run. A repeat of the same request (a retry after a bad answer, Suggest pressed twice, a
new voice take) gets a new seed, so it can come out different.

## Considered Options

- **No seed for text and voice design** (as before). Each Session's text was different even with a
  fixed seed, and the Settings seed only covered pictures.
- **The Session's seed as it is, for every call.** Breaks every "ask again": with the same prompt
  and seed, Ollama gives the same reply word for word (measured on the Mac, 2026-10-08), so
  `withRetry` would repeat a malformed answer and Suggest the same suggestion.
- **The seed plus a count of the Session's calls.** Reproducible only if the calls run in the same
  order, which parallel ones (the Art Agent beside a Reply) don't. Keying the count on what's asked
  avoids that.

## Consequences

- A new model call should be seeded from the Session the same way: the seed, plus whatever tells
  its repeats apart.
- The repeat counts live in memory and start again after a restart. The first repeat of a call made
  before the restart gets that call's first seed.
- Text is reproducible only as far as the backend is: a GPU's batching, or another machine, can still
  change a reply. An OpenAI-compatible server that refuses `seed` is asked without it, and OpenAI
  takes it only as a hint.
- 3D figures (TripoSplat, LiTo) keep seed 42 for now, so they're easy to compare; SHARP samples
  nothing.
