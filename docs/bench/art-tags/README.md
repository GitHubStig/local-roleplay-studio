# Art Agent prose vs tags: a fixed test set

The reference behind "Tags instead of prose" in [models.md](../../models.md): the same Art Agent
prompts rendered on every Image Model, so a new model can be compared with the others by rendering
only its own nine pictures.

## What's here

- `prompts/`: what each Art Agent wrote for Frames 6, 9 and 12 of the Kael tavern Roleplay, as
  prose, Danbooru-style tags and plain tags (2026-09-29, Thinking off). Each entry has the finished
  Image Prompt, who the Art Agent said is shown, and how long it took. `gemma4-31b.json` is the set
  every Image Model is rendered from; the heretic and Qwen3.8 sets back the Art Agent comparison.
- `grids/`: one picture per Image Model. Rows are prose, booru and plain; columns Frames 6, 9 and
  12. 512×512, seed 7, the model's default steps, Elara's nudity in 9 and 12 swapped for a robe.
- `render.py`: renders the prompts on Image Models and builds their grids. Full-size pictures go to
  `out/`, which isn't committed.

What each Frame should show: **6**, Kael alone at a rainy window, raising his pipe; **9**, Kael at
the foot of the stairs pointing up at Elara on the balcony; **12**, Elara at the top of the stairs
with knives, Kael crouched at the bottom with blood on his lips. gemma4's tags for 6 named both
people, so a second person in its booru and plain pictures is the prompt's fault.

## Adding an Image Model

1. Add it to `MODELS` in `render.py`, as it's set up in `server/imageModels.ts`.
2. `python3 render.py <model-id>` (needs mflux and Pillow): nine pictures, then `grids/<id>.jpg`.
3. Compare its grid with the others, and add a row to the table in models.md.

`python3 render.py --grid-only all` rebuilds every grid from `out/`; after a fresh clone `out/` is
empty, so rebuilding needs the models rendered again.

## Caveat: this goes stale

The prompts were written by the Art Agent prompts and Look of 2026-09-29. They stay a fair test of
_Image Models_ for as long as those are roughly what the app sends. Once the Look, `art-frame.md`
or `art-frame-tags.md` change much, the app's prompts no longer look like these: write a fresh
set (and re-render every model on it) rather than comparing a new model on the old one. Nor can
the prompts be written again: the Art Agent writes different ones each time, even with the same
model and story, which is why they're kept.

It's also small (three Frames, one seed, one Art Agent): enough to rank Image Models roughly, not
to split close neighbours. An mflux update can change how a model renders, so an old grid may not
match what that model draws today.
