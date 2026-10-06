# Reference portraits and auto-mask edits (2026-10-06)

The trial behind "Reference images and edits for Subject consistency" and the idle-animation blink
in [open-threads.md](../../open-threads.md). Qwen-Image 2.1 through mflux 0.21, on the full weights
(`Qwen/Qwen-Image-2.1`, 33 GB: the saved 8-bit copy can't take reference images), 1024×1024,
25 steps, seed 7, no step cache, on a 48 GB M5 Pro with Ollama unloaded.

## What was run

- **Portraits** of Kael and Elara, head and shoulders on a plain backdrop, written from the Kael
  tavern Roleplay's Look (`mflux-generate-qwen-2.1`).
- **Frames 6, 9 and 12** of that Roleplay from gemma4's prose prompts in
  [art-tags/prompts](../art-tags/prompts/gemma4-31b.json): once as usual, and once through
  `mflux-generate-qwen-2.1-edit` with the portraits as reference images ("Image 1 is Kael and image
  2 is Elara Vance. Keep each one's face, hair and build exactly as in their image.", then the
  prompt). 6 is Kael alone; 9 and 12 are both.
- **A blink:** `--auto-mask "the man's eyes"` on Frame 6, and `"the woman's eyes"` on Frame 9,
  "eyes closed, as in a blink. Change nothing else."

`compare.jpg`: portraits, then the Frames without and with them. `blink-6.jpg` and `blink-9.jpg`:
before and after, cropped. `results.txt`: time and peak memory per render. `run.sh` renders it all
again into `out/` (not committed; the full-size pictures).

## What it showed

| | Without portraits | With portraits |
|---|---|---|
| Kael, Frames 6, 9, 12 | alike in 6 and 9, a younger, different face in 12 | the portrait's face, short hair and stubble in all three |
| Elara, Frames 9, 12 | two different women (face and skin tone) | the portrait's in both: pale, dark hair pulled back |
| Time per picture | 84–86 s | 122–142 s (1.4–1.7×) |
| Peak memory | 39.3 GB | 38.9–39.4 GB |

- **Portraits hold identity well.** Their costs: the shots came out wider, so the people are
  smaller (9, 12), and Frame 12 lost Elara's knives (her hands on the railing): the references
  seem to pull against the prompt's details. Some of the slowdown is likely the edit tool's
  guidance (two passes a step where a render without a negative prompt runs one); not separated.
- **The blink failed.** Frame 6's prompt already had Kael's eyes closed, so there was nothing to
  close. On Frame 9 the auto-mask found a small box around Elara's eyes but barely changed it:
  0.01% of pixels moved by more than 8 levels, and her eyes stayed open. What did work is the
  composite: 99.75% of pixels came back byte-identical, everything outside that box untouched.
  Untried: a looser mask ("her eyes and eyelids"), other wording, edit strength.
