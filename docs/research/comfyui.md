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
beside it, and on a 12 GB card the two can't both fit (the Text Model spills to the CPU; on the
Windows run, `mistral-nemo` went from 61 to 4.3 tokens/s that way). So the client asks ComfyUI to
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
  Upscaling with SeedVR2 needs a custom node; until one is chosen, Upscale on ComfyUI is left off.

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
- Not yet run: anything on Windows (the RTX 4070's speed and memory with the 9.4 GB text encoder
  and the 7.3 GB DiT; whether the fp8 or another build is what's installed there, and what its
  files are called).

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
  empties temp on startup). That's the one exception to "ComfyUI keeps nothing of the app's"; the
  owner doesn't like it, so it stays noted here until something better turns up.
- **mflux's SeedVR2 files don't load in ComfyUI** (tested 2026-10-07, to avoid a second copy on
  the Mac). ComfyUI finds them where they are, in the Hugging Face cache, through an extra
  model-paths file (`numz/SeedVR2_comfyUI`: 7B and 3B fp16, the VAE), with no copy or download;
  but its `UNETLoader` refuses them: "Could not detect model type". numz's weights are laid out for
  the SeedVR2 custom node, not ComfyUI's built-in SeedVR2, which wants Comfy-Org's repack. So on the
  Mac Upscale stays with mflux (nothing downloaded), and Upscale on ComfyUI is for Windows, with
  Comfy-Org's files (7B fp8 8.2 GB, or 3B fp8 3.4 GB, plus the 0.5 GB VAE).
- **Gotcha:** a second ComfyUI started on a port already taken (here Comfy Desktop's 8188) logs
  "Port 8188 is already in use" and exits, and whatever answers on that port is the other one. Test
  instances go on another port (8189).
