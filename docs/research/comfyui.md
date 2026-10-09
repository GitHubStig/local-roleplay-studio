# ComfyUI as an image backend: findings (2026-10-07)

Notes kept while adding ComfyUI beside mflux (branch `feat/comfyui`, merged 2026-10-07; the idea
as first planned is in [windows.md](windows.md), the decision in
[ADR 0009](../adr/0009-comfyui-image-backend.md)). Dated, and added to as the work goes on.

## What's installed on the owner's Mac

- **Comfy Desktop** (`/Applications/Comfy Desktop.app`) with one install, "ComfyUI", at
  `~/ComfyUI-Installs/ComfyUI`: ComfyUI **0.39.1** (it updates itself on the stable channel; it was
  0.37.4 when checked on 2026-10-02), the `mac-mps` standalone build, Python 3.13, its own
  environment in `standalone-env/`.
- **Models live outside the install**, in `~/ComfyUI-Shared/models` (75 GB), through a model-paths
  file Comfy Desktop writes per install (`~/Library/Application Support/Comfy Desktop/
  instance-model-paths/inst-….yaml`). The install's own `models/` folders are empty. Anything run
  outside the Desktop app must pass that file (`--extra-model-paths-config`) to see them.
- Image models there: **Qwen-Image 2.1** (`diffusion_models/qwen_image_2.1_int8_convrot`, 7.3 GB;
  `vae/qwen_image_2.1_vae_bf16`; text encoder `text_encoders/qwen3vl_8b_int8_convrot`, 9.4 GB) and
  **Krea 2 Turbo** (`krea2_turbo_fp8_scaled`, 13.1 GB, with `qwen3vl_4b_fp8_scaled` and
  `qwen_image_vae`), plus a MiniMax video model. No upscale models, no SeedVR2 node.
- Custom nodes: none besides the examples (the Manager is on, `--enable-manager`).
- It isn't running unless Comfy Desktop is open; Comfy Desktop starts it on port 8188.

## Qwen-Image 2.1 in ComfyUI

- **Supported natively**, no custom nodes: ComfyUI has its own model class (`QwenImage21`), latent
  format and text-encoder path. The text encoder loads through the standard `CLIPLoader` with type
  `qwen_image`; ComfyUI recognises the Qwen3-VL-8B weights and uses Qwen-Image 2.1's tokenizer.
- **Its template** is `image_qwen_image_2_1_t2i` (the one the owner uses from ComfyUI's template
  browser). It ships in the templates package inside ComfyUI's own environment
  (`ComfyUI/.venv`, `comfyui-workflow-templates-json` 0.1.103), not in `standalone-env/`, which is
  only the bootstrap Python (no torch). Its graph, inside a subgraph: `UNETLoader`
  (`qwen_image_2.1_int8_convrot`), `CLIPLoader` (`qwen3vl_8b_int8_convrot`, type `qwen_image`),
  `TextEncodeQwenImage21` (prompt, negative prompt, and optional reference images at about
  1024 px, which give positive, negative and a latent), `EmptyLatentImage` 1024×1024,
  `KSampler` **25 steps, CFG 1, euler, simple**, `VAEDecode`, `SaveImageAdvanced`. Also a
  `QwenImage21Cache` node (where the attention cache is kept: `auto` is its default, so it can be
  left out) and an optional prompt rewriter (`TextGenerate` with a 9B Qwen 3.5 model, switched off
  by default). Only built-in nodes.
- **`TextEncodeQwenImage21` takes reference images**: the route for reference portraits (keeping a
  person's face from Frame to Frame) and edits on ComfyUI, as `--image-paths` is on mflux.
- Its defaults in ComfyUI's code: sampling shift **0.69** ("scheduler mu at 1024×1024"). A plain
  `EmptyLatentImage` is adapted to the model's latent channels by `fix_empty_latent_channels`, so
  no model-specific latent node is needed.
- The owner's ComfyUI log (2026-09-27) shows prompts taking 171–197 s each, with that template.

### Measured: one render through the API (2026-10-07)

ComfyUI 0.39.1 started headless from its own environment (`ComfyUI/.venv/bin/python main.py
--listen 127.0.0.1 --port 8188 --extra-model-paths-config <the Desktop's file>`), the workflow
above in API format, 1024×1024, seed 7, a tavern prompt, Ollama unloaded:

| | ComfyUI (int8 convrot, MPS) | mflux (saved 8-bit copy, MLX) |
|---|---|---|
| Per step | **5.7 s** | 3.2 s ([bench/steps](../bench/steps/README.md)) |
| 25 steps | 142 s | ~80 s (94 s with the load) |
| Whole render, cold | **168 s** (text encoder 8.9 GB loaded, DiT 6.9 GB, ~20 s) | 94 s; 67 s with the step cache |

So on the Mac ComfyUI is about 1.8× slower per step on the same model, and has no step cache; mflux
stays the Mac's backend. The picture was right (Kael at the bar with the letter, the woman in the
rainy doorway, the oil-painting style), returned as a **1024×1024 RGBA PNG** through `GET /view`:
the Qwen-Image 2.1 VAE decodes RGBA.

A second render through the app's own client (`server/images/comfyui/`), 512×768, 25 steps: **89 s**,
3.1 s a step, with **no loading**: ComfyUI had kept both models (~16 GB) loaded since the first.
That's faster for the next picture, but the memory stays taken: the Text Model would have to load
beside it, and on a 12 GB card the two can't both fit (the Text Model spills to the CPU, and its
replies slow many times over). So the client asks ComfyUI to
unload after each render (`POST /free`), as an mflux process frees its memory when it ends; the next
picture pays the ~20 s load again, as mflux does.

## The API (checked 2026-10-02 against 0.37.4)

`POST /prompt` queues a workflow in API format and returns a `prompt_id`; `GET /history/{id}`
lists its outputs and `GET /view?filename=…&type=output` fetches one; `POST /upload/image` sends an
input picture; the `/ws?clientId=…` WebSocket reports the running node and step progress;
`POST /interrupt` cancels, `POST /free` unloads models; `GET /object_info` lists the installed
nodes, `GET /models/{folder}` the model files, `GET /system_stats` the device and memory.

