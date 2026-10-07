# ComfyUI as an image backend: findings (2026-10-07)

Notes kept while adding ComfyUI beside mflux (branch `feat/comfyui`; the plan is in
[open-threads.md](../open-threads.md), "ComfyUI as a backend"). Dated, and added to as the work
goes on.

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
- It isn't running unless the Desktop app is open; the app starts it on port 8188.

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
  back through `GET /view` and are saved into the Session's folder by the app; a picture to upscale
  or edit goes up through `POST /upload/image`. No paths from ComfyUI's side are used.
- **The address is a Setting**, defaulting to `http://127.0.0.1:8188` (ComfyUI's own default, and
  what Comfy Desktop used here). Some Comfy Desktop builds have used port 8000, so Settings should
  say where to look.
- **Model files differ per machine.** On the Mac the Qwen-Image 2.1 files are int8 (`_int8_convrot`);
  a 12 GB NVIDIA card may want fp8 or a GGUF build instead. So an Image Model on ComfyUI is a
  workflow plus a list of acceptable files for each loader, and the app picks the first one
  `GET /models/{folder}` says is installed (and says which is missing if none is). The workflow
  JSON never hard-codes one file.
- **Memory:** on a 12 GB card the Qwen-Image 2.1 DiT (7.3 GB int8) and its text encoder (9.4 GB)
  don't fit together; ComfyUI loads, uses and offloads them in turn by itself. Whether that's fast
  enough on the RTX 4070 is to measure there. `POST /free` before a voice or 3D job does what
  unloading Ollama does now.
- **Nodes:** only ComfyUI's built-in nodes, so a fresh install on either machine runs the workflow.
  SeedVR2 turned out to be built in too (see "Upscaling on ComfyUI" below).

## Gotchas found on the way

- **Two Pythons in a Comfy Desktop install.** `standalone-env/` is only the bootstrap (no torch);
  ComfyUI itself runs from `ComfyUI/.venv`. Starting it by hand needs that one:
  `ComfyUI/.venv/bin/python main.py --listen 127.0.0.1 --port 8188 --extra-model-paths-config …`.
- **Cancel only our prompt.** `POST /interrupt` with `{"prompt_id": …}` interrupts only if that
  prompt is the one running (without it, whatever is running stops, even another app's);
  `POST /queue` with `{"delete": [id]}` removes it if still queued.
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
- Not run on Windows: Cancel mid-render against the real ComfyUI, other sizes, and a Roleplay's
  pictures (the Art Agent's path). Upscale: see "Upscaling on ComfyUI" below.

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
  Settings, and says "Couldn't reach ComfyUI … is it running?" when none does. It could start one
  with a command set in Settings (open-threads, "Starting ComfyUI from the app").
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
