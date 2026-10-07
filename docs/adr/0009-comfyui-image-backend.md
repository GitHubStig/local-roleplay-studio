---
status: accepted
---

# Pictures from mflux or a ComfyUI server, chosen per Session

mflux runs only on Apple Silicon (ADR 0004), so on Windows the app couldn't render. ComfyUI runs on
both, with an HTTP and WebSocket API, so it's a second image backend beside mflux. Settings choose
it (`imageBackend`, with `imageBaseUrl` for its address), and each Session keeps the backend it
started with, as it keeps its Text backend (ADR 0008). `server/images/` has a folder per backend
(`mflux/`, `comfyui/`), each with its own Image Models; `images/imageModels.ts` lists them as
Settings and the screens see them, and `images/backend.ts` sends each render to the Session's.

The ComfyUI client (`images/comfyui/`) uses only the API, never ComfyUI's folders, so it works with
Comfy Desktop, the portable build or a manual install, on this machine or another, on macOS or
Windows:

- An Image Model is a **workflow** in API format (`comfyui/workflows/<id>.json`, built from
  ComfyUI's own template, built-in nodes only) with `$placeholders` for the prompt, seed, steps
  and size, and for each loader a list of **file patterns**, best first: the first file ComfyUI has
  (`GET /models/{folder}`) is used, so the int8 build on the Mac and an fp8 one on an NVIDIA card
  both work, and a missing one is named.
- `POST /prompt` queues it; the `/ws` WebSocket reports its steps (the same progress as mflux's)
  and then brings the picture itself: the workflow ends in `SaveImageWebsocket`, a node that ships
  with ComfyUI (`custom_nodes/websocket_image_save.py`, in its repository), and the app saves the
  PNG into the Session's folder. **ComfyUI keeps nothing**: no file in its output or temp folder,
  and the prompt is deleted from its history afterwards (`POST /history` with `delete`).
- Cancel interrupts only that prompt (`POST /interrupt` with its id) and takes it out of the queue.
- Afterwards ComfyUI unloads its models (`POST /free`), as an mflux process frees its memory when it
  ends: kept loaded they'd crowd out the Text Model, and on a 12 GB card push it off the GPU.

Pictures count as available when mflux is installed or Settings choose ComfyUI. **Upscale** became
its own Feature, SeedVR2 whichever backend rendered, with its own backend in Settings
(`upscaleBackend`, added 2026-10-07; an older file follows `imageBackend`): mflux, or ComfyUI's
built-in SeedVR2 (`comfyui/workflows/seedvr2.json`) at the same address. So a Mac can render with
mflux and upscale on a ComfyUI machine, which on an RTX 4070 is ~5× faster. ComfyUI can't take a
picture inline with its built-in nodes, so the one to upscale is uploaded to its temp folder, and a
1×1 blank is written over it once used (`overwrite`); ComfyUI clears the stub when it next starts.

## Considered Options

- **ComfyUI for the Mac too.** Not as the default: on the same model (Qwen-Image 2.1 at 1024²) it
  ran at 5.7 s a step against mflux's 3.2 s, and has no step cache (docs/research/comfyui.md).
  It's there to choose.
- **Keeping ComfyUI's models loaded between renders.** Faster for the next picture (no ~20 s load),
  but the memory stays taken while the Text Model works. Revisit if renders come in bursts.
- **Workflows in the UI format** (what ComfyUI saves by default). The API format is what `/prompt`
  takes; the UI format would need converting, subgraphs and all.
- **Custom nodes** (GGUF loaders, SeedVR2, a base64 image loader that would send the picture to
  upscale inline). Left out so a fresh install runs the workflows; SeedVR2 turned out to be built
  in, and the upload is blanked after use instead.

## Consequences

- A new ComfyUI model is a workflow file and an entry in `comfyui/models.ts`.
- ComfyUI must be running when a Session renders; if it isn't, the render fails saying so.
- Upscale on ComfyUI needs Comfy-Org's SeedVR2 files there (mflux's don't load in ComfyUI).
- ComfyUI's temp folder holds a 1×1 stub per upscale until it restarts.
