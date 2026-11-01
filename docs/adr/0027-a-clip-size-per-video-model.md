---
status: accepted
---

# A clip size per video model, Small or Large, in Settings

Each video model made clips at one fixed size: LTX 2.5 at its trained size (~0.9 MP), Wan 2.2 and MiniMax H3 at ~0.4 MP, their ComfyUI templates' settings for a 12 GB card. So the three took about the same time, though at the same size LTX is about twice as fast. The owner asked for a size choice (2026-10-31) and chose how on 2026-11-01. Measured on the Windows PC ([research/video-models.md](../research/video-models.md), "Clip sizes").

- **Two sizes, Small (~0.4 MP) and Large (the model's trained size, ~0.9 MP)**: LTX 1280×704's pixels, Wan 720p's, H3 1152×768, in the picture's shape. Each model's default stays as it was (LTX Large, Wan and H3 Small), so nothing changes until a size is set.
- **No Medium.** None of the models was trained between the two, and a size is a different take of the clip, not the same clip sharper (the size shapes the noise every frame starts from, as it does for a picture), so a third size would be a third take at an untried size. For LTX it would save little, as ~70 s of each clip is loading. To add if Large proves too slow and Small too soft for Wan or H3.
- **Chosen per model in Settings** (Clips tab), not one size for all, which would make Wan and H3 about three times slower or LTX softer together, and not per clip, to keep the Clip section as it is. A model with no size set makes its own, so a change to a model's default would apply.
- **The lengths offered are capped per model and size, from what fits on a 12 GB card**: Wan 2.2 makes up to 5 s at Large (8 s and 10 s ran out of the card's memory); the rest up to 10 s at both. The Clip section offers only those, and the generator refuses a longer one before loading anything, rather than failing after minutes. A model is named with its size in the Clip section's list.
