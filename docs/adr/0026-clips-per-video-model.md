---
status: accepted
---

# A picture keeps a clip of each kind per video model, to compare them

Wan 2.2 and MiniMax H3 joined LTX 2.5 as video models on 2026-10-31, each measured on the PC ([research/video-models.md](../research/video-models.md)). The owner kept all three and wants to make the same clip with each and compare them (2026-10-31).

- **One clip of each kind per video model**, on the picture version it's made from: making a kind again replaces only that model's clip. Each clip already recorded its model (ADR 0025), so Sessions made before needed no change.
- **The model is picked in the Clip section**, not only in Settings: a dropdown beside the length, starting on the Session's last pick in this browser (local storage, a convenience), else Settings' video model, now named its default. Picking it per clip, rather than per Session as the Image Model is, keeps comparing to switching a dropdown and making the clip again.
- **A clip job keeps the model it was queued with**, as a render keeps its Image Model; before, it read Settings when it started. One ordered without a model takes Settings' default then.
- **The prompt is shared per kind**: a model with no clip of the chosen kind starts from another model's prompt, so each model is told the same thing. It can still be edited or rewritten before making.
- **Compare plays each model's clip of a kind side by side, in step**, in a dialog of its own (from the Clip section, and from the picture viewer), not the Session's Compare tab, which is for Image Models across Frames. One Play and one timeline: the longest clip leads and the others are kept within a few frames of it (each model has its own frame grid, so their lengths differ by a fraction of a second); an Idle Loop restarts them all together. Only one is heard at a time, as three soundtracks at once is noise; clicking a clip moves the sound to it.
