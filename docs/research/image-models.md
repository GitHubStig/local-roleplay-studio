# Image Models: findings

The evidence behind the Image Models in [models.md](../models.md): each one's trials when it was added, on mflux (Mac) and ComfyUI (Windows PC), the edits, the Upscaler, and how much of an Image Prompt each reads. Each section is dated and says which machine; numbers taken on an older mflux or ComfyUI may not hold on the current one. What changed with each mflux release (the step cache, `--low-ram`, saved copies, the repos moved to mflux-community) is in [mflux-upgrade-log.md](mflux-upgrade-log.md); ComfyUI's are in [comfyui-upgrade-log.md](comfyui-upgrade-log.md) and [comfyui.md](comfyui.md). Whether an Art Agent should write prose or tags for an Image Model is in [text-models.md](text-models.md#tags-instead-of-prose-2026-09-29).

## The first table (2026-09-25 to 2026-10-13)

The Image Model section of models.md as it stood before 2026-10-28, kept for its notes on each model; the current figures are in [models.md](../models.md).


**Use Qwen-Image 2.1** (`qwen-image-2.1`, the default since 2026-10-08), 25 steps: the model both
backends run (mflux on the Mac, ComfyUI on either; "mflux and ComfyUI side by side" in
[research/comfyui.md](comfyui.md)), and the one measured most here (the steps trial, the
step cache and Viggle's turbo, below). On the Mac at 832×1216: 96.5 s with mflux, 55.7 s with the step cache;
on the RTX 4070 through ComfyUI, ~21 s. For speed on a Mac alone, FLUX.2 Klein 4B (`flux2-klein-4b`,
4 steps, ~10–13 s) was the default until then; ComfyUI runs it too since 2026-10-15 (below).

| Model | Time per image | Notes |
|---|---|---|
| **FLUX.2 Klein 4B** | 832×1216: ~10–13 s · 512×768: ~5 s · 512×512: ~4 s | Follows the subject description (skin, hair) and keeps her consistent across Frames with a fixed seed. Peak memory ~17.6 GB at 832×1216, ~10.5 GB at 512 px. |
| FLUX.2 Klein 9B | 832×1216: ~22 s · 512×768: ~10 s · 512×512: ~8 s (4 steps) | Stages two people a little better than 4B from prose (someone up on a balcony stays up there); no better from tags. Peak memory ~28 GB at 832×1216, ~21 GB at 512 px. Not yet checked for keeping a subject consistent across Frames. |
| Z-Image Turbo (4-bit) | 832×1216: ~42 s (9 steps) | Ignored the subject's described skin tone and hair. |
| Z-Image (8-bit) | 1216×832: ~190 s (30 steps, our default) · ~155 s (25) · ~300 s (50, mflux's default) | Added 2026-10-13, measured on the Mac (M5 Pro, mflux 0.22, bfloat16). Turbo's undistilled base: real guidance (the app passes 4, as mflux's README does; mflux's own default is 0, no CFG), so each step costs ~6 s against Turbo's ~4 s. mflux-community's saved 8-bit copy (11 GB; the 4-bit one is 5.9 GB, the original ~31 GB), downloaded in ~3 min. Peak memory ~7.8 GB. **Steps:** 8 Frames of one Chain (painterly styles), rendered at 50 in the app, then again at 30 and 25 with the same prompt and seed: the same composition, figure, palette and finish each time; only small things move between them (a drape there or not, a cherub or a hand added or lost), no more often at 25 or 30 than between the two. Up close, 50 is a little smoother and 25–30 show a little more brush grain. So 30 is the default; 25 is close. |
| Krea 2 (Turbo) | 512×512: ~32 s (8 steps) | Peak memory ~39 GB. |
| ERNIE-Image Turbo | 512×512: ~18 s (8 steps) | Peak memory ~25 GB. |
| Boogu Image Turbo | 512×512: ~16 s (4 steps) | Peak memory ~29 GB. |
| Qwen-Image 2.1 | 512×512: ~23 s (25 steps) · ~38 s (40, mflux's default) | 25 steps looks as good as 40 at 512 px, so it's our default; it holds at 1024² too, where 20 hasn't settled yet ([bench/steps](../bench/steps/README.md)). Peak memory ~35 GB. |
| Qwen-Image 2.1 Viggle Turbo | 512×512: ~13.5 s (6 steps; Mac, 2026-10-14) · 1024²: ~30 s | Qwen-Image 2.1 with Viggle's turbo LoRA, an Image Model of its own since 2026-10-14 (Settings → Fast before; ADR 0016). The nearest of any model to Qwen-Image 2.1 at 25 steps: a quick preview of it ("Viggle or Qwen's Turbo", below). |
| Ming-Image 0.1 Design | 512×512: ~14 s (12 steps) | Added 2026-10-11 (mflux 0.22). A design model (posters, cards, lettering) rendering RGBA, flattened onto white (`--flatten-alpha`; the file comes out RGB). Runs the saved copy mflux's README recommends: DiT at 8 bits, its ~16B MoE text encoder at 5 (18 GB on disk; the original is 53 GB). Peak memory ~13.2 GB. From the Art Agent's kind of prose, one test scene: everything described, the sign's lettering right, painterly. *Since 2026-10-27* it runs mflux-community's 8-bit copy instead (25.2 GB: the text encoder at 8 bits, not 5): peak memory 18.5 GB at 832×1216, the same speed, lettering still right ([research/mflux-upgrade-log.md](mflux-upgrade-log.md)). |
| FIBO 1.5 (8-bit) | 512×512: ~82 s (6 steps) | Added 2026-10-12 (mflux 0.22). Bria's distilled FIBO (DMD, then DMD-R for realism): 4–6 steps at guidance 1, against FIBO's 50 at 5, so the app passes both (mflux reads it as FIBO); the test render bore them out. mflux-community's saved 8-bit copy (14 GB; CC BY-NC like FIBO). Trained on long JSON captions: a prose Image Prompt is first written out as one by FIBO's own VLM (`briaai/FIBO-vlm`, 8.3 GB, always seed 42), freed before rendering. The 6 steps took ~14 s of the 82; the rest is loading both models and the VLM writing, not timed apart. Peak memory footprint 28.7 GB. Reads up to 2048 tokens. One test scene from prose: everything described, the sign's lettering right but partly hidden behind a carved stag. **Quoted lines break it** (2026-10-12): the VLM copies a prompt's straight double quotes (a speech bubble's line) into its JSON unescaped, and mflux fails on the JSON (`JSONDecodeError`), whatever the seed (the VLM's is fixed at 42 in mflux anyway; the Frame's seed reaches only the render). The app sends FIBO curly quotes instead; the Frame that failed then rendered (832×1216: 131 s, 37.3 GB peak), its bubbles' lines legible. |
| Ideogram 4 (8-bit) | 512×512: ~57 s (20 steps) · ~36 s (12) | Added 2026-10-11 (mflux 0.22). A typography model. Runs mflux-community's saved 8-bit copy (26 GB): the same size as the FP8 original, without dequantizing at each step. Gated: accept its terms on Hugging Face and `hf auth login` once. Peak memory ~30.4 GB. A preset sets the steps (and its guidance schedule): Steps offers its three, 12 (turbo), 20 (the default) and 48 (quality). **Needs JSON captions**: from prose it stamped a line of garbled lettering across the middle of the picture (both presets); the same scene as a JSON caption came out clean, sign spelled right (open-threads.md). |

Ming-Image and Ideogram 4 were timed on the 48 GB Mac (2026-10-11; FIBO 1.5 2026-10-12; mflux 0.22, seed 42, with the
app's own arguments, `--low-ram` included): one image each, wall time including loading, with no
Text Model loaded; peak is macOS's peak memory footprint. Timings for the four before those are one test image each (2026-09-25, 48 GB Mac, no quantization,
including model loading), not a comparison of how well they follow the prompt or keep a
subject consistent. FLUX.2 Klein 9B (added 2026-09-29) is about twice as slow as 4B and needs twice
the memory, which next to gemma4 on a 48 GB Mac is tight.

## On ComfyUI with an RTX 4070: four Image Models (2026-10-15)

Three Image Models joined Qwen-Image 2.1 on ComfyUI, each from ComfyUI's own template
(`workflows/` in `server/images/comfyui/`), with Comfy-Org's files:

- **Qwen-Image 2.1 Turbo** (`qwen-image-2.1-turbo`): Qwen's own distilled DiT
  (`qwen_image_2.1_turbo_int8_convrot`, 7.3 GB), not mflux's Viggle LoRA (a separate Image Model,
  `qwen-image-2.1-viggle`). It shares Qwen-Image 2.1's text encoder and VAE. The template fixes 8
  steps (`ManualSigmas`), so Steps offers only 8, and adds `QwenImage21Cache` (the prompt's part of
  each step kept rather than recomputed). The template's optional prompt rewriter is left out.
- **FLUX.2 Klein 4B** (`flux-2-klein-4b`, 7.8 GB, bf16: Comfy-Org has no smaller build): the
  template's distilled half, 4 steps.
- **Z-Image Turbo** (`z_image_turbo_int8_convrot`, 6.2 GB): 8 steps. Its template names the fp8
  Qwen3 4B, but the bf16 one Klein uses (`qwen_3_4b`, 8.0 GB) is the same file in both of Comfy-Org's
  repos, so one download serves both.

Measured on the Windows PC (RTX 4070 12 GB, 16 GB of RAM, ComfyUI 0.40.0), through the app's own
ComfyUI generator: one picture each at 832×1216, seed 42, one prose prompt (the tavern scenario's
opening: two people, rain, firelight), ComfyUI's models freed before each, Ollama unloaded. The
second of two passes (the first ran while a download was still writing to the disk, and was up to
twice as slow):

| Model | Steps | From cold | Sampling and decoding | What it drew |
|---|---|---|---|---|
| Qwen-Image 2.1 | 25 | 32.5 s | 12.4 s | (not looked at: the reference) |
| Qwen-Image 2.1 Turbo | 8 | 12.2 s | 4.3 s | everything asked for, painterly |
| FLUX.2 Klein 4B | 4 | 9.8 s | 3.0 s | everything, but an old grey innkeeper, resting rather than polishing; the most cartoon-like |
| Z-Image Turbo | 8 | 11.4 s | 4.8 s | everything, illustrated; rain falling inside the tavern too |

"From cold" includes loading the models from disk; the rest of it is loading and the text encoder.
ComfyUI filled the card for every model (~11.6 GB peak VRAM in each), so VRAM doesn't tell them
apart. Not checked: keeping a subject consistent across Frames, prompts from tags, or more than one
picture each.

## FLUX.3 Klein on ComfyUI with an RTX 4070 (2026-10-16)

**FLUX.3 Image Klein** (`flux3-klein`), added with ComfyUI 0.41 ([research/comfyui.md](comfyui.md), "Image Models built into ComfyUI"): BFL's distilled checkpoint (`flux3_image_klein_sd_int8_convrot`, 5.4 GB) with its Qwen3-VL-4B encoder (`qwen3vl_4b_int8_convrot`, 4.5 GB) and FLUX.2's VAE, 16 steps, no guidance, no prompt upsampler. Gated on Hugging Face (`black-forest-labs/flux-3-image-klein-comfy`: accept the FLUX Kommunity License).

Measured on the Windows PC (ComfyUI 0.41.1), through the app's own ComfyUI generator: one prose
prompt written from the tavern scenario (Kael behind the bar with the letter, the traveller in the
doorway, the lamp, the rainy window, the scenario's style), seed 42, 832×1216, each from cold (the
generator frees ComfyUI's models after a render), Ollama unloaded, one after another:

| Model | Steps | From cold | From step 1 | What it drew |
|---|---|---|---|---|
| FLUX.3 Klein | 16 | 12.7 s, then 10.9 s | 6.3 s, 5.9 s | everything, the most detailed and painterly; Kael older than 42, his scars as red smears on his coat as well as his face; the staircase seen through the doorway, outside |
| FLUX.2 Klein 4B | 4 | 10.5 s | 3.3 s | everything; the scars as cuts on his face; her in a long coat and trousers, more modern than 18th-century |
| Qwen-Image 2.1 Turbo | 8 | 13.7 s | 4.9 s | everything, the darkest and most chiaroscuro; the letter held up in his hands |

So FLUX.3 Klein costs about as much as the other quick models on the 4070, and needs no step
setting changed. Not checked: the Mac (ComfyUI or mflux), keeping a subject consistent across
Frames, tags, more than one seed, and whether the Text Model's Image Prompts are full enough
captions without BFL's upsampler (this prompt was, by hand).

## MOSS-Image on ComfyUI with an RTX 4070 (2026-10-19)

**MOSS-Image** (`moss-image`), added with ComfyUI 0.42 ([research/comfyui.md](comfyui.md), "Image Models built into ComfyUI"): OpenMOSS's instruction-tuned checkpoint, **Apache-2.0** and not gated, from Comfy-Org's repack (`Comfy-Org/MOSS-Image`): `moss_image_sft_int8_convrot` (5.4 GB), **Qwen3.5-9B** as its text encoder (`qwen3.5_9b_w4a8_gptq`, 7.3 GB) and a smaller FLUX.2 VAE (`flux2-vae_small`, 0.25 GB). ComfyUI's template settings: 25 steps, real CFG 2.5 with a short negative (the template's, less its "nsfw"), `er_sde`. No prompt upsampler, as for FLUX.3 Klein. `_base_` files are the checkpoint for fine-tuning, so they're never picked.

Measured on the Windows PC (ComfyUI 0.42.1), through the app's own ComfyUI generator: the same prose prompt as the 0.42 check (a traveller in a wet cloak at a corner table, a broad innkeeper with rolled sleeves setting down a mug, firelight, rain on the window), seed 42, 832×1216, ComfyUI's models freed before each, Ollama unloaded:

| Model | Steps | From cold | Peak VRAM | Least RAM free | What it drew |
|---|---|---|---|---|---|
| MOSS-Image | 25 | 24.8 s, then 25.8 s | 12.0 GB | 1.8 GB of 16 | everything asked for, and closest to the words: the innkeeper broad, sleeves rolled, setting the mug down; warm, photographic |
| Qwen-Image 2.1 | 25 | 22.6 s | 12.0 GB | 2.7 GB | everything, but the innkeeper seated across from him rather than serving; much darker |

So on the 4070 MOSS-Image costs about what Qwen-Image 2.1 does, despite its 12.7 GB of weights and two passes a step. The 16 GB of RAM held, with the least free 0.9 GB lower than Qwen's. Not checked: more than one seed or prompt, several Frames in a Session (and Ollama loaded beside it, which the RAM may not allow), tags, its layout captions (`MOSSImageLayoutPrompt`), and the Mac.

## Ming-Image on ComfyUI with an RTX 4070 (2026-10-20)

**Ming-Image 0.1 Design** (`ming-image`, the same id as mflux's) runs on ComfyUI too: it's built into 0.42.1 (`comfy_extras/nodes_ming.py`), no custom nodes. Comfy-Org's repack (`Comfy-Org/Ming-Image`, MIT): the DiT `ming_image_0.1_design_int8_convrot` (5.75 GB), its ~16B MoE text encoder Ling-mini 2.0 as **w4a8** (`ming_image_0.1_ling_mini_2.0_w4a8`, 11.9 GB) and its VAE (0.24 GB). ComfyUI's template names the int8 encoder instead, but at 18.2 GB it's more than the PC's 16 GB of RAM; the app takes w4a8 first and falls back to int8, then bf16. The `_layer_` files are Ming-Image-Layer (a picture split into layers), never picked. The workflow is the template's (12 steps, no CFG, euler, simple, `ModelSamplingFlux` at the picture's size) without its prompt enhancer (Qwen3.8-27B), and sent as RGB (`SplitImageWithAlpha`), as Qwen-Image 2.1's is; mflux flattens onto white instead, which a scene with no transparency doesn't tell apart.

It keeps the template's **Comfy Kitchen int8 attention** (`ModelAttentionBackend`): attention's queries and keys rounded to 8 bits and multiplied on the card's int8 tensor cores. Where it can't run (no NVIDIA or AMD card, as on a Mac) the node logs a warning and falls back to PyTorch's attention, so the workflow still runs there (read in ComfyUI's code; not run on the Mac).

Measured on the Windows PC (ComfyUI 0.42.1), through the app's own ComfyUI generator: one prose prompt from the tavern scenario (a traveller in a rain-soaked cloak at a corner table by the window, a broad innkeeper with rolled sleeves setting a mug down, firelight, lanterns, beams), seed 42, 832×1216, ComfyUI's models freed before each, Ollama unloaded. Ming-Image twice with each attention, alternating:

| Model | Steps | From cold | From step 1 | Peak VRAM | Least RAM free | What it drew |
|---|---|---|---|---|---|---|
| Ming-Image, Kitchen attention | 12 | 15.8–16.0 s (18.3 s the first time, its files read from disk) | 5.7–6.1 s | 10.0–10.9 GB | 1.9 GB of 16 | everything asked for, and closest to the words: the cloak beaded with rain, the innkeeper setting the mug down; painterly. A scrawled signature at the bottom right |
| Ming-Image, PyTorch attention | 12 | 16.8–17.6 s | 6.6–6.9 s | 9.7–10.4 GB | 1.9 GB | the same composition, small things moved (the window's panes, a chair); the signature too |
| Qwen-Image 2.1 | 25 | 20.8 s | 12.9 s | 11.4 GB | 4.6 GB | everything, the innkeeper standing at the table rather than setting the mug down; the traveller seen from behind |

So on the 4070 Ming-Image is a little faster than Qwen-Image 2.1, and Kitchen attention takes ~15% off its sampling (about a second at this size, more at larger ones). The 16 GB of RAM held, about as close as MOSS-Image's. Each run gave the same file each time for a seed. Not checked: more seeds or prompts, the signature's frequency (a design model's habit; a negative can't be given with no CFG), several Frames in a Session (and Ollama loaded beside it), tags, and Kitchen attention for the other ComfyUI Image Models.

## mflux 0.23: FLUX.3 Klein and Qwen-Image 2.1 Turbo on the Mac (2026-10-17)

mflux 0.23 (2026-10-16) runs two Image Models the app had only on ComfyUI, so both are now mflux Image Models too, under the same ids: **FLUX.3 Klein** (`flux3-klein`, `mflux-generate-flux3`, the distilled checkpoint: 16 steps, no guidance; 20.3 GB from Black Forest Labs' gated repo, and since 2026-10-27 18.5 GB from mflux-community's ungated copy) and **Qwen-Image 2.1 Turbo** (`qwen-image-2.1-turbo`, Qwen's own 8-step checkpoint through `mflux-generate-qwen-2.1`, no CFG, no step cache; 32.5 GB).

Measured on the Mac (M5 Pro, 48 GB, 2026-10-17, mflux 0.23, float16, `--low-ram`, as the app runs them), one tavern prompt (two people, a letter, lamps, rain), seed 42, times including the model load:

| Image Model | 832×1216 | 512² | Peak memory | The picture at 832×1216 |
|---|---|---|---|---|
| Qwen-Image 2.1, 25 steps, step cache 0.4 | 55.9 s | | 16.7 GB | everything asked for, painterly |
| Qwen-Image 2.1 Viggle Turbo, 6 steps | 30.2 s | | 18.0 GB | nearly the same picture as 25 steps |
| **Qwen-Image 2.1 Turbo**, 8 steps | 33.2 s, 33.4 s | 11.7 s | 16.9 GB | everything; a little cleaner, less brushy than 25 steps; reruns pixel-identical |
| **FLUX.3 Klein**, 16 steps | 40.9 s, 39.2 s | 11.6 s | 13.3 GB | everything, the most detailed (bottles, more lamps, the rain lit), the only one showing the scars; but the man made old and grey, as on the PC |

**Qwen Turbo below 1024 px**, as mflux warns: at 512² the picture has a fine crosshatched grid over it, seen when zoomed. Not at 832×1216. **Qwen Turbo's text encoder is Qwen-Image 2.1's**: all 750 tensors byte-identical, only split into one file instead of four, so 17.5 GB of its 32.5 GB repeats what's on disk (the Hugging Face cache never shares files across repos, so a fresh install that runs both stores it twice too). Its VAE is the base VAE cast to bf16 (all 238 tensors equal after the cast; 0.7 GB against 1.4). Its transformer is distilled: 234 of 297 tensors differ. Rechecked 2026-10-18 with MLX array comparisons as well as byte hashes, with the transformers as a control. Not checked: either model over many Frames, or keeping a Subject consistent.

The 0.22 to 0.23 upgrade itself is in [research/mflux-upgrade-log.md](mflux-upgrade-log.md#0230--mac-2026-10-17).

Also in 0.23, not used yet: `mflux-generate-flux3-edit` (up to ten reference images, a lighter candidate for Subject consistency than Qwen-Image 2.1's edit; open-threads.md), FLUX.3 LoRAs, and `mflux-generate-krea2-controlnet` (Krea 2 Turbo from a depth map).

## MOSS-Image on mflux (2026-10-27, Mac): added, not usable yet

Added as `moss-image` (the same name as on ComfyUI, "MOSS-Image on ComfyUI", above), from mflux-community's bf16 copy (26.2 GB; Apache-2.0), with mflux's own 50 steps and guidance 3 (ComfyUI's template runs 25 and 2.5; not compared on mflux). Measured on the Mac (M5 Pro, 48 GB, mflux 0.24.0, 832×1216, seed 42, `--low-ram`, bf16): download 633 s; peak MLX memory 26.83 GB; a 50-step render took 249 s and 246 s from cache, **but the picture is black**: mflux 0.24.0's Qwen3.5 text encoder returns NaN for prompts over about 200 tokens, and every Image Prompt is longer. Fixed on mflux's main after the release; waiting for 0.24.1. So there is no quality, speed or step finding yet, and the times above are of a run that drew nothing. Details and the prompt-length bisect: [research/mflux-upgrade-log.md](mflux-upgrade-log.md); what's left to try: open-threads.md.

## FIBO 2.0 Dev on mflux (2026-10-27, Mac)

Added as `fibo-2.0` (the same name as on ComfyUI, "FIBO 2.0 on ComfyUI", above), `mflux-generate-fibo2` on mflux-community's bf16 copy (25.1 GB; not gated, CC BY-NC like Bria's own; Bria's repo is gated). Measured on the Mac (M5 Pro, 48 GB, mflux 0.24.0): 832×1216, seed 42, `--low-ram`, bf16, with the app's prose Image Prompt (the tavern one, 350 tokens, a sign reading "THE RUSTY LANTERN"), first through `--expand-prompt`, then as plain prose. Download 796 s. A repeat of each render gave a byte-identical picture.

| | Wall clock from cache, including loads | Peak MLX memory |
|---|---|---|
| 50 steps, guidance 5 (mflux's, the model card's and ComfyUI's), with `--expand-prompt` | 513 s, then 505 s | 17.85 GB |
| 30 steps, `--cfg-end 0.6` (mflux's faster setting), with `--expand-prompt` | 292 s | 17.85 GB |
| 50 steps, guidance 5, plain prose (no VLM) | about 410 s (a render beside a download, so not timed for the record) | not kept |
| FIBO-vlm alone, writing the caption | 92 s (load 5.4 s, writing 86.5 s, 5,762 characters) | 11.88 GB |
| The same prose, ComfyUI on the RTX 4070 (int8, no VLM, 50 steps, CFG 5) | 62.8 s, then 60.7 s | not measured |

- **The VLM is about 92 s of the 505 s** (a fifth), and about a third of the 30-step run. A JSON caption written by the Art Agent would skip it ([open-threads.md](../open-threads.md)).
- **The pictures**: on mflux both people, the letter in Kael's hand, the doorway behind him, the sign spelled right (though the VLM's `text_render` was empty), rain on the window. Photographic, though the caption's `style_medium` is "oil painting" (it also adds a `photographic_characteristics` block), and the lamp doesn't light his face from below. The 30-step picture has the same scene and elements (mean difference 14.5 of 255, PSNR 18.9 dB, a letter on the bar and a window curtain are new). On ComfyUI the same words give a real oil painting, with the sign spelled right (broken over two lines) and a signature-like mark at the bottom left, but Kael left of the doorway rather than in the foreground. One prompt, one seed each.
- **`--expand-prompt` made it worse here.** Four pictures of the same prompt and seed: mflux with the caption is photographic, with Kael in the foreground; mflux with plain prose is an oil painting, with the composition and style close to ComfyUI's prose picture; ComfyUI given the same VLM caption is still a painting. So the photograph came from mflux's caption path (it drops empty fields and scores and sends a compact caption; not checked), not from the weights. One prompt and one seed. mflux's README says prose "works less well"; not seen here.
- **The app's entry**: 50 steps, guidance 5, plain prose (no `--expand-prompt`: the VLM is about 92 s more, and the picture was the one that missed the style asked for); Settings' Steps offer 50 or 30 (`--cfg-end 0.6`, as mflux's README suggests). No `float16` (not tried) and no Quantize measured: converting as it loads has not lowered the peak or sped up anything elsewhere (below), and 17.85 GB fits without it.
- **Quoted lines** pass through straight. FIBO 1.5's VLM broke on them, and this one's captions passed mflux's caption check for five prompts (including `says "Yo!"` and a sign reading "OPEN", about 50–67 s each); with plain prose the VLM isn't used at all, so no `curlyQuotes`.
- **Edit**: `mflux-generate-fibo2-edit` runs on the community Dev copy (no refusal for missing `config.json`, unlike Qwen-Image 2.1's): "Replace the mug with a pewter tankard" at 8 steps took 151 s, peak 18.79 GB, and swapped the mug for a tankard. With `--mask-path` (a box over the mug) 154 s, but the picture changed outside the mask too (mean 6.6 of 255, up to 245), so mflux doesn't paste the rest back as the app's ComfyUI edit does. Not wired into the app: no edit model on mflux yet.
- **Not tried**: a LoRA, Quantize or the saved q8 (13.4 GB), more prompts or seeds, `float16`, keeping people consistent across Frames, and Windows (no mflux).

## FIBO 2.0 Turbo on mflux (2026-10-27, Mac): Dev's picture in 21 s

Added as `fibo-2.0-turbo`: Bria's **Edit Turbo** checkpoint (Dev distilled to 4 steps without guidance; CC BY-NC) run as a generator, which mflux's README says it can do (`mflux-generate-fibo2 --model mflux-community/fibo-2-0-edit-turbo-mflux-bf16 --base-model fibo2-edit-turbo`). Download 360 s for 25.1 GB. Same Mac, prompt, seed and size as Dev above, bf16, `--low-ram`, 4 steps (mflux's default, guidance 1):

| | Wall clock from cache | Peak MLX memory |
|---|---|---|
| Plain prose | **21 s** | 17.40 GB |
| With `--expand-prompt` | 114 s, then 117 s (the repeat gave the identical picture) | 17.49 GB |

- **The picture from plain prose** is an oil painting with both people, the letter in Kael's hand, the lamp on the bar, rain at the window and the sign spelled right (over two lines): as good on this prompt as Dev's 505 s one, in about a twentieth of the time and with the same memory. One prompt and one seed, with no side-by-side against Dev over several scenes yet.
- **The app's entry**: no `--expand-prompt`, and a single step preset (4), so Settings' Steps, whatever they are, render at 4. mflux's own default guidance of 1 isn't passed.
- **Not tried**: more prompts and seeds, Quantize or the q8 copy (13.4 GB), a LoRA, keeping people consistent across Frames, and the edit command with it ([open-threads.md](../open-threads.md)).

## Viggle or Qwen's Turbo: a quick Qwen-Image 2.1 (2026-10-17)

Two Image Models render Qwen-Image 2.1 in about half its time: **Viggle's turbo LoRA** on it (`qwen-image-2.1-viggle`, 6 steps) and **Qwen's own distilled Turbo** (`qwen-image-2.1-turbo`, 8 steps). Compared on the Mac (mflux 0.23) on the Chain of 31 Frames that the style scores were chosen on, each Frame asking for an art style of its own, all three rendered from the same Image Prompts and seed, then embedded for the Compare dialog's style scores ([research/style-scores.md](style-scores.md)):

| Image Model | Render, mean of 31 | Distance from Qwen-Image 2.1's picture of the same Frame, CSD (style) · CLIP | Distinct styles (CSD Vendi) | Matches its Frame (top 3) |
|---|---|---|---|---|
| Qwen-Image 2.1, 25 steps, step cache 0.4 | 55.1 s | | 4.38 | 29% |
| Viggle LoRA, 6 steps | 30.9 s | 0.052 · 0.038 | 4.18 | 23% |
| Qwen's Turbo, 8 steps | 33.2 s | 0.130 · 0.080 | 3.58 | 16% |

- **Viggle is a preview of Qwen-Image 2.1**: its picture was the nearer to Qwen-Image 2.1's in 31 of 31 Frames by CSD (30 of 31 by CLIP), and the nearest of the eleven other models by both; the next, FLUX.3 Klein, was at 0.294 · 0.139. The owner's eye agreed: Viggle's look like the 25-step pictures, Turbo's are pictures of their own.
- **Qwen's Turbo is a model of its own**, and the least varied in style of the twelve: last on distinct styles and on matching its Frame, so in a Chain that changes style each Frame it follows the change least.
- So both stay: Viggle to see quickly what Qwen-Image 2.1 will draw, Turbo as a fast model in its own right. Not checked: fine detail and small text side by side, more than one seed, the PC.

## How much of the Image Prompt each model reads (2026-10-09)

mflux tokenizes the prompt, inside each model's own template or chat template, and silently cuts it
at a fixed length (mflux 0.22, from each model's weight definition). Counted with mflux's own
tokenizers on the Mac, over the 37 Image Prompts in the local Sessions (35 from Roleplays' Art
Agent, 2 from a Chain; 120–380 words, median 253 for the Roleplays):

| Image Model | Cut at (tokens) | Template | Median prompt | Longest | Cut |
|---|---|---|---|---|---|
| FLUX.2 Klein 4B and 9B | 512 | 12 | 352 | 523 | 1 of 37 |
| Z-Image Turbo | 512 | 8 | 348 | 519 | 1 of 37 |
| Krea 2 | 1024 | 39 | 379 | 550 | 0 |
| Boogu | 1024 | 0 | 340 | 511 | 0 |
| ERNIE-Image | 2048 | 1 | 347 | 525 | 0 |
| Qwen-Image 2.1 | 2048 | 22 | 362 | 533 | 0 |
| Z-Image (full) | 512 | 8 | 259* | 414* | 0 of 198* |
| Qwen-Image 2.1 Viggle Turbo | 2048 | 22 | 273* | 428* | 0 of 198* |
| Ming-Image 0.1 Design | none | 26 | 280* | 435* | 0 of 198* |
| FIBO 1.5 | 2048, on the JSON caption; the prose: none | 0; the VLM's: 11 | 262* (prose) | 417* (prose) | prose: 0 of 198*; caption: not measured |
| Ideogram 4 | none: fails past 2048 | 8 | 259* | 414* | 0 of 198* |

\* Counted 2026-10-16 on the Mac (mflux 0.22, the same method) over a different, shorter set: the 198 Image Prompts in `docs/bench/two-people/prompts/`, from the public tavern scenario (99–307 words, median 185). Every count includes the template.

- **Qwen-Image 2.1, the default, reads all of every prompt**, with room for four times as much.
- **Klein and Z-Image already lose the end of the longest** (a 380-word Roleplay picture, by 7–11
  tokens). The end is the **art style**, as every Image Prompt ends with it (ADR 0005), so those
  are the words a 512-token model drops first.
- **The caps allow more than was seen**: seven sentences of up to 280 characters each come to about
  450 tokens on their own, before the identities and the style, so a busy Frame with both people
  could reach ~600. A Storyboard Frame adds an identity for each person it shows (up to three); no
  Storyboard was saved here to measure.
- **ComfyUI cuts nothing** (checked 2026-10-16 in ComfyUI 0.41.1's code, `comfy/text_encoders/`, on the PC): every text encoder the app uses on it sets `max_length=99999999`, unpadded: Qwen3-VL 8B for Qwen-Image 2.1 and its Turbo, Qwen3-VL 4B for FLUX.3 Klein, Qwen3 4B for FLUX.2 Klein 4B and Z-Image Turbo; and past a tokenizer's length ComfyUI starts another chunk rather than cutting (`sd1_clip.py`). So on ComfyUI the whole prompt is always read; the cuts above are mflux's.
- **None of the bench's prompts is cut by the five models added since** (2026-10-16). Their longest, 297 words from a long Chain, is 414–435 tokens. But that set is shorter than the Sessions'.
- **Z-Image (full) reads like Z-Image Turbo**: the same token ids over all the bench's prompts, the same 8-token template, the same cut at 512 (`z_image_weight_definition.py`). So it would also lose the end, the art style, of the longest Session prompt.
- **Viggle's LoRA leaves the text side alone**: it changes only the transformer's blocks (`qwen21_lora_mapping.py`), so the Turbo reads as Qwen-Image 2.1 does.
- **Ming-Image cuts nothing**: its weight definition gives 1024, but `MingImage.encode_prompt` calls the tokenizer itself, without a length. Its template is the checkpoint's chat template, written out in `ming_condition_encoder.py`.
- **Ideogram 4 fails rather than cuts**: `Ideogram4Tokenizer.tokenize_one` raises an error past 2048 tokens, so an over-long prompt fails the render instead of losing its end. The app sends it prose, which mflux passes on as it is, with a warning that it isn't a JSON caption. A JSON caption would go through the same path, as compact JSON text.
- **FIBO 1.5 cuts the caption, not the prose**: FIBO's VLM (`FiboVLM.generate`) reads the whole prose prompt in an 11-token template, uncut (the 1024 in its weight definition isn't used on that path). It writes a JSON caption of up to 4096 tokens, and FIBO's text encoder reads that caption, without a template, cut at 2048 (`fibo_weight_definition.py`, `fibo_text_encoder/prompt_encoder.py`). How long the captions run wasn't measured: the app doesn't keep them, and counting them needs the VLM run on each prompt.
- A limit is set by the model's text encoder and by mflux's or ComfyUI's code, so it changes only with a new model or an upgrade of either: check again then, as above (mflux 0.22, ComfyUI 0.41.1).

"About 250 words" (2026-09-27) was a measure of what the Art Agent wrote, not a target; the limit
in force is the 280-character cap per sentence (`FIELD_LENGTH`, `server/roleplay/art.ts`).

## Qwen-Image 2.1 Edit: fixing a hand with a painted mask (2026-10-23, Mac)

The first step of "Editing a Frame's picture" (open-threads.md): `mflux-generate-qwen-2.1-edit` (mflux 0.23) on a malformed hand in a painted 1216×832 Frame, with a soft ellipse painted over the hand (`--mask-image`, white repainted), the output at the picture's own size, seed 1, the tool's other defaults (strength 1.0). M5 Pro, 48 GB, with Edge and VS Code open (~8 GB) and ~4 GB in swap throughout.

| Run | Time | Peak |
|---|---|---|
| full weights | 169–174 s | 38.9–39.3 GB |
| `-q 8` | 177 s | 39.4 GB |
| `--low-ram` | 168 s | 25.9 GB |
| **`-q 8 --low-ram`** | **179 s** | **15.1 GB** |

- **What isn't painted stays as it was**: in every run, no pixel outside the mask moved by more than 9 of 255, and their mean change rounds to 0.
- **The instruction has to describe the result, not ask for a fix.** "Fix the hand…: an open, well-formed right hand…, in the same style" gave back the same malformed hand, only sharper (a mean change of 4.5 of 255 inside the mask). Saying what to paint instead ("Replace the hand… with a new, anatomically correct right hand reaching forward: palm facing down, index finger extended, the other fingers relaxed…, five distinct fingers") repainted it cleanly (a mean change of 19), in the picture's brushwork, with no visible seam at the mask's edge.
- **`-q 8` and `--low-ram` change nothing visible**: within 1.3 of 255 of the full run inside the mask. `-q 8` alone saves nothing (it quantizes after loading the full weights); with `--low-ram` the peak falls to 15.1 GB, so that's the pair to run, as for renders. Nothing to download: it runs on Qwen-Image 2.1's own weights.
- About 3 minutes an edit at this size, every way, against ~90 s for a 1024² render with the saved 8-bit copy (above); likely the picture passed as a reference and the edit tool's guidance, as in the reference-portrait trial, not separated.

**Two areas in one edit, and dark areas** (2026-10-23, Mac, `-q 8 --low-ram`, seed 42, a 1024² FLUX.2 Klein 9B picture from a Session: a lit face, a shirt in shadow, and a lit object apart from the face). Seven edits, ~3 minutes each, mean change of 255 in each area, nothing outside them moving by more than 1:

| Painted | Told | Face | Second area |
|---|---|---|---|
| face + shirt (in shadow under the gun) | terse: "laughing face, red shirt" | 26.6 | 1.9 |
| face + shirt | each area described ("In the painted area over his face: … In the painted area over his shirt: …") | 27.8 | 1.9 |
| face | terse: "laughing face" | 26.5 | – |
| face | described: "The same man's face, laughing, mouth wide open…" | 27.5 | – |
| shirt | "The same shirt, bright red." | – | 2.5 |
| face + the object (lit, apart from the face) | each area described, the object to be "painted bright red" | 26.1 | 22.1 |
| object | "The same [object], painted bright red." | – | 19.0 |

- **Several areas take one instruction each, in one edit**: the face laughed and the object turned red together, as each did alone. Saying which painted area gets what is enough; Qwen's own way, coloured outlines drawn on the picture with the prompt naming the colours, wasn't needed, and the mask keeps the rest exactly as it was.
- **Dark areas resist**: a shirt in deep shadow went only faintly dark red, alone or with the face, as two objects asked for on a dark shelf on 2026-10-23 came back as the bottles that were there. Something bright painted into shadow stays mostly shadow.
- **A face responds to terse or described wording alike**: an edit of a face that changes nothing is likelier asking in words the model doesn't know than painted wrong.

## Edits through ComfyUI (Windows PC)

ComfyUI now has four edit models (`server/images/comfyui/models.ts`, `COMFYUI_EDITORS`). The first two described here use their Image Model's own files, so nothing more is downloaded: Qwen-Image 2.1 Edit (`qwen_image_2.1_int8_convrot`, `qwen3vl_8b_int8_convrot`, `qwen_image_2.1_vae_bf16`) at 25 steps, and FLUX.3 Klein distilled (`flux3_image_klein_sd_int8_convrot`, `qwen3vl_4b_int8_convrot`, `flux2-vae`) at 16, as in ComfyUI's templates. The pictures were rendered from the public tavern scenario (`scenarios/tavern.md`), not taken from a Session. RTX 4070 (12 GB), 16 GB of RAM, ComfyUI 0.42.5.

**First trials** (2026-10-24), with the first workflows, which gave the model the picture but not the painted area, and pasted the result back through the mask; a hand repainted at 832×1216:

- **Both fit the 4070 at the app's portrait size**: Qwen's lowest free VRAM was 1.32 GB and free RAM 2.80 GB; FLUX.3's 1.55 GB and 4.63 GB, in about 17 s.
- **Qwen's hand came out brighter and more sharply textured** than the oil painting around it. FLUX.3's kept the painting's dark palette and brushwork, once its oval covered the whole hand and wrist (one that missed part of the hand left stray fingertips).

**Telling the model where to paint** (2026-10-26). The owner found FLUX.3's edits did nothing useful. A hand is already in the picture, so "change the hand" says where; something new isn't, and the model put it where it liked. Asked for "a pewter tankard of foaming ale" on a bare bar, FLUX.3 drew a large tankard in the middle of the bar and the mask kept a cut-off slice of it. Four ways (seed 43, one oval mask over the bar top; the mean change per pixel, of 255, inside the mask and outside it, before it's pasted back):

| FLUX.3 told | Inside | Outside | Tankard |
|---|---|---|---|
| the instruction, as built | 20.5 | 11.6 | a slice of one drawn elsewhere |
| + the area as a box (`<obj_1>` and its bbox, as ComfyUI's `Flux3LayoutPrompt` writes) | 35.9 | 9.9 | whole, in place |
| + the area as the latent's noise mask (`SetLatentNoiseMask`) | 13.3 | 1.6 | cut off |
| **both** | 29.7 | **1.7** | **whole, in place** |

- **So both went in**: the box tells FLUX.3 where, and the noise mask holds the rest of the picture while it paints. Qwen has no boxes, but takes the noise mask the same way. Each edit is still pasted back through the mask, so nothing outside it moves.
- **Through the app** (`comfyuiImageGenerator().edit`, the same picture and mask): FLUX.3 in 13.6 s, a whole tankard in place, though with a stray strap down one side; Qwen in 29.1 s, a smaller, cleaner one. Outside the mask a mean change of 0.01 each, the most 17–22 in the softened rim the paste-back blends across.
- **Not tried yet**: Qwen's hand again with the noise mask, more seeds, and two painted areas in one FLUX.3 edit (each gets its own box).

## FIBO 2.0 on ComfyUI (2026-10-27, Windows PC)

With the int8 Comfy-Org repack on the RTX 4070 (12 GB VRAM, 16 GB RAM), ComfyUI 0.43.0 (0.43.1 for Turbo's text-to-image, added 2026-10-28), using the app's `comfyuiImageGenerator` directly against its local API. One render each at 832×1216; the prompt described a rain-soaked tavern, a traveller at a window table, and an innkeeper setting down a mug. FIBO Dev and Turbo text-to-image used seed 42; both edits used the same render, seed 43, and a rectangular mask over the mug. **FIBO 2.0 Turbo** (`fibo-2.0-turbo`) is the Edit Turbo checkpoint (`fibo2_edit_turbo_int8_convrot`, already installed for the edit, so no new download) run as a generator, as on mflux ("FIBO 2.0 Turbo on mflux", above): Dev's text-to-image graph (`fibo-2.0-turbo.json`) at 4 steps and CFG 1.

| Model and task | Steps / CFG | App call | Peak VRAM | Least free RAM | Result |
|---|---:|---:|---:|---:|---|
| FIBO 2.0 Dev, text-to-image | 50 / 5 | 63.0 s | 11,518 MiB | 3,491 MiB | Rainy tavern scene with both people and the innkeeper serving the mug; painterly, with illegible sign text and a signature-like mark |
| FIBO 2.0 Turbo, text-to-image | 4 / 1 | 10.0 s, then 9.3 s | – | – | Both people, the lamps, the rain and the sign's lettering drawn correctly; a different composition from Dev's (warmer, a larger sign) |
| FIBO 2.0 Dev Edit, painted mug | 50 / 5 | 127.7 s | 11,451 MiB | 2,439 MiB | Replaced the mug with a silver tankard and blue stag; preserved the scene |
| FIBO 2.0 Edit Turbo, painted mug | 4 / 1 | 13.4 s | 11,490 MiB | 3,069 MiB | Similar tankard edit in about one tenth of the Dev Edit time |

Memory was sampled about twice a second with `nvidia-smi` and Windows' available physical memory counter; VRAM includes roughly 1.3 GiB already in use before each run. Pixel comparison of each edit with its source found a mean absolute RGB change of 23.2 (Dev) and 26.0 (Turbo) inside the mask, and exactly 0 outside it across 993,512 pixels. Turbo's text-to-image run (a dash above) was timed only, with its sign added to the prompt and no memory sampled; a second Dev render of that prompt took 59.6 s and drew the sign legibly. Turbo took about a sixth of Dev's time, less than the twelfth that 4 steps against 50 steps of two passes each would give, as each call includes loading and encoding; whether ComfyUI skips the negative pass at CFG 1 was not measured (that needs the sampler's seconds per step). These are single runs, not a benchmark; the text model was not loaded. The tests used the typed instruction directly; adding a box-style location caption as with FLUX.3 was not compared.

The FIBO edit workflows use the reference image's VAE-encoded latent with the painted noise mask; both edits changed only pixels inside the mask. Only int8 weights were run. The file picker accepts the named bf16 DiT and text-encoder alternatives, but neither was tested with an actual render.

## Upscaler

Upscale uses **SeedVR2 7B** by default (`seedvr2-7b`, `mflux-upscale-seedvr2 --resolution 2048`);
3B can be chosen in **Settings → Upscaler**. From a
512×512 image to 2048×2048: 7B ~46 s, 3B ~41 s, most of it loading the model (832×1216 to
2048×2992 with 7B: 64–66 s, through the app or the CLI alike, 2026-10-07; the upscale itself ~15 s); both add real
texture (fabric weave, skin) over plain resizing, 7B slightly cleaner. Peak memory ~39 GB for
either, so, like the larger Image Models, it can push a 48 GB Mac into swap next to gemma4.

**`--low-ram` on SeedVR2** (2026-10-09, Mac, mflux 0.22, 7B, a 1024×1024 picture to 2048×2048,
twice each): **57 s and 20.1 GB with it, against 45–47 s and 36.4–36.5 GB without**, the same
picture to the pixel. Unlike the Image Models it costs time, about 25%, but it nearly halves the
peak, so the app passes it to every upscale too.

**On ComfyUI with an RTX 4070** (2026-10-07; Comfy-Org's fp8 builds, ComfyUI's built-in SeedVR2):
512×512 to 2048×2048 in **9.5 s with 7B, 7.9 s with 3B**, about 5× the Mac; 832×1216 to 2048×2992
in 11–14 s. Settings → "Upscale with" can send Upscale there from a Mac rendering with mflux. Its
colour correction is `lab`: without it the result came out 11% darker. Details in
[research/comfyui.md](comfyui.md).

Model loading is only ~5 s of an image, so keeping the Image Model loaded in a separate process
isn't worth it yet ([open-threads.md](../open-threads.md)).

## Memory, and Python

The Text Model and the Image Model share the Mac's memory. gemma4 31B (~19 GB) plus FLUX.2 Klein
(~10.5 GB at 512 px, ~17.6 GB at 832×1216) fits comfortably on a large-memory Mac; on a smaller
one, use the 512 px sizes. The larger Image Models (Krea 2, Qwen-Image 2.1, Boogu, ERNIE) peak
at 25–39 GB even at 512 px: next to gemma4 on a 48 GB Mac they can push the system into swap.

**Python's version doesn't change memory or speed** (2026-10-01, uv's Python 3.14.4 against
3.11.15, same Mac, nothing else loaded): FLUX.2 Klein 4B at 512 px peaked at 10.53 GB on both and
rendered in ~4.0 s against ~4.4 s (within `uv run`'s own overhead); Higgs TTS 3 peaked at 10.1 GB
on both and spoke the same three lines in 2.55–2.84 s on both. The work runs in MLX's compiled
code on the GPU; Python only drives it. The memory is the models' weights: see the memory
headroom thread in [open-threads.md](../open-threads.md). mflux, mlx-audio and the voice service run
on uv's own Python (`--managed-python`, `python-preference = "only-managed"`), apart from any
other Python on the Mac.
