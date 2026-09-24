---
status: accepted
---

# A Turn commits whole or not at all

A Turn is saved only once both its Scene and its image exist. If the Text Model fails (after one retry), the Image Model fails, or the player cancels, the Session on disk is left exactly as it was, any partially written image is deleted, and the player's Action stays in the text box to try again. A failed or cancelled Opening Turn discards the Session. To avoid a long silent wait, the new Scene text is streamed to the player (over server-sent events) as soon as the Text Model returns, shown as provisional until the image arrives.

## Considered Options

- **Commit the Scene when its text arrives, and offer a re-render if the image fails.** Rejected: a Scene without its image breaks the rule that what the player sees is the state carried forward, and leaves a half-finished Turn in the Turn Log.
- **Wait silently for text and image together.** Rejected: at 15–40 s per Turn, the player sees nothing for too long.

## Consequences

Cancel has a single meaning: abandon the Turn in progress; nothing changes. It aborts the Ollama request and kills the mflux process. Only one Turn can run per Session at a time. Because the provisional text can vanish on failure, the UI must show it as provisional (dimmed, with "Rendering the image…") and never treat it as committed.
