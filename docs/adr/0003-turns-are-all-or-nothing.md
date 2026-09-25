---
status: accepted
---

# A Frame commits whole or not at all

A Frame is saved only once both its Image Prompt and its image exist. If the Text Model fails (after one retry), the Image Model fails, or the player cancels, the Session on disk is left exactly as it was, any partially written image is deleted, and the player's Action stays in the text box to try again. A failed or cancelled Opening Frame discards the Session. To avoid a long silent wait, the new Image Prompt is streamed to the player (over server-sent events) as soon as the Text Model returns, shown as provisional until the image arrives.

## Considered Options

- **Commit the Image Prompt when it arrives, and offer a re-render if the image fails.** Rejected: an Image Prompt without its image breaks the rule that what the player sees is the state carried forward, and leaves a half-finished Frame in the Frames list.
- **Wait silently for text and image together.** Rejected: at 15–40 s per Frame, the player sees nothing for too long.

## Consequences

Cancel has a single meaning: abandon the Frame in progress; nothing changes. It aborts the Ollama request and kills the mflux process. Only one Frame can run per Session at a time. Because the provisional text can vanish on failure, the UI must show it as provisional (dimmed, with "Rendering the image…") and never treat it as committed.
