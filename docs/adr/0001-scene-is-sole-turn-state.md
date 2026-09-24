---
status: accepted
---

# The Scene is the only state carried between Turns

Each Turn sends the Text Model only the current Scene and the player's Action — never the Turn Log or any earlier Turns. The Scene is the full description the Image Model renders from, so keeping it the sole state stops old details from drifting back in, keeps prompts (and Turns) the same size however long a Session runs, and makes rollback and saving a matter of one Scene rather than a transcript.

## Considered Options

- **Full conversation history** — the usual chat pattern; rejected for drift, growing latency, and Scene/image mismatch.
- **Last N Turns** or **a running summary** — rejected for now; both reintroduce a second source of truth alongside the Scene.

## Consequences

Anything not written into the Scene is forgotten. If something needs remembering, add it to the Scenario's Scene schema rather than feeding history back in. Revisit if Sessions feel like they lack memory in practice.
