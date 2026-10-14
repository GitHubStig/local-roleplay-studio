---
status: accepted
---

# A turbo with its own weights is an Image Model; a preset is a step count

Until 2026-10-14, Settings had **Fast**: for Qwen-Image 2.1 it added Viggle's turbo LoRA at 6 steps,
for Ideogram 4 it picked the 12-step turbo preset. It was read from Settings at each render (ADR
0015), so it changed every Session at once, it could be flipped only on the Settings page, and a
picture didn't record it: a Fast render replaced the model's full one on the Frame, and Compare and
its export labelled it as the full model. ComfyUI had no Fast, and Qwen's own Turbo (2026-10-09) is
a separate checkpoint with its own sampler, which a toggle would have had to hide.

Since 2026-10-14, one rule:

- **Different weights make a different Image Model.** Viggle's LoRA changes the weights, so it's
  **Qwen-Image 2.1 Turbo (Viggle LoRA)** (`qwen-image-2.1-viggle`), as Z-Image and Z-Image Turbo are
  two. It's switched in the Session like any model, keeps its own picture beside the full model's,
  and has its own column in Compare.
- **The same weights sampled differently is the Steps setting.** A model whose steps are presets
  lists them (`stepPresets` in `images/mflux/models.ts`, `stepChoices` to the screens), and Steps
  offers only those: Ideogram 4's 12 (turbo), 20 (the default) and 48 (quality). A count that isn't
  one renders at the default. Viggle's turbo has one, 6.

`fast` is gone from Settings; an older file still loads, without it. The Sessions on the owner's Mac
were edited by hand (their `fast` removed), with no upgrader. Pictures rendered with Fast before
can't be told apart and stay labelled as the full model.

## Considered Options

- **Keep Fast, and record it on the picture.** Fast pictures would get their own place, but the
  toggle would stay global and on the Settings page, and every backend would need its own Fast.
- **Ideogram 4 Turbo as a model too.** The same weights and file as Ideogram 4, only a preset
  (mflux's `Ideogram4Scheduler.PRESETS`), so it's a step choice instead. The cost: a 12-step picture
  doesn't get its own column in Compare, as no step change on any model does.
