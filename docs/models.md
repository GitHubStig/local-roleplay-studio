# Choosing models

Which models the app uses now, and why, in short. This page is kept current: when a pick or a number changes, it's replaced here, and the old one goes to the evidence in [research/](research/), which is dated and keeps the history:

- [research/text-models.md](research/text-models.md): every Text Model bench (the Chain, the Art Agent, Suggest, Replies) and the survey of uncensored models.
- [research/image-models.md](research/image-models.md): each Image Model's trials, edits, the Upscaler, and how much of a prompt each reads.
- [research/voices.md](research/voices.md): how the voice engine was chosen and how lines are directed.
- [research/ollama.md](research/ollama.md), and the upgrade logs for [mflux](research/mflux-upgrade-log.md), [ComfyUI](research/comfyui-upgrade-log.md) and [mlx-audio](research/mlx-audio-upgrade-log.md): what each runtime does, version by version.

The Mac is the development Mac (Apple silicon, M5 Pro, 48 GB); the PC is the Windows PC (RTX 4070, 12 GB, 16 GB of RAM). Numbers are one prompt and one seed unless they say otherwise.

## Text Model

**Gemma 4 12B Heretic, GGUF Q4_K_M, Thinking off, for every text job, on either machine** (`hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`, since 2026-10-08). On a Mac with memory to spare, **Gemma 4 26B-A4B Heretic** (`gemma-4-26b-heretic:nvfp4`, built locally with `ollama create -q nvfp4` from `coder3101/gemma-4-26B-A4B-it-heretic`; [how](research/ollama.md#building-an-mlx-model-from-a-heretic-checkpoint)) is 2–3× faster and as careful. Set it in **Settings → Text Model**; it applies from the next Session. Settings also has an Art Agent model: leave it empty, so the same model pictures too.

| Model | Loaded | Chain, per Action | Art Agent, per picture | Suggest | Reply | Runs on | Verdict |
|---|---|---|---|---|---|---|---|
| **Gemma 4 12B Heretic** (GGUF Q4_K_M) | 9.5 GB Mac, 8.3 GB PC | 7.4–9.8 s | 8.5–21 s | 1.6–5.5 s | 6–13 s | both | **the pick**: right on all six Art Agent pictures, copies unchanged sentences word for word; its Suggest tidies the player's style a little |
| **Gemma 4 26B-A4B Heretic** (NVFP4) | 17–19 GB | 2.9–4.0 s | 4.7–8.1 s | 0.9–2.3 s | 2.8–4.3 s | Mac | the fastest that does every job well; right on all six pictures |
| Gemma 4 12B Heretic (NVFP4) | 8.1 GB | 6.0–8.5 s | 9.5–23 s | 2.6–5.3 s | 5.4–10.9 s | Mac | a little smaller and faster than the GGUF, but two pictures wrong |
| Qwen3.5-9B Heretic (Q6_K) | 12 GB | 6.4–7.5 s | 6.6–20.6 s | 2.1–4.1 s | 4.5–8.7 s | both | no smaller once loaded; muddled one picture, odder replies |
| Qwen3.8 27B Uncensored (MLX 4-bit) | 16 GB | 14.7–19.8 s | 17–58 s | 4.6–10 s | 9–18 s | Mac | the best staging and richest prose, at about 5× the time |
| Mistral 7B abliterated (Q4_K_M) | 4.4 GB | 2.5–3.9 s | 8–16 s | 1.6–4.8 s | 4.5–10 s | both | not usable: breaks the Chain's prompt, acts for the player |

Measured on the Mac with Ollama 0.35.1, 2026-10-05 and -06, on the same four tests, one model loaded at a time ([research/text-models.md](research/text-models.md)). On the PC the 12B writes ~52 tokens/s, 100% on the GPU (Ollama 0.40.5, 2026-10-16).

- **One Text Model for every job.** Switching models means reloading, and two loaded at once pushed the 48 GB Mac into swap.
- **Thinking stays off.** It made the Art Agent 5–22× slower with no gain in who's in the picture, and Gemma 4 catches implied changes without it.
- **Models under ~8B can't hold the Chain's prompt**: they drop sentences, write notes into it, or skip the change while saying it's done.
- **Uncensored builds change nothing about what's rendered**: the engine's Limits check every Action and every prompt, whichever model wrote it ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).
- Ollama's context length matters for the GGUF on Windows: see the README ("Ollama's context length").

### What the prompts rely on

Workarounds the benches showed were needed. Check each again when the Text Model changes, and drop any it no longer needs:

- **Who's in the picture comes last** in the Art Agent's and Storyboard's replies, and no field has a `maxLength`: either way round, gemma4 wrote blank lines until its token cap. The sentences are trimmed in code instead (`trimFields`, `server/roleplay/art.ts`).
- **Each aspect is a field of its own** in a Storyboard Frame's or Art Agent's reply: given one string, a model squeezed all seven into a pose sentence ([ADR 0006](adr/0006-storyboards-plan-in-one-call.md)).
- **The Art Agent writes prose, not tags**: prose was right on all seven Image Models tried, tags on none ([ADR 0023](adr/0023-the-art-agent-writes-prose.md)).
- **Suggest is told the player's usual length in words** (the median of their last five Messages) and to keep their capitals and dropped "I": told only "their length and tone", every model tidied the player up.
- **Every Text Model call has a token cap and a time limit**: a runaway reply once held Ollama for 14 minutes ([design.md](design.md#the-frame-loop)).
- **A Roleplay's history starts with the request for the opening Reply**, so turns alternate from the start: Mistral's template refused anything else.

## Image Prompt length

Every Image Model reads the nine aspects in the same order (subject and identity → pose → expression → camera → clothing → environment → lighting → color → art style). A Chain's Image Prompt is nine sentences; a Storyboard Frame's or a Roleplay picture's is the Look's identity of each person shown, the seven sentences the Text Model wrote for that Frame, then the Look's art style, so it grows with each person in it ([CONTEXT.md](../CONTEXT.md), "Image Prompt"). The style comes last, so a model that cuts the prompt loses the style first.

- **ComfyUI cuts nothing**: every text encoder the app uses there reads the whole prompt (ComfyUI 0.41.1).
- **mflux cuts at a fixed length** (counted on mflux 0.22, template included): FLUX.2 Klein 4B and 9B and Z-Image (Turbo and full) at **512 tokens**, which the longest Roleplay pictures (~520) already pass; Krea 2 and Boogu at 1024; Qwen-Image 2.1 (and its Viggle Turbo) and ERNIE at 2048; Ming-Image and FIBO 1.5's prose not at all; Ideogram 4 fails past 2048 rather than cutting. FLUX.3 Klein, MOSS-Image and FIBO 2.0 on mflux are not counted yet.
- A Text Model's pictures run 140–380 words (about 1.7× more from Qwen3.8 than Gemma 4 26B), and the app enforces only the 280-character cap per sentence (`FIELD_LENGTH`, `server/roleplay/art.ts`).

Details, and when to count again: [research/image-models.md](research/image-models.md#how-much-of-the-image-prompt-each-model-reads-2026-10-09).

## Image Model

**Qwen-Image 2.1** (`qwen-image-2.1`, 25 steps, the default since 2026-10-08): it runs on both backends, reads the whole of every prompt, stages two people right from prose, and has been measured the most. For a quick look at what it will draw, **Qwen-Image 2.1 Viggle Turbo** (the Mac); for speed on its own terms, **FLUX.2 Klein 4B** or **FLUX.3 Klein**.

| Image Model (id) | Backends | Steps | Mac, mflux | PC, ComfyUI | Peak on the Mac | Notes |
|---|---|---|---|---|---|---|
| **Qwen-Image 2.1** (`qwen-image-2.1`) | both | 25 (step cache 0.4 on mflux) | 53 s | 21–33 s | 15.8 GB | the default; follows the words |
| Qwen-Image 2.1 Turbo (`qwen-image-2.1-turbo`) | both | 8 | 33 s | 12–14 s | 16.9 GB | Qwen's own distilled model: a look of its own, the least varied in style; a fine grid below 1024 px on mflux |
| Qwen-Image 2.1 Viggle Turbo (`qwen-image-2.1-viggle`) | mflux | 6 | 31 s | – | 16.6 GB | a LoRA on Qwen-Image 2.1: the nearest of any model to its picture, so a preview of it |
| FLUX.2 Klein 4B (`flux2-klein-4b`) | both | 4 | ~10 s | 10 s | ~10 GB | the fastest; keeps a subject consistent with a fixed seed; reads 512 tokens on mflux |
| FLUX.2 Klein 9B (`flux2-klein-9b`) | mflux | 4 | 19–20 s | – | 20.5 GB | stages two people a little better than 4B |
| FLUX.3 Klein (`flux3-klein`) | both | 16 | 40 s | 11–13 s | 10.9 GB | the most detailed; tends to age the people |
| Z-Image Turbo (`z-image-turbo`; 4-bit on mflux) | both | 9 on mflux, 8 on ComfyUI | 28–30 s | 11 s | 4.4 GB | the lightest; ignored a described skin tone and hair once |
| Z-Image (`z-image`, 8-bit) | mflux | 30 | ~190 s (0.22) | – | 7.8 GB | Turbo's undistilled base, with real guidance (4) |
| Krea 2 (`krea-2`), and Krea 2 + LoRA (`krea-2-lora`) | mflux | 8 | 84–85 s | – | 34.3 GB | stages people best; the LoRA (Quiho's refusal reduction, 0.8) costs nothing more |
| ERNIE-Image Turbo (`ernie-image-turbo`) | mflux | 8 | 52 s | – | 23.1 GB | not kept on the Mac: downloads on first use |
| Boogu Image Turbo (`boogu-image-turbo`) | mflux | 4 | 34 s | – | 25.2 GB | not kept on the Mac: downloads on first use |
| Ming-Image 0.1 Design (`ming-image`) | both | 12 | 41–43 s | 16–18 s | 18.5 GB | a design model: lettering right; a signature mark on the PC |
| MOSS-Image (`moss-image`) | both | 50 on mflux, 25 on ComfyUI | **black** on mflux 0.24.0 | 25–26 s | 26.8 GB | the closest to the words on the PC; on the Mac, waiting for mflux 0.24.1 |
| FIBO 1.5 (`fibo-1.5`, 8-bit) | mflux | 6 | 131 s | – | 37.3 GB | its VLM writes a JSON caption first (most of the time); quotes sent curly |
| FIBO 2.0 Dev (`fibo-2.0`) | both | 50 (or 30) | ~410 s | 61–63 s | 17.9 GB | slow on the Mac; prose, not `--expand-prompt` |
| FIBO 2.0 Turbo (`fibo-2.0-turbo`) | mflux | 4 | 21 s | – | 17.4 GB | Dev's picture in a twentieth of the time |
| Ideogram 4 (`ideogram-4`, 8-bit) | mflux | 20 (12 or 48) | 57 s at 512² (0.22) | – | 30.4 GB | a typography model; garbles lettering from prose; gated |

At 832×1216, wall clock from cache including the model load, unless it says otherwise. The Mac's on mflux 0.24.0 with `--low-ram` (2026-10-27), except Qwen-Image 2.1 Turbo (0.23), FLUX.2 Klein 4B (1024², 0.22), Z-Image (1216×832, 0.22), FIBO 1.5 (0.22) and Ideogram 4. The PC's are from cold on ComfyUI 0.40–0.43, Ollama unloaded (2026-10-15 to 2026-10-27). FIBO 2.0 Dev's prose time on the Mac was taken beside a download; with its VLM it took 505 s. Each model's trials: [research/image-models.md](research/image-models.md).

### Editing a picture

| Edit model | Backend | Time | Notes |
|---|---|---|---|
| Qwen-Image 2.1 Edit | mflux (`-q 8 --low-ram`) | ~3 min at 1216×832, 15.1 GB peak | the instruction must describe the result ("an open right hand…"), not ask for a fix; dark areas barely change |
| Qwen-Image 2.1 Edit | ComfyUI | 29 s | a smaller, cleaner result than FLUX.3's |
| FLUX.3 Klein edit | ComfyUI | 14 s | told where by a box as well as the mask, or it paints elsewhere |
| FIBO 2.0 Dev Edit | ComfyUI | 128 s | |
| FIBO 2.0 Edit Turbo | ComfyUI | 13 s | about Dev Edit's result in a tenth of the time |

Every edit is pasted back through the painted mask, so nothing outside it changes. Several painted areas can take one instruction each, in one edit.

### Upscaler

**SeedVR2 7B** (`seedvr2-7b`; 3B in **Settings → Upscaler**), to 2048 px on the long side. On the Mac (mflux, `--low-ram`): 57 s and 20.1 GB peak from 1024² (0.22). On the PC (ComfyUI, fp8, colour correction `lab`): 11–14 s from 832×1216, about 5× the Mac, and **Settings → Upscale with** can send a Mac's upscales there.

## Voices

On the Mac, through mlx-audio 0.6.1 (the voice service, `python/voice/serve.py`); on the PC, through ComfyUI's TTS Audio Suite, with the same two models ([ADR 0010](adr/0010-voices-from-mlx-audio-or-comfyui.md)):

- **Qwen3-TTS VoiceDesign (1.7B) designs each Character's voice once**, from the Text Model's description of it in sound terms. The description asks for a natural adult voice: an adult age, a register, and none of the words that make a voice young or extreme ("high-pitched", "melodic").
- **Higgs TTS 3 (4B) clones that voice for every line**: untagged, at steadier sampling (temperature 0.5, top-k 30), it held the voice 24 times in 24, against 6 with emotion tags. Licensed for research only, non-commercial.
- **Lines are directed with a pace and a sound only** (a sigh, a laugh), by the Text Model at temperature 0.3, "normal" by default. Thoughts are whispered, with a pace and never a sound; on the PC the whisper also takes a low pitch tag, or the voice rises.
- **About 0.8 s per second of speech on the Mac**; ~3.7 s on the PC, where ComfyUI unloads after every job, so a line takes ~31–37 s from cold.
- Lines are saved as **MP3 at 96 kbps**; the reference clip stays WAV.

Evidence: [research/voices.md](research/voices.md), and for the PC [research/comfyui.md](research/comfyui.md#voices-through-comfyui).

## Memory

- **A heavy job unloads the Text Model on the machine it runs on** (a render, an upscale, a 3D scene or figure, a voice from a heavy engine): a render beside the 18 GB 26B pushed the 48 GB Mac into swap and took 6× as long ([ADR 0013](adr/0013-unload-the-text-model-on-the-job-machine.md)).
- **`--low-ram` is on for every mflux render and upscale**: it cut every peak by 2–27 GB, slowed no render, and cost SeedVR2 about 25%.
- **Quantize converts as the model loads**; the app no longer saves quantized copies (dropped on mflux 0.22, when `--low-ram` lowered the peak further). The pre-quantized repos (Z-Image, Ming-Image, FIBO 1.5, Ideogram 4) are mflux-community's.
- **The heaviest on the Mac**: FIBO 1.5 (37 GB), Krea 2 (34 GB), Ideogram 4 (30 GB), MOSS-Image (27 GB). Close everything else for those.
- **On the PC** ComfyUI fills the 12 GB card for every model; the 16 GB of RAM held for MOSS-Image and Ming-Image with ~2 GB to spare, with Ollama unloaded.
- **The voice service** unloads its model after a minute unused, and frees its working memory after every request.
- Python's version (3.11 against 3.14) made no difference to memory or speed: the work runs in MLX on the GPU.
