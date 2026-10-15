---
status: accepted
---

# Style scores don't ask a vision model, until a light one can judge

The style scores (design.md, *Compare*) measure each Image Model's styles with CSD, and whether a
picture matches its Frame's caption with CLIP. CLIP's match is swayed by what a caption says about
the scene: in a landscape Chain, captions naming landscape traditions matched every model's picture
whatever its style. A vision model asked "is this picture drawn in this style?" avoids that.

On 2026-10-15 Ollama's decision model **clef-flash** (9.5B, vision; `/v1/systemone`, which answers
fixed questions with probabilities) judged a 34-Frame Chain's 340 pictures, ~1.4 s each
(research/style-scores.md, "clef-flash as a judge"). It ranked the models differently from CSD at
the top, as spread rewards any change, wanted or not. But it took **27.6 GB** loaded: on the 48 GB
Mac it pushed the machine into swap beside a 20 GB Text Model, so every scoring would first have to
unload the Text Model, as a render does. Its copy runs on MLX, so the PC (12 GB of VRAM, 16 GB of
RAM) can't run it at all, and it needs Ollama, so the OpenAI-compatible Text backend has none.
Ordinary vision models (gemma-4, Qwen3-VL) answer in free text, several seconds a picture.

So **the style scores stay CSD and CLIP**: small (~4 GB on the GPU), on both machines, ~0.07–0.09 s
a picture. clef-flash's ranking is kept as a measurement, not built in.

**Revisit** when a decision model with vision is light enough to load beside the Text Model on both
machines (a few GB, as tev1 and laya are without vision). The plan then: an optional judge in the
`style` job, its answers kept in `style.json` beside the embeddings so only new pictures are judged,
"Matches its Frame" using its hit rate (CLIP's otherwise), and the heatmap and tooltips showing its
verdict; about half a day.

## Considered Options

- **clef-flash as an optional judge, on the Mac only.** Possible, but a heavy model behind a
  setting one machine can't offer, for a measure nobody has checked against their own eye.
- **An ordinary vision model as judge.** No install beyond Ollama, but several seconds a picture in
  free text to parse, against a fraction of a second for CSD and CLIP.
