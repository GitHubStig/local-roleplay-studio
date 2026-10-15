# Style scores: measuring how varied an Image Model's art style is (2026-10-14)

What the Compare dialog's **Style scores** ([design.md](../design.md), *Compare*) measure, with
which models, and why it runs in Python. Measured on the Mac (Apple silicon, 48 GB), 2026-10-14.

## The question

A Chain whose every Frame asks for a new art style, rendered by several Image Models: which model
follows the style changes most, and which keeps drawing in one look whatever it's asked? Every
model drew the same Frames from the same Image Prompts, so what's in the pictures is held equal
and the differences between models are mostly style.

## The measures

Each picture becomes a vector (an embedding); the distance between two pictures is
1 − cosine similarity (0 for the same, up to 2). Per model, over the Frames every compared model
pictured:

- **Spread**: the mean distance between any two of its pictures.
- **Away from the base Frame**: the mean distance of its pictures from its picture of a base Frame
  the player picks (the Frame without a style of its own: often the first, here the last, where
  the style was taken out).
- **Distinct styles**: the Vendi score (Friedman and Dieng, 2023), the exponential of the entropy
  of the similarity matrix's eigenvalues: 1 if every picture is alike, up to one per Frame.
- **Matches its Frame**: how often a picture is among the three nearest, of all the Frames'
  captions, to its own Frame's caption (CLIP, which embeds text and pictures in one space). Spread
  alone would reward noise: this checks the variety is the style asked for.

## CLIP or CSD

- **CLIP ViT-L/14** (OpenAI) sees everything in a picture, what's shown as well as how it's drawn.
- **CSD** (Contrastive Style Descriptors, Somepalli et al. 2024,
  [tomg-group-umd/CSD-ViT-L](https://huggingface.co/tomg-group-umd/CSD-ViT-L), CC-BY-4.0) is CLIP
  ViT-L/14's image side fine-tuned to tell art styles apart whatever a picture shows; its style
  head takes the place of CLIP's projection (the same 1024 × 768).

One Chain, 31 Frames by 9 Image Models (279 pictures), base Frame the last:

| Image Model | CSD spread | CSD from base | CSD Vendi | CLIP spread | CLIP from base | CLIP Vendi |
| --- | --- | --- | --- | --- | --- | --- |
| z-image-turbo | 0.491 | 0.458 | 6.49 | 0.240 | 0.204 | 3.03 |
| z-image | 0.482 | 0.411 | 7.08 | 0.239 | 0.197 | 3.26 |
| krea-2 | 0.452 | 0.395 | 6.58 | 0.239 | 0.196 | 3.26 |
| boogu-image-turbo | 0.429 | 0.391 | 6.01 | 0.204 | 0.208 | 2.85 |
| ming-image | 0.404 | 0.360 | 5.50 | 0.226 | 0.181 | 3.09 |
| flux2-klein-9b | 0.396 | 0.332 | 5.23 | 0.214 | 0.156 | 2.91 |
| ernie-image-turbo | 0.364 | 0.349 | 4.62 | 0.195 | 0.165 | 2.72 |
| qwen-image-2.1 | 0.349 | 0.297 | 4.38 | 0.154 | 0.125 | 2.28 |
| fibo-1.5 | 0.347 | 0.315 | 4.56 | 0.184 | 0.163 | 2.65 |

The two rank the models alike (Spearman across the 9 models: spread 0.93, from base 0.88, Vendi
0.92; per picture, distance from base 0.83). CSD separates them far better (Vendi 4.4–7.1 against
CLIP's 2.3–3.3), since a change of scene doesn't count as a change of style. So the style measures
use CSD, and CLIP is kept for matching pictures to captions, which CSD can't (it has no text side).
Matches its Frame (top three) ran from 61% (ming-image) to 29% (qwen-image-2.1, fibo-1.5); top
one is low for every model (6–26%), as several captions ask for neighbouring styles.

Not checked: whether these rankings agree with the owner's eye; a Session of another kind.

**A trap:** OpenAI's CLIP was trained with QuickGELU. open_clip's plain `ViT-L-14` config uses
GELU and loads the OpenAI weights with only a warning, giving vectors a little off (cosine ~0.95 to
the right ones on the same pixels). `ViT-L-14-quickgelu` is right: its vectors matched
Transformers.js's ONNX CLIP exactly (cosine 1.0000) on the same pixels.

## Python, or Transformers.js in Deno

Both work. Transformers.js 3.8 runs in Deno (onnxruntime-node, on the CPU):

| | Load | Per picture |
| --- | --- | --- |
| Python, PyTorch on the Mac's GPU (MPS), CLIP + CSD together | 5.5 s | ~0.13 s per model* |
| Transformers.js, CLIP fp32 | 22.5 s | 0.40 s |
| Transformers.js, CLIP fp16 | | 0.52 s (vectors as fp32's, cosine 1.0000) |
| Transformers.js, CLIP q8 | | 0.14 s (cosine 0.97 to fp32's) |
| Transformers.js, CSD fp32 (exported to ONNX) | | 0.43 s |

\* While an Image Model rendered on the same GPU; unbatched. Through the app (batches of 8), 279
pictures and 31 captions took about 50 s, loading included.

Timed again 2026-10-15 on the Mac with the GPU otherwise idle, `python/style/make.py` as the app
runs it (batches of 8, both models): 279 pictures and 31 captions embedded in 24.0–24.3 s after a
4–5 s load (29–31 s in all, uv starting it included), and a 34-Frame Chain by 10 models, 340
pictures and 34 captions, in 29.5 s (35 s in all): **~0.09 s per picture** for CSD and CLIP
together, against ~0.26 s while a render shared the GPU.

Transformers.js resizes pictures a little differently from PyTorch's preprocessing (cosine 0.96
for the same picture), which shifts the numbers slightly but not the ranking. CSD exports to ONNX
cleanly (its fp16 conversion broke on a Cast node; fp32 ran, 1.2 GB), but there's nowhere to
fetch it from: no one publishes CSD as ONNX, and a 609 MB file can't go in the repo (GitHub refuses
files over 100 MB; LFS's free quota is 1 GB a month). The other extras already run Python through
uv, so the style scores do too, ~3 times faster on the GPU, with no file to host.

## Charts

Observable Plot, after bundling each candidate with just the chart types used, minified and
gzipped: uPlot 22 KB (made for time series), Chart.js 56 KB (canvas; heatmaps need a plugin),
Observable Plot 88 KB (SVG, bars, lines, heatmaps and tooltips built in), ECharts 197 KB,
ApexCharts 270 KB. In the app's build, the charts' chunk is 94 KB gzipped, loaded only when Style
scores open.
