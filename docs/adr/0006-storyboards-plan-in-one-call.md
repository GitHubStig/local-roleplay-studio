---
status: accepted
---

# A Storyboard is planned in one Text Model call, with a shared Look

A Storyboard's Frames are written together, in a single Text Model call whose reply has three parts, in order: the **Look** (the subject-and-identity and art-style sentences every Frame shares), the **Beats** (one line per Frame), then each Frame's own seven sentences. The server reads the reply as it streams (`server/jsonStream.ts`) and shows the Look, the Beats and each Frame the moment its JSON is complete. Each Frame's Image Prompt is the Look's subject sentence, the Frame's seven sentences, then the Look's style sentence, so every Frame shows the same person in the same style, and editing the Look rewrites them all.

## Considered Options

- **A beat sheet call, then one call per Frame.** Rejected: the same total output, so no faster, and each Frame is written without seeing the others, so continuity (where the ball is, which hand) suffers. One call still shows Frames as they arrive.
- **One call returning finished nine-sentence paragraphs.** Rejected: nothing guarantees the identity and style stay word for word the same across Frames.
- **Each Frame's seven sentences as one string.** Tried and dropped: Qwen3.8 27B squeezed all seven into a single pose sentence (no setting, camera or lighting). The reply now has seven required fields per Frame, which structured output enforces; the engine joins them into one paragraph, and that paragraph is all the player sees or edits.

## Consequences

The call is long (about 700 tokens per Frame), so its token cap and time limit scale with the Frame count instead of the usual 2,048 tokens and 2 minutes. It commits all or nothing: a plan that fails or is cancelled discards the Storyboard, like a Chain's Opening Frame. Clothing is per Frame, not part of the Look, so a story can change outfits; a model can also let it drift between Frames.
