# How long a line runs, for the cap on its frames

Higgs sometimes loops rather than end a line, in a buzz or in silence, until it's stopped. So a line may take only so many frames, by its length (`maxFrames` in [server/voice/higgs.ts](../../../../server/voice/higgs.ts)), and is spoken again once if it takes them all. This bench says how long a good line of so many characters runs, so the cap sits well past it. What was found is in [research/voices.md](../../../research/voices.md#a-cap-on-a-lines-frames-and-one-retry).

- `lines.ts` tags the voice bench's 67 lines as the app does, with the deliveries chosen for them, into `lines.json`: `deno run -A --config server/deno.json docs/bench/voices/cap/lines.ts`.
- `render.py` speaks each through the voice service's Higgs in two voices (Kael's, `../kael-ref.wav`, at seeds 1 and 2, and a tavern keeper's, `keeper-ref.wav`, designed from a description, at seed 1), capped at 1000 frames, and writes `results.jsonl`: each line's characters, length, frames, whether it reached the cap, and how long it took. About 21 min on the Mac.
- `results.jsonl`: the run on the Mac, 2026-11-24 (mlx-audio 0.6.8).

Check the cap again when Higgs, its sampling or its tags change: run both, and see that no line that ended is within reach of its cap, and which ran on.