## Working on Windows too (design constraints, 2026-10-07)

ComfyUI is the image backend for Windows (mflux is Mac only), so nothing in the client may lean on
the Mac:

- **Through the API only, never the file system.** ComfyUI may run as Comfy Desktop, the portable
  build or a manual install, on this machine or another; its folders differ on each. Pictures come
  back over the WebSocket (first planned as `GET /view`; see "Through the app" below) and are saved
  into the Session's folder by the app; a picture to upscale goes up through `POST /upload/image`.
  No paths from ComfyUI's side are used.
- **The address is a Setting**, defaulting to `http://127.0.0.1:8188` (ComfyUI's own default, and
  what Comfy Desktop used here). Some Comfy Desktop builds have used port 8000, so Settings should
  say where to look.
- **Model files differ per machine.** On the Mac the Qwen-Image 2.1 files are int8 (`_int8_convrot`);
  a 12 GB NVIDIA card may want fp8 or a GGUF build instead. So an Image Model on ComfyUI is a
  workflow plus a list of acceptable files for each loader, and the app picks the first one
  `GET /models/{folder}` says is installed (and says which is missing if none is). The workflow
  JSON never hard-codes one file.
- **Memory:** on a 12 GB card the Qwen-Image 2.1 DiT (7.3 GB int8) and its text encoder (9.4 GB)
  don't fit together; ComfyUI loads, uses and offloads them in turn by itself, fast enough on the
  RTX 4070 (~21 s a picture: "On Windows with an RTX 4070" below). `POST /free` after each job
  gives the card back to the Text Model, as unloading Ollama gives it to a render.
- **Nodes:** only ComfyUI's built-in nodes, so a fresh install on either machine runs the workflow.
  SeedVR2 turned out to be built in too (see "Upscaling on ComfyUI" below).

## Gotchas found on the way

- **Two Pythons in a Comfy Desktop install.** `standalone-env/` is only the bootstrap (no torch);
  ComfyUI itself runs from `ComfyUI/.venv`. Starting it by hand needs that one:
  `ComfyUI/.venv/bin/python main.py --listen 127.0.0.1 --port 8188 --extra-model-paths-config …`.
