# Open threads

Ideas deliberately deferred. Promote an item to an ADR in `docs/adr/` when we act on it.

- **Persistent image sidecar.** Replace per-Turn `mflux-generate-*` CLI calls with a small Python service that keeps the Image Model loaded and exposes `POST /generate`. Trigger: model load time dominates Turn latency. Slots in behind `ImageGenerator`.
- **Edit-based rendering for Subject consistency.** Render each Turn by editing the previous image (`mflux-generate-kontext`, `mflux-generate-qwen-edit`, `mflux-generate-flux2-edit`) instead of generating from scratch. Trigger: the fixed Subject description plus a fixed seed still lets the Subject drift between Turns. Slots in behind `ImageGenerator`.
- **Starring Turns.** Let the player mark favourite Turns for a contact-sheet export. Not a new concept; a flag on a Turn.
- **Resuming a Session.** Sessions are already saved to disk; add UI to reopen the latest (or any) saved Session after a restart.
