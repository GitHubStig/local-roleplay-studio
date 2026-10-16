---
status: accepted; the state is now the Image Prompt, see ADR 0005
---

# The Scene is the only state carried between Frames

Each Frame sends the Text Model only the current Scene and the player's Action — never the Frames list or any earlier Frames. The Scene is the full description the Image Model renders from, so keeping it the sole state stops old details from drifting back in, keeps prompts (and Frames) the same size however long a Session runs, and makes rollback and saving a matter of one Scene rather than a transcript.

## Considered Options

- **Full conversation history** — the usual chat pattern; rejected for drift, growing latency, and Scene/image mismatch.
- **Last N Frames** or **a running summary** — rejected for now; both reintroduce a second source of truth alongside the Scene.

## Consequences

Anything not written into the state is forgotten. If something needs remembering, it has to be in the state itself rather than fed back in as history. Revisit if Sessions feel like they lack memory in practice.

Since ADR 0005 the state is the nine-Section Image Prompt rather than a Scenario-shaped Scene; everything above still holds, with "Image Prompt" for "Scene".

## Who was in the picture before (2026-10-16)

The case this ADR said to revisit came up with two people: someone who left the picture left the
Image Prompt, so when an Action brought them back the Text Model described them afresh (dark hair
came back blonde; docs/bench/two-people). Each Action now also gets everyone pictured before but
not now, each as their part of the last subject sentence that had them (`peopleAway`), and someone
brought back is copied from it. The latest three subject sentences were tried first, and lost the
traveller once five others had come and gone. It's a bounded exception: only who people are, a
line per person whatever the Session's length, and the Image Prompt is still the state: nothing
else of earlier Frames is sent.