- **Cancel only our prompt.** `POST /interrupt` with `{"prompt_id": …}` interrupts only if that
  prompt is the one running (without it, whatever is running stops, even another app's);
  `POST /queue` with `{"delete": [id]}` removes it if still queued.
- **History is written after the prompt says it's done.** ComfyUI sends `execution_success`
  (or `_error`, `_interrupted`) from inside the run, and only then writes the prompt to its history
  (`main.py`'s `prompt_worker`: `execute()`, then `task_done()`), ending with `executing` and no
  node. A `POST /history` delete sent on the first message can arrive before the write and delete
  nothing, leaving the prompt, its text and all, in ComfyUI's memory. Seen after a Cancel on Windows
  and after a successful render on the Mac (2026-10-07); the client now waits for the closing
  `executing` (up to 10 s) every time before deleting. Checked: two renders on the Mac, history
  unchanged.
- **The WebSocket carries everything**, for every client: messages are filtered by `prompt_id`.
  `progress` (`value`, `max`) also comes from non-sampler nodes, so only `max > 1` counts as steps;
  binary messages are preview images.

## Through the app (2026-10-07)

- **A Chain's Opening Frame, rendered by ComfyUI** (a test Session whose Settings copy named
  ComfyUI): the app streamed the text phase, the image phase with all 25 steps, then committed the
  Frame. Text 11.6 s (gemma), image 92.9 s at 512×768 (the models loaded again, as the previous
  render had freed them). ComfyUI's queue was empty afterwards.
- **Cancel mid-render:** ComfyUI logged "Interrupting prompt …" for that prompt only and stopped at
  step 2 of 25; the Chain kept its one Frame, with no picture left behind.
- **ComfyUI kept a copy of every picture** in its output folder (`SaveImage`, found while cleaning
  up: `~/ComfyUI-Installs/ComfyUI/ComfyUI/output/rpg/`). `PreviewImage` instead writes to its temp
  folder (`…/ComfyUI/temp/`), which ComfyUI empties only **when it starts** (and only with its
  assets system off, the default), so pictures sat there until the next restart. Settled on
  **`SaveImageWebsocket`**: a node in ComfyUI's own repository (`custom_nodes/
  websocket_image_save.py`, so in every install), which sends the full-size PNG as a binary
  WebSocket message (4 bytes `1`, an image; 4 bytes `2`, PNG; then the file) to that client only,
  and writes nothing. The prompt is also deleted from ComfyUI's in-memory history (`POST /history`
  with `{"delete": [id]}`), which otherwise keeps the prompt text until a restart. Checked: after a
  render, the output folder holds only its placeholder, the temp folder is empty, `GET /history`
  is `{}`, and ComfyUI's log has no prompt text (it logs "got prompt" and timings only). Comfy
  Desktop's `user/comfyui.db` wasn't touched (last changed 2026-09-21).

## On Windows with an RTX 4070 (2026-10-07)

Windows 11, RTX 4070 (12 GB), 16 GB of RAM; Comfy Desktop with ComfyUI 0.39.1, PyTorch
2.12.1+cu130, on `127.0.0.1:8188`. The same int8 files as the Mac's were installed
(`qwen_image_2.1_int8_convrot` 6.8 GB, `qwen3vl_8b_int8_convrot` 8.7 GB, the bf16 VAE 0.6 GB), and
they run on CUDA as they are, so no fp8 build was needed. Settings' check said "Up: ComfyUI 0.39.1
on cuda:0 NVIDIA GeForce RTX 4070, with the model's files".

Two Frames of a Chain through the app, Qwen-Image 2.1 at 832×1216 (Portrait), 25 steps, Text Model
Gemma 4 12B Heretic (`hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`) at Ollama's 16k context:

| | Frame 0 | Frame 1 |
|---|---|---|
| Text (with the Text Model's reload) | 5.5 s | 15.3 s |
| Image phase to step 1 (load, prompt encode) | 10.2 s | 7.9 s |
| 25 steps | 11.3 s, **0.47 s a step** | 11.3 s, **0.47 s a step** |
| Decode and send | 2.5 s | 1.6 s |
| **Picture** (the Frame's `timings.image`) | **24.0 s** | **20.8 s** |

An earlier pair of renders the same day measured the same: 28.5 s and 21.1 s, 0.45–0.46 s a step.
So the 4070 renders the same model at 832×1216 about **12× faster per step than ComfyUI on the
Mac** (5.7 s at 1024²) and ~7× faster than mflux (3.2 s), loading and unloading both models every
picture. Both pictures were right (the keeper at the lighthouse door with the soaked stranger, the
storm behind; then inside, by the fire). After each, `POST /free` brought the card back to ~1.2 GB
in use (Windows and apps), and the next Text Model call loaded on a clear GPU.

- **ComfyUI's own renders hold the GPU.** In that earlier run ComfyUI reported only 2.5 GB of VRAM
  free before the app started, with nothing loaded in Ollama: most likely models from a render done
  in ComfyUI's own interface just before, which ComfyUI keeps loaded. The Text Model then loaded
  partly on the CPU, and the Opening Frame's text took 80 s. The app frees ComfyUI's models only
  after its own renders, not before its text.
- **Kept nothing, on Windows too:** neither render left a file in ComfyUI's output or temp folder or
  an entry in `GET /history` (what was there came from that manual run), and the queue was empty.
- **`localhost` is slow on Windows:** it tries IPv6 (`::1`) first, and a refused connection there
  takes time before IPv4: a first request to ComfyUI took 2.1 s via `localhost` from PowerShell
  against 20 ms via `127.0.0.1` (and 323 ms against 1 ms from Deno, to a test server). The app's
  default is `127.0.0.1`; the client's Cancel test failed on Windows until its stand-in used it too.
- **ComfyUI can crash and stay half-alive** (2026-10-07, ComfyUI 0.39.1, Comfy Desktop, started
  with `--listen 0.0.0.0`). Loading Qwen-Image's text encoder for a render, ComfyUI logged
  `aimdo: … comfy-aimdo WDDM VRAM query failed. Using physical capacity as fallback`, then `Fatal
  Python error: Aborted` (in `model_patcher.load`). The render before it, minutes earlier, had
  finished in 21 s. The process stayed, with port 8188 open and the app's WebSocket connected, but
  answered nothing, so the render waited for good: nothing closed the socket. Cancel still freed it
  at once. Since then a running job asks `GET /system_stats` every 15 s and fails ("ComfyUI stopped
  answering (it may have crashed): restart it") after two checks with no answer; the calls sent
  without waiting (`/interrupt`, `/history`, `/free`) give up after 10 s, the upload after 60 s.
  Why the memory query failed wasn't found; `comfy-aimdo` is ComfyUI's dynamic VRAM loader.
- **Cancel, on Windows** (2026-10-07): a Chain's render cancelled at step 8 of 25 and an upscale
  at tile 7 of 40 both stopped at once; the Chain kept its Frame as it was, no file was left, and
  ComfyUI's queue was empty. But both prompts **stayed in ComfyUI's history**, as `error` with an
  `execution_interrupted` message: the app had asked to delete them the moment Cancel was pressed,
  and ComfyUI writes an interrupted prompt to the history only once it has stopped it
  (`prompt_worker` in `main.py`: `execution_interrupted`, then `task_done`, which writes the
  history, then `executing` with no node). Now, after a Cancel, the app waits in the background
  (up to 10 s) for that last message before deleting it; run again, the history was empty (`{}`).
  Also found: the WebSocket closed itself on Cancel (a listener meant only for while it connects),
  so nothing could have been heard from ComfyUI after a Cancel anyway.
- **A Roleplay's pictures, on Windows** (2026-10-07; Gemma 4 12B Heretic as the Text Model and so
  the Art Agent, prose style, Qwen-Image 2.1 on ComfyUI at 832×1216): a short Roleplay at the inn,
  then `picture` and `render` jobs on two Frames. The Art Agent wrote the Look (both identities and
  the style) and each Image Prompt in its shape (the identities, the seven sentences, the style),
  carrying the clothes and the room from one Frame to the next and taking the pose from the Reply
  ("her palms flat on the counter"). Picture 9.0 s (the Look included) and 16.4 s; render 30.5 s
  and 22.0 s. Both pictures matched their prompts and each other (the same two people, clothes and
  room), and show beside their Replies on the Roleplay screen with no errors.
- Not run on Windows: sizes other than Portrait and Small square. Upscale: see "Upscaling on
  ComfyUI" below.

## Comfy Desktop, ComfyUI, and who starts it (2026-10-07)

- **ComfyUI** is the engine: a Python program (`main.py`) that loads the models, runs workflows on
  the GPU, and serves its web interface and the API on a port (8188). It's what the app talks to.
- **Comfy Desktop** is an app that installs, updates and runs ComfyUI: it keeps ComfyUI and its own
  Python in `~/ComfyUI-Installs/ComfyUI`, writes the model-paths file pointing at
  `~/ComfyUI-Shared/models`, starts ComfyUI when opened and stops it when quit, and shows ComfyUI's
  web interface in its own window. The **portable build** (Windows: unzip and run a `.bat`) and a
  **manual install** (clone and `python main.py`) run the same ComfyUI.
- **ComfyUI runs without Comfy Desktop**, from the install Desktop manages:

  ```sh
  cd ~/ComfyUI-Installs/ComfyUI/ComfyUI
  .venv/bin/python main.py --listen 127.0.0.1 --port 8188 \
    --extra-model-paths-config "$HOME/Library/Application Support/Comfy Desktop/instance-model-paths/inst-1789974989101.yaml"
  ```

  Without the model-paths file it looks only in its own, empty `models/`. Desktop still updates
  this install; don't run both on one port. It answered about 10 s after starting.
- **The app neither starts nor stops ComfyUI**: it expects one answering at the address in
  Settings, and says "Couldn't reach ComfyUI … is it running?" when none does. Starting one with a
  command set in Settings was considered and dropped (ADR 0009, 2026-10-09).
- **ComfyUI keeps nothing of the app's**: no picture in its output or temp folder (the picture
  comes back over the WebSocket), no prompt in its history (deleted after each render), no prompt
  text in its log; the only copy of a picture is the one in the Session's folder.

## Upscaling on ComfyUI (2026-10-07)

- **SeedVR2 is built into ComfyUI 0.39.1** (`comfy/ldm/seedvr/`, `comfy_extras/nodes_seedvr.py`),
  with templates for upscaling an image with 3B or 7B (`utility_seedvr2_{3b,7b}_int8_upscale_image`:
  `LoadImage` → `SeedVR2Preprocess` → `VAEEncodeTiled` → `SeedVR2Conditioning` → `KSampler` (one
  step, CFG 1) → `VAEDecodeTiled` → `SeedVR2PostProcessing`), built-in nodes only. It's the model
  mflux uses, so the Upscaler setting (7B or 3B) carries over. Comfy-Org's files
  (`Comfy-Org/SeedVR2`): 7B int8 8.3 GB or fp8 8.2 GB (for an NVIDIA card), 3B int8 3.5 GB or fp8
  3.4 GB, a "7B sharp" variant, nvfp4 builds (newer cards than an RTX 4070), and a 0.5 GB VAE.
- Other choices, not taken: GAN upscalers (built in, ESRGAN models of tens of MB, seconds, but
  they sharpen rather than restore and look over-crisp on a painting); re-rendering bigger with an
  image model (adds detail but changes the picture; heaviest); cloud nodes (paid, and the picture
  leaves the machine).
- **The wrinkle: the picture has to reach ComfyUI first, and that leaves a copy.** No built-in node
  takes a picture inline, and ComfyUI has no API to delete an upload; `POST /upload/image` keeps it
  in its `input/` folder for good. The least bad with built-in nodes: upload with `type=temp` and
  load it as `"<name> [temp]"`, so the copy sits in the temp folder until ComfyUI next starts (it
  empties temp on startup). That's the one exception to "ComfyUI keeps nothing of the app's".
  **Settled (2026-10-07): temp, then blanked.** After the upscale the app uploads a 1×1 PNG under
  the same name with `overwrite=true`, so the picture is gone at once and only a 70-byte stub (a
  random `rpg-<uuid>.png`) waits in temp for ComfyUI's next start. Checked on Windows: Comfy
  Desktop's temp folder is `ComfyUI-Installs/ComfyUI/ComfyUI/temp/`, and after an upscale it held
  only that 1×1 stub. A custom base64 loader would leave nothing, but every ComfyUI would need it
  installed.
- **mflux's SeedVR2 files don't load in ComfyUI** (tested 2026-10-07, to avoid a second copy on
  the Mac). ComfyUI finds them where they are, in the Hugging Face cache, through an extra
  model-paths file (`numz/SeedVR2_comfyUI`: 7B and 3B fp16, the VAE), with no copy or download;
  but its `UNETLoader` refuses them: "Could not detect model type". numz's weights are laid out for
  the SeedVR2 custom node, not ComfyUI's built-in SeedVR2, which wants Comfy-Org's repack. So on the
  Mac Upscale stays with mflux (nothing downloaded) unless Settings send it to a ComfyUI machine
  ("Upscale with"), which needs Comfy-Org's files (7B fp8 7.7 GB, 3B fp8 3.2 GB, the 0.5 GB VAE).

### On the RTX 4070 (2026-10-07)

Comfy-Org's `seedvr2_7b_fp8_e4m3fn`, `seedvr2_3b_fp8_e4m3fn` and `seedvr2_ema_vae_fp16` (fp8 for
an Ada card; int8 is listed first, so the Mac's build would win where both are), through the app's
job queue, ComfyUI 0.39.1, models loaded and unloaded every time:

| | RTX 4070, ComfyUI | Mac, mflux ([models.md](../models.md)) |
|---|---|---|
| 7B, 512×512 → 2048×2048 | **9.5 s** | ~46 s |
| 3B, 512×512 → 2048×2048 | **7.9 s** | ~41 s |
| 7B, 832×1216 → 2048×2992 | **12.4 s** (13.7 s the first time) | not measured |
| 3B, 832×1216 → 2048×2992 | **11.1 s** | not measured |

About 5× the Mac's speed. The model is a small part of it: most of the time is the tiled VAE (40
tiles to encode, 40 to decode at 2048×2992, reported as the job's "steps"), so 3B saves little.
The files had just been downloaded, so they may have been read from Windows' file cache; a cold
read from disk could add a few seconds. The card was back to ~1.2 GB in use afterwards.

- **Colour: `lab`, not the template's `none`.** With `none`, SeedVR2's output was visibly darker:
  mean brightness 29.2 → 25.9 (−11%), red −17%. With `lab` ("transfer color in CIELAB space,
  preserving detail", the node's own default) it was 17.4 → 17.0 (−2%), and the added detail (hair
  strands, skin, the knit of a scarf) is the same. The workflow uses `lab`.
- **Size:** "scale shorter dimension" to 2048 on `ResizeImageMaskNode`, as mflux's
  `--resolution 2048`; 1216 × 2048/832 comes out at 2992 (a multiple of 8), not 2994.
- **The Upscaler's own address:** Settings' `imageBaseUrl` at upscale time, as the Upscaler choice
  itself is read then; a render uses its Session's. A Mac can keep mflux for pictures and send
  only Upscale to the PC; Settings' check then covers only SeedVR2's files there.
- **Gotcha:** a second ComfyUI started on a port already taken (here Comfy Desktop's 8188) logs
  "Port 8188 is already in use" and exits, and whatever answers on that port is the other one. Test
  instances go on another port (8189).
- **Upscaling from the Mac on the Windows PC works** (owner, 2026-10-07): the Mac's Settings point
  "Upscale with" at the PC's ComfyUI across the local network. For that, ComfyUI must listen beyond
  `127.0.0.1`. The newer Comfy Desktop (instance-based, `%APPDATA%\Comfy Desktop`) has no listen
  option in its settings; each installation has **launch arguments** instead
  (`installations.json`, `"launchArgs": "--enable-manager"`), and `--listen 0.0.0.0` goes there.
  Windows Firewall must allow TCP 8188 on the private network. ComfyUI has no login, so anything on
  the network can use it. The Mac's upscale time over the network wasn't measured.

## mflux and ComfyUI side by side (2026-10-07)

**What differs between the backends**, for the same Image Model:

- **A fixed seed reproduces a picture only within one backend.** The seed's noise comes from a
  different generator (MLX in mflux, PyTorch in ComfyUI), the noise schedules differ (mflux's
  "linear" for Qwen-Image 2.1, ComfyUI's "simple" with its 0.69 shift), and the weights are
  quantized differently (mflux's saved 8-bit copy, ComfyUI's int8 build). The guidance is the same:
  none (mflux's default 1.0, ComfyUI's CFG 1). Measured: Qwen-Image 2.1, seed 7, 832×1216, 25
  steps, the same prompt, through the app's own image code: ComfyUI and mflux on the Mac drew
  **different compositions** (Kael standing at the end of the bar with the woman full-length in the
  doorway, against a close-up of him at the bar with her small behind), mean pixel difference 23.5
  of 255; mflux with and without the step cache, near the same (2.4).
  [bench/backends/seed7-mac.webp](../bench/backends/seed7-mac.webp): ComfyUI, mflux, mflux with the
  step cache.
- **Within a Session it holds:** a Session keeps the backend and address it started with, so its
  re-renders don't change engine. Two Sessions on different backends look a little different.
- **The same seed on two ComfyUIs (the Mac's and the PC's) gives the same scene, not the same
  picture.** ComfyUI makes the seed's noise on the CPU, so both start alike: the same layout (Kael
  standing at the end of the bar with the letter, the stool, the doorway on the right). The details
  part ways (the woman nearer or farther, the lantern moved, a different window): mean pixel
  difference 12.75, between mflux's 23.5 and the step cache's 2.4. Most likely the int8 arithmetic
  differs between MPS and CUDA, and 25 steps let it grow.
  [bench/backends/seed7-comfyui-mac-pc.webp](../bench/backends/seed7-comfyui-mac-pc.webp): the Mac's,
  then the PC's.
- **Upscale is all but the same:** both correct colour in LAB space (mflux adds a wavelet step and
  weights brightness at 0.8), and the weights differ (mflux's fp16, ComfyUI's fp8 on the PC). The
  same 832×1216 picture upscaled by each: mflux kept its brightness exactly (23.9 of 255), ComfyUI's
  came out 2% darker (23.4); mean difference between them 3.8; the added detail (hair, skin, the
  scar) much the same. So one Session can hold upscales from both, as "Upscale with" applies at once.
  [bench/backends/upscale-mflux-comfyui.webp](../bench/backends/upscale-mflux-comfyui.webp): mflux,
  then ComfyUI, a close-up of the face.
- **Alpha, nearly harmless:** ComfyUI's Qwen-Image 2.1 pictures are RGBA; SHARP (`load_rgb`,
  `remove_alpha`) and LiTo (`convert('RGB')` before its cut-out) drop it, and browsers show them
  as usual. The files are about a third larger. **But the alpha isn't a solid 255**: it wavers
  between 240 and 255 (54,035 pixels of an 832×1216 render, hundreds of thousands in its upscales,
  checked on Windows 2026-10-07), and TripoSplat's `preprocess_image` takes any alpha below 255
  for a cut-out already made, so it skipped BiRefNet and made the whole picture, fireplace, chair
  and floor, into the "figure". `python/triposplat/make.py` now hands it the picture as RGB, so
  BiRefNet always cuts the person out; that fixes pictures already in Sessions too.
  **Since 2026-10-07 ComfyUI sends RGB:** the Qwen-Image workflow splits the alpha off before
  `SaveImageWebsocket` (`SplitImageWithAlpha`, built in), and the SeedVR2 one drops its template's
  `JoinImageWithAlpha` and splits at the end too. Checked on Windows: a render and its upscale both
  came back RGB, 12-16% smaller (2.1 MB against ~2.5; 12.3 against ~14.0, not the third guessed
  above), the upscale's brightness still within 2%. The fourth channel matters beyond TripoSplat:
  Qwen-Image 2.1's edit mode reads it as an edit mask and keeps a transparent input transparent
  ([image-to-3d.md](image-to-3d.md), "Transparency"), so a picture with alpha at 240-255 fed back
  as a reference or edit input could come back faintly see-through (not tried). Pictures made
  before the change are still RGBA.

**Timings, the same job on each** (Qwen-Image 2.1 at 832×1216, 25 steps, seed 7; SeedVR2 7B to
2048×2992; through the app's image code, models loaded and freed each time):

| | Mac (M5 Pro, 48 GB): mflux | Mac: ComfyUI | PC (RTX 4070): ComfyUI, from the Mac |
|---|---|---|---|
| Picture, 8-bit / int8 | **96.5 s** (3.46 s a step) | **162.4 s** (5.86 s a step) | **20.9 s** (0.54 s a step) |
| Picture, step cache 0.4 | **55.7 s** (1.97 s a step) | no step cache | no step cache |
| Upscale, 7B | **66.4 s** | (needs Comfy-Org's files) | **14.0 s** |

The PC's were run from the Mac across the network (Wi-Fi or Ethernet as set up then), so they
include sending the picture and fetching the result; on the PC itself the same jobs measured
21–29 s and 12.4 s. So a picture renders ~2.7× faster on the PC than the Mac's quickest (mflux with
the step cache) and ~4.6× faster than mflux without it, and an upscale ~4.7× faster.

**Why the Mac's upscale takes a minute:** the CLI run directly (`mflux-upscale-seedvr2 --model
seedvr2-7b --resolution 2048`) took the same: **64 s** for 832×1216 → 2048×2992 and **43 s** for
512×512 → 2048×2048 (the ~46 s in models.md). mflux's own progress bar puts the upscale itself
(one SeedVR2 step) at ~15 s; the rest is loading the 7B's 16.5 GB of fp16 weights, which a new
process does every time, and the tiled VAE. It grows with the output: 6.1 megapixels against 4.2.

## Previews: the picture forming (2026-10-09, on the Windows PC)

ComfyUI 0.39.2 on the RTX 4070, Qwen-Image 2.1, 25 steps at 1024×1024, through the API:

- **By default it sends no previews**, only the final PNG (`SaveImageWebsocket`).
- **Asked for per prompt** (`extra_data: { preview_method: "latent2rgb" }` on `POST /prompt`, as
  ComfyUI's own frontend does), the sampler sends a binary image message at every step: format 1, a
  JPEG at half size (512×512 here), before the PNG (format 2). 25 previews, 4.7–44 KB each.
- **They cost no time**: 21.7 s with them, against 21.2–21.6 s without (two runs each).
- **`auto` and `taesd` gave the same images as `latent2rgb`**: there's no TAESD decoder for
  Qwen-Image 2.1's latent, so ComfyUI falls back to the cheap per-channel decode.
- **What they show**: dark smudges for the first two steps, then the composition, readable by
  step 5, soft as through frosted glass, sharpening to the end; never the purple and green static
  of mflux's `--stepwise-image-output-dir` (bench/steps), which decodes the noisy image instead.

The app shows them (Settings → "Show the picture forming", on by default): design.md, "Image
step". Through the app on the Mac, rendering on the PC, the server held a preview at each step from
14.5 s (after the Text Model's 14 s) until the picture landed, and none after.

## Voices through ComfyUI (2026-10-08, on the Windows PC)

The voice service is mlx-audio, Mac only. Whether ComfyUI could speak the lines on Windows
instead, as it already makes the pictures there, so the PC needs no second Python service:

- **Nothing local is built in.** ComfyUI 0.39.1 on the PC has TTS only as paid API nodes
  (ElevenLabs, Fish Audio, HeyGen) and no local TTS template. Its core *does* have the audio
  plumbing: `LoadAudio` (from `input/`), `SaveAudio`, `SaveAudioMP3` (V0, 128k, 320k) and
  `SaveAudioOpus`. So only the speaking needs a custom node pack, which breaks ADR 0009's "built-in
  nodes only" (as SeedVR2's custom node already does for Upscale on the PC).
- **The PC's install has no custom nodes yet**, and its Python has transformers **5.16.1**
  (standalone build, Python 3.13, torch 2.12.1+cu130).
- **The packs, as of today:**

  | Pack | Models | Last push | Fit |
  |---|---|---|---|
  | [TTS-Audio-Suite](https://github.com/diodiogod/TTS-Audio-Suite) (v5.9.x, 1.2k stars) | ~15 engines, among them **Higgs Audio v3** and **Qwen3-TTS** (VoiceDesign, Base, CustomVoice) | 2026-10-04 | both our models in one pack |
  | [flybirdxx/ComfyUI-Qwen-TTS](https://github.com/flybirdxx/ComfyUI-Qwen-TTS) (1.9k stars) | Qwen3-TTS only | 2026-09-22 | design, but Qwen3 Base clones were "generic" (models.md) |
  | [1038lab/ComfyUI-QwenTTS](https://github.com/1038lab/ComfyUI-QwenTTS), [DarioFT/ComfyUI-Qwen3-TTS](https://github.com/DarioFT/ComfyUI-Qwen3-TTS) | Qwen3-TTS only | Jan–Feb 2026 | 1038lab pins transformers 4.57.3: would downgrade ComfyUI's |
  | Higgs v3 TTS (Saganaki22) | Higgs v3 only | gone (404); a 2-star fork remains | no |

- **TTS-Audio-Suite maps onto `VoiceEngine` as it is.** `design`: its *Voice Designer* node with
  the Qwen3-TTS VoiceDesign engine takes `voice_instruction` (our description), `reference_text`
  and `seed`, and outputs AUDIO for `SaveAudio` (WAV, the lossless reference clip). `speak`: the
  reference clip uploaded to `input/` (`POST /upload/image` takes any file), `LoadAudio` →
  *Character Voices* (`opt_audio_input` plus `reference_text`, the clip's transcript, which "strongly
  improves cloning") → the *Higgs Audio v3 Engine* node (`temperature`, `top_k`, so our steadier
  0.5 / 30 carry over; `dtype` bf16 or fp32) → *TTS Text* → `SaveAudioMP3`. Higgs v3's native tags
  are passed through as typed, the same `<|prosody:…|>`, `<|sfx:…|>Uh`, `<|style:whispering|>`
  the voice service writes in `directed()`, so pace, sound and whisper need nothing new.
- **Transformers 5 vs Qwen3-TTS:** the pack's own report says Qwen3-TTS doesn't work on
  Transformers 5 (garbled tokens on 5.0, a tensor-shape error in generation on 5.10), so it runs
  Qwen3-TTS in an *isolated runtime* (a separate Transformers 4 environment) and Higgs v3 in the main
  one (transformers ≥5.3). Neither should downgrade ComfyUI's own.
- **Against it:**
  - *Memory.* Higgs v3 4B is 9.3 GB of bf16 weights and ~11 GB of VRAM on CUDA, against the
    4070's 12 GB, with no quantized option in the pack. The Text Model must be out of the GPU
    first (as for a render: `keep_alive: 0`), and ComfyUI `/free`d after; the 16 GB of RAM is
    tight while it loads. Qwen3-TTS VoiceDesign 1.7B is small (~4 GB).
  - *Install weight.* The pack's requirements pull in much more than two engines need (keras,
    modelscope, gradio, wandb, onnxruntime, RVC…) into ComfyUI's Python, with an `install.py`
    that installs some `--no-deps`. A bad install could break the image backend; Comfy Desktop's
    snapshots allow a rollback.
  - *Licence.* Higgs v3 is Boson's research and non-commercial licence: the same as on the Mac.
### Tried on the RTX 4070 (2026-10-08)

TTS-Audio-Suite 5.8.4 on ComfyUI 0.39.2 (torch 2.12.1+cu130), installed through the Manager.

- **Installing.** Two traps, both on the PC:
  - *Comfy Desktop runs ComfyUI from `ComfyUI\.venv`*, not from `standalone-env` (only the base
    interpreter, with no torch). A node's `install.py` run by hand with the base Python saw no torch
    and pip-installed torch 2.14.1+cpu there (harmless to ComfyUI, and undone). Install through the
    Manager, or with `ComfyUI\.venv\Scripts\python.exe`; `comfyui.log` names the executable.
  - *The Manager won't install while ComfyUI listens on the network* (`--listen 0.0.0.0`, set for
    the Mac's Upscale): "security_level must be `normal or below`, and network_mode must be set to
    `personal_cloud`". Take `--listen` out of the install's launch arguments in Comfy Desktop,
    install, then put it back (or set `network_mode = personal_cloud` in
    `user\__manager\config.ini`, which lets anyone on the LAN install nodes).
  - The install left torch, transformers (5.16.1) and the image backend as they were; 59 new nodes.
    Higgs v3 downloads on first use (8.9 GB, ~4.5 min here) to the shared
    `models\TTS\higgs_audio_v3\`.
- **The run:** `kael-ref.wav` cloned for the 29 lines of round 3 in
  [bench/voices/](../bench/voices/), untagged, temperature 0.5, top-k 30 (top-p 0.95, the node's
  default), seed 1, through the API: `LoadAudio` → *Character Voices* (with the clip's transcript)
  → *Higgs Audio v3 Engine* (cuda, bf16, SDPA) → *TTS Text* → `SaveAudio`.
- **The voice held**, as on the Mac. Median pitch **102.5 Hz** (83–155) against the Mac's 106
  (83–139) on the same lines, and the reference's 97; one line over 130 Hz ("Who?", 155; 139 on the
  Mac too). Three one-word lines ("Debt?", "Good.", "Quiet.") had no voiced frames for `pitch.py`,
  though they're spoken at normal loudness: gravelly or breathy, to be listened to. Whisper (base)
  heard every line's words, bar slips on short ones it makes anyway ("Dead" for "Debt?").
- **Slow:** **9 tokens a second**, steady (the model's 25 Hz audio tokens, so ~2.8× slower than
  real time), ~0.5 s of overhead a call: **3.7 s per second of speech**, a median **5.5 s a line**
  (3.6–12.1 s), against the Mac's 0.8 s per second of speech on mlx-audio. The model was wholly on
  the GPU (bf16, SDPA, nothing offloaded), so it's the pack's decode loop. `eager` attention was no
  faster (four lines, ~11 s each either way); `sageattention` and fp32 not tried. Changing the
  engine node's settings reloads Higgs (~23 s).
- **Pace, sound and whisper tags work** (six lines, written as the voice service's `directed()`
  writes them): no tag was spoken as words, the sounds came out ("Uh", "Heh", "Ahem"), and the
  pitch held at 85–114 Hz, the whisper lowest (85), as on the Mac.
- **VoiceDesign works, after two fixes.** The pack runs Qwen3-TTS in an isolated runtime (a venv
  that inherits ComfyUI's torch, with its own transformers 4.57.3), in its own folder,
  `custom_nodes\tts_audio_suite\runtimes\shared_legacy_t4\`, as a worker process ComfyUI talks to.
  1. *Windows' 260-character path limit:* pip's install into that folder hit a setuptools test file
     270 characters deep ("Could not install packages due to an OSError… Windows Long Path
     support"). The folder can't be moved (no setting). Fixed by setting
     `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` to 1 (admin), then
     restarting ComfyUI.
  2. *A bug in the pack (5.8.4):* the worker then died at once ("Worker closed the response stream
     unexpectedly"); its own error is only in Comfy Desktop's log
     (`ComfyUI-Installs\ComfyUI\logs\comfyui.log`, which has the child processes' output, unlike
     `ComfyUI\user\comfyui.log`): "No module named 'utils.runtimes'; 'utils' is not a package". The
     worker inherits ComfyUI's `sys.path` as `PYTHONPATH`, where some engines have put their own
     folders (holding a `utils.py`) ahead of the pack's root, and the worker adds its root first only
     if it isn't on the path already. Fixed locally by making `utils/runtimes/workers/
     qwen3_tts_worker.py` always put its root first (three lines); a reinstall or update of the pack
     undoes it. Already reported: [#366](https://github.com/diodiogod/TTS-Audio-Suite/issues/366)
     (open, no reply as of 2026-10-08), the same cause and fix, seen there only after Step Audio
     EditX had run; here it failed on the first use.
  - Running Qwen3-TTS in ComfyUI's main environment instead (`runtime_mode: Main Environment`) fails
    on transformers 5.16.1 too ("Failed to load Qwen3-TTS model: 'default'", the RoPE error of the
    pack's report), so VoiceDesign needs the isolated runtime, and the fix, until #366 is fixed.
- **Designing Kael's voice** from the bench's description (`render.py`'s `VOICE`) and reference
  sentence, Qwen3-TTS 1.7B VoiceDesign, the node's defaults (temperature 0.9, top-k 50), bf16, SDPA
  (no flash-attn): the clip says the sentence (Whisper), 6.6 s long. Seed 1 came out at **130 Hz**,
  seed 2 at **93 Hz** (the Mac's design: 97), so a design varies with its seed here as there.
  **30 s a design** with the model loaded (81 tokens, 2.7 a second, ~4.5× slower than real time);
  the first took 187 s, with the model's download (into the install's own `models\TTS\qwen3_tts\`,
  not the shared folder) and loading. `/free` stops the worker and frees its VRAM.
- **Memory:** VRAM peaked at **9.9 GB** (of 12.3), ComfyUI's working set ~1 GB. **`/free` releases
  Higgs**, but it takes a few seconds (9.6 → 1.5 GB within ~8 s, not at once). Loading it again from
  the file cache: the longest line took 20.5 s after a `/free`, against 12.1 s loaded, so ~8 s.
- **Leaving nothing behind.** ComfyUI has no audio node that sends over the WebSocket, as
  `SaveImageWebsocket` does for pictures: `SaveAudio`, `SaveAudioMP3`, `SaveAudioOpus` and
  `SaveAudioAdvanced` write to `output`, and `PreviewAudio` to `temp`. So a voice would end in
  `PreviewAudio`, fetched through `/view` and left in `temp` until ComfyUI's next start clears it,
  with the reference clip uploaded to `temp` too, as Upscale's picture is; and its prompt deleted
  from `/history`, which holds the line's text. The trial's `SaveAudio` left 49 clips in `output`
  and the clip in `input` (deleted). The pack keeps only small settings caches of its own
  (`.cache\install_state.json`, `voice_discovery.json`), no audio or text.
- **So far:** it works and holds the voice, but a Roleplay's line of 2–3 s would take ~10 s, or
  ~18 s after a Reply (Higgs reloaded), against 2–3 s on the Mac. Built as a Voice backend: ADR 0010.

### Through the app (2026-10-08, the Windows PC)

The ComfyUI Voice backend (`server/voice/comfyui/`), with "Speak with" set to ComfyUI, Ollama 0.40.0
with Gemma 4 12B Heretic (Q4_K_M) as the Text Model, ComfyUI 0.39.2 with TTS Audio Suite 5.8.4 (and
the #366 fix):

- **The engine alone** (a script calling `design` then `speak`): a voice designed from a gravelly
  description in 72.7 s (69 Hz) and a line cloned from it, slow with a sigh, in 30.8 s (76 Hz), each
  with its model's load, as ComfyUI unloads after every job.
- **A tavern Roleplay** (`scenarios/tavern.md`; Cast 20 s, opening Frame 5 s), then Listen on Frame
  0: the voice described by the Text Model (with it loaded, 9.3 GB of VRAM in use), then **Ollama
  unloaded** (1.4 GB) and the voice designed (VRAM to ~5.8 GB), the line directed (Ollama back,
  9.3 GB), **Ollama unloaded again** and the line spoken by Higgs alone (9.9 GB at its peak):
  131 s from the click to the line for a Character's first line, 32.4 s of it the line itself
  (with Higgs's load). The app served `speech-0-….flac` as `audio/flac` (138 KB).
- **Left behind in ComfyUI:** nothing but empty files in its temp folder (the clips and the uploaded
  reference, blanked); nothing in output or input; its history empty; VRAM back to 1.2 GB.
- **Not done:** listening to the lines in the browser; a Mac's Session opened here or the reverse
  (a FLAC reference clip given to the voice service: mlx-audio's loader should read it, untested).

### In use: a thought, and Ollama crashing (2026-10-08, the Windows PC)

- **A whispered thought came out in a woman's voice.** A Roleplay's voice (94 Hz) and its line
  (92 Hz) were right; its thought, whispered as on the Mac (`<|style:whispering|>`), measured
  209 Hz. Spoken again on three seeds: 198–213 Hz whispered, 81–102 Hz without the tag. So through
  TTS Audio Suite (PyTorch) the whispering style alone pulls this voice up, unlike mlx-audio's Higgs
  on the Mac (12 thoughts held). With `<|prosody:pitch_low|>` after it: 72–73 Hz (two seeds); also
  held: `pitch_low` with slow pace (75–77 Hz), and `expressive_low` alone (80 Hz). The ComfyUI
  backend now whispers with `pitch_low`; a new thought in a new voice came out at 70 Hz, the voice's
  own. Whether it still sounds whispered is to listen to.
- **Ollama crashed loading the Text Model** to direct a thought: "llama-server process has
  terminated: exit status 0xc0000409 … CUDA error: shared object initialization failed", and the
  thought was spoken undirected. Both times (the player's, and once reproduced) it was right after
  a voice was *designed*, as ComfyUI stopped TTS Audio Suite's VoiceDesign worker process. Not GPU
  memory: the card was back to 1.5 GB in use. RAM was tight (0.8–1.4 GB free of 16: TTS Audio Suite
  "unloads" Higgs by moving it to the CPU, ~8 GB of ComfyUI's RAM, until ComfyUI restarts), but the
  same load went through with that RAM taken (12 s, all on the GPU), and a minute after the crash.
  So most likely the two processes' CUDA start and stop colliding. Ollama's chat now retries a
  model that died while loading once, after 3 s; a third run (design, then a thought) didn't crash,
  so the retry is tested only by a stand-in. A line spoken undirected now says so beside Listen,
  with why on hover and Speak again.
- ComfyUI jobs now end once ComfyUI's GPU is about as free as before the job (`/system_stats`, up
  to 30 s), so the next job (the Text Model) finds it free.

### TTS Audio Suite 5.9.3: #366 fixed (2026-10-09, the Windows PC)

- **The version was 5.8.4, not 5.9.2**, all along: what the Manager installs. Comfy's registry
  lists every release from 5.8.8 to 5.9.2 as *flagged* (no reason given) and 5.9.3 as *pending*,
  so the Manager's newest is 5.8.4 (2026-08-21). The earlier sections, and the comment on #366,
  said 5.9.2 (corrected here). The evidence: the suite prints its version as ComfyUI loads it, and
  Comfy Desktop's logs (`ComfyUI-Installs\ComfyUI\logs\`) show v5.8.4 from the first install on
  2026-10-08 (12:28) until the switch to nightly on 2026-10-09 (14:28), then v5.9.3. The 5.9.2 was
  the copy cloned by hand and deleted before the Manager's install, written down unchecked.
- **The maintainer fixed #366 in 5.9.3** (2026-10-08): the shared launcher and every isolated worker
  put the suite's own packages first. Installed through the Manager as "nightly" (the repository's
  `main`), replacing the local fix.
- **It works**: through the app's ComfyUI backend, a voice designed (160 s: the update had replaced
  the suite's folder, so its Qwen3-TTS runtime was built again, which long paths let through), a
  line spoken from it, and a second design with the worker started afresh (77.9 s); no "'utils' is
  not a package" in the log. Not tried: the maintainer's other sequence (Qwen, Step Audio EditX,
  unload, Qwen), as Step's model is a large download the app doesn't use.
