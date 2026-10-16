# Two people in a Storyboard Frame (2026-10-16, Windows PC)

The test behind "One Image Prompt shape for one to three people" in
[open-threads.md](../../open-threads.md). With two people in a Storyboard Frame, its sentences were
written as if for one subject ("Kael looks at her with suspicion; the traveller looks at him…"),
and an Image Model could swap who did what. Three ways of writing a plan, each planned twice from
the public tavern scenario and its two-person Frames rendered on two Image Models:

- **today**: the Storyboard's plan prompt as it was (`server/prompts/storyboard/plan.md` before
  this test).
- **wording**: the same shape, with the Roleplay Art Agent's wording for the seven aspects (each
  about every person shown), anyone not in the picture left out, clothing carried from Frame to
  Frame, and at most 40 words a sentence. Now the Storyboard's plan and edit prompts
  (`server/prompts/shared/each-person.md`).
- **people**: a new shape (`people-plan.md`): a block per person shown (their identity, then where
  they are, pose, expression and clothing, naming them by a visual handle such as "the scarred
  man", not their name), one sentence for what they do to each other, then the camera,
  environment, lighting, color and style.

## What was run

Windows PC (RTX 4070 12 GB), Ollama with Gemma 4 12B Heretic (`hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`,
Thinking off), ComfyUI 0.41.1. Six Frames per plan, plan seeds 1 and 2, the Text Model unloaded
before rendering. The first two two-person Frames of each plan, at 1216×832, render seed 42, on
Qwen-Image 2.1 (25 steps, ~21 s each) and FLUX.3 Klein (16 steps, ~10.5 s each).

    deno run -A docs/bench/two-people/run.ts plan <today|wording|people> <seed>
    deno run -A docs/bench/two-people/run.ts render
    <ComfyUI's venv python> -I docs/bench/two-people/grid.py

`prompts/`: each plan, with every Frame's Image Prompt. `grids/`: a sheet per shape, a row per
Frame, Qwen-Image 2.1 on the left, FLUX.3 Klein on the right. `out/` (the full-size renders) isn't
committed.

## What it showed

| Shape | Plan time | Two-person Frames rendered | Qwen-Image 2.1 | FLUX.3 Klein |
|---|---|---|---|---|
| today | 30 s (118 s with the model's load) | 4 | 2 wrong: who's where swapped (Kael in the doorway, her inside; 1-f2), an extra person in the doorway (2-f5) | all right |
| wording | 30–31 s | 3 | all right (her hand on the door, the letter and the mug where the prompt put them) | all right |
| people | 38–40 s | 4 | all right, left and right as asked every time | all right |

- **The wording alone fixed what went wrong**, on this sample: no swap and no extra person on
  either model. It costs nothing (the same shape, the same plan time) and touches nothing else, so
  it's now the Storyboard's.
- **The per-person shape did as well, not better**, and gave the most control (left and right
  followed in every picture), but the 12B cut corners with it: clothing sentences as bare noun
  phrases without the handle, a name written as "Kael, the scarred man" (so it didn't match the
  Look's, and the bench dropped his identity until it matched by name or handle), a name the Brief
  didn't give ("Elara"), and a handle the same as the name ("the young woman"). Not worth the
  change to every part of the app on this evidence.
- FLUX.3 Klein got all eleven right, and puts Kael's scars on his arms and shirt as well as his
  face in every shape (seen before, models.md).

## Not checked

The Mac's 26B on the same plans; more seeds or three people; the Chain (one Subject, so not
affected by the wording); a Storyboard Action with the new edit prompt.
