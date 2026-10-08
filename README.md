# Local Roleplay Studio

A private roleplay studio that runs on your own machines: a Mac with Apple silicon, a Windows PC
with an NVIDIA card, or both together. A local language model (via [Ollama](https://ollama.com))
plays a Character you talk to; every scene can be painted by a local image model (via
[mflux](https://github.com/filipstrand/mflux) on a Mac, or [ComfyUI](https://www.comfy.org) on
either); the Character speaks in a voice designed for them (via
[mlx-audio](https://github.com/Blaizzy/mlx-audio) on a Mac, or ComfyUI on either); and any picture
can be turned into 3D Gaussian splats you can look around (Apple's SHARP and TripoSplat on either,
LiTo on a Mac). No
cloud is needed; a cloud Text Model is an option.

There are three kinds of Session:

- **Roleplay:** a conversation. Set up from a Brief you type, a Character with a goal of their own
  talks with the character you play, replying with a thought, what they do and what they say.
  Any moment can be pictured, rendered, upscaled, spoken aloud or made 3D as you go, queued so you
  can keep talking.
- **Chain:** a picture you change one step at a time. You say what to change; the language model
  rewrites the Image Prompt (one paragraph, a sentence each for subject → pose → expression →
  camera → clothing → environment → lighting → color → style) and the image model renders it (or,
  with "Render each Frame" off, waits for you to). The built-in Scenario is a rain-soaked
  18th-century tavern: Kael, a retired smuggler, and you, a well-off traveller who might solve his
  troubles for a price.
- **Storyboard:** a whole sequence planned at once (a manga page, a video storyboard) from a
  Brief: every Frame's prompt is written up front, sharing one Look, and you edit and render each
  Frame as you like.

Every kind runs on the Text Model alone; pictures, voices and 3D are added where the machine can
make them.

The engine enforces four limits on everything the models write: everyone depicted is an adult,
no sexual or nude imagery, no real identifiable people, no restraint or captivity. Settings can
turn the last three off; "everyone depicted is an adult" always stays.

The vocabulary (Scenario, Session, Image Prompt, Frame, Action, …) is defined in
[CONTEXT.md](CONTEXT.md). The design is in [docs/design.md](docs/design.md).

## Requirements

**On every machine:**

- **[Deno](https://deno.com) 2.9+** runs the server, the web app's tooling and the tests.
- **Node.js 24+**, only for the Vue type check (see [Known quirks](#known-quirks)).
- **A Text backend**: [Ollama](https://ollama.com) with a Text Model (below), or any server with
  the OpenAI chat API (LM Studio, llama.cpp's server, vLLM, or a cloud service such as OpenRouter),
  chosen on the Text tab of Settings with its address and API key; see
  [ADR 0008](docs/adr/0008-own-text-client.md) for what it can't do that Ollama can.
- **[uv](https://docs.astral.sh/uv/)** for the optional Python extras (voices, SHARP, TripoSplat,
  LiTo): each installs its own Python packages on first use.

Everything else is optional: what a machine can run is worked out at startup and shown on the
Settings page ([What runs where](#configuration)).

### The Text Model

One model does every text job ([docs/models.md](docs/models.md) has the comparisons, uncensored
builds and how to make one). Small models (4–8B) can't reliably follow the prompt format.

- **Gemma 4 12B Heretic, on a Mac or Windows:**
  `ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`, Thinking off. Uncensored, and
  the most accurate of the small models tried here. **Q4_K_M** is a 4-bit quantization: the weights
  are stored in about 4.8 bits each on average (most in 4, some sensitive ones in 6) instead of 16,
  so the model is 7.4 GB on disk and ~8–9.5 GB loaded, enough for a 12 GB card or a 16 GB Mac, at
  little cost in quality. The same build runs on both machines, so a Session behaves the same on
  either. ~5 s a Reply on an RTX 4070; on a Mac, ~8 s per Chain Action.
- **Faster on a Mac with memory to spare (32 GB+):** Gemma 4 26B-A4B Heretic on Ollama's MLX engine
  (`gemma-4-26b-heretic:nvfp4`, made locally as models.md describes; 18 GB loaded), 2–3× faster
  than the 12B (~3.5 s per Chain Action) because only about 4B of its weights work per token. MLX
  builds run only on Apple silicon.
- **Ollama's context length** (the slider in Ollama's settings, or `OLLAMA_CONTEXT_LENGTH`) matters
  for GGUF models, the ones Ollama runs on Windows and Linux. The app sends a Roleplay's whole
  history with every Reply (a 30-Frame Roleplay is 8–11k tokens, each exchange adds 220–310, so 200
  Frames is about 65k) and doesn't set the context itself. When a chat doesn't fit, Ollama keeps the
  system message, drops the oldest exchanges, and fills the context to the brim, so the Reply has no
  room and fails, saying the conversation no longer fits. And Ollama reserves a GGUF model's
  context memory when it loads it, so too much can push the model off the GPU. Set it as high as
  still fits (`ollama ps` should say `100% GPU`). Gemma 4 keeps most layers' cache to a short
  window, so its context is cheap: on a 12 GB card, Gemma 4 12B Heretic (Q4_K_M) loads at 8.1 GB,
  100% GPU, at 128k, and read a 56.5k-token chat with 11.2 GB of the card in use; 64k covers a
  200-Frame Roleplay. On a Mac, the MLX models (the `safetensors` ones, like the Heretic 26B)
  ignore the slider: they take memory only as a prompt grows (17 GB loaded, 23 GB at 67k tokens).

### Pictures (optional)

The default Image Model is **Qwen-Image 2.1**, which both image backends run. Choose the backend on
the Images tab of Settings:

- **mflux, on a Mac:** mflux 0.21+ (the step cache and Fast need it):
  `uv tool install --managed-python --python 3.14 mflux`. (uv's own Python, kept apart from any
  other Python on the Mac; mflux runs on 3.10 or newer.) Each model downloads from Hugging Face
  into `~/.cache/huggingface` the first time it's used, 3–30 GB each, shown as "Downloading the
  model (first use only)…"; to fetch one ahead of time, run its command once:

  | Image Model | Fetch ahead of time with |
  |---|---|
  | **Qwen-Image 2.1** (the default; ~56 s at 832×1216 with the step cache, ~23 s at 512 px) | `mflux-generate-qwen-2.1 --model qwen-image-2.1 --prompt test --output /tmp/x.png` |
  | FLUX.2 Klein 4B (~13 s per image) | `mflux-generate-flux2 --model flux2-klein-4b --prompt test --steps 4 --output /tmp/x.png` |
  | FLUX.2 Klein 9B (~8 s at 512 px, ~22 s at 832×1216) | `mflux-generate-flux2 --model flux2-klein-9b --prompt test --steps 4 --output /tmp/x.png` |
  | Z-Image Turbo, 4-bit (~42 s per image) | `mflux-generate-z-image-turbo --model filipstrand/Z-Image-Turbo-mflux-4bit --base-model z-image-turbo --prompt test --output /tmp/x.png` |
  | Krea 2 Turbo (~32 s at 512 px) | `mflux-generate-krea2 --model krea-2 --prompt test --output /tmp/x.png` |
  | ERNIE-Image Turbo (~18 s at 512 px) | `mflux-generate-ernie-image-turbo --model ernie-image-turbo --prompt test --output /tmp/x.png` |
  | Boogu Image Turbo (~16 s at 512 px) | `mflux-generate-boogu --model boogu-image-turbo --prompt test --output /tmp/x.png` |
  | SeedVR2 upscaler, 7B and 3B (Upscale, ~46 s to 2048 px) | `mflux-upscale-seedvr2 --model seedvr2-7b --image-path /tmp/x.png --resolution 2048 --output /tmp/y.png` (one download holds both) |

  **Saved quantized copies** (Quantize in Settings) are made by the app on first use, 13–22 GB
  each, in `models/quantized/` in this folder (gitignored); Settings lists them to delete. **Fast**
  (Qwen-Image 2.1) renders with Viggle's 6-step turbo LoRA
  ([Viggle/Qwen-Image-2.1-viggle-turbo](https://huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo),
  1.3 GB, Qwen's research license), which mflux downloads with the first fast render.
- **ComfyUI, on any machine** (the one for Windows): ComfyUI must be running (Comfy Desktop, the
  portable build or a manual install; the app doesn't start it) with the Image Model's files: for
  Qwen-Image 2.1, the `diffusion_models`, `text_encoders` (Qwen3-VL 8B) and `vae` files that
  ComfyUI's own "Qwen Image 2.1 text to image" template downloads. Give its address in Settings
  (empty for this machine's `http://127.0.0.1:8188`); Settings checks it's up and names any missing
  file. The app talks to it only through its API, so it can be another machine, and ComfyUI keeps
  nothing: no copy of a picture and no prompt in its history. On an RTX 4070 it renders Qwen-Image
  2.1 at 832×1216 in ~21 s; on a Mac, ComfyUI is slower than mflux. Findings:
  [docs/research/comfyui.md](docs/research/comfyui.md).
- **Upscale** (SeedVR2 7B or 3B, to 2048 px) runs where "Upscale with" says, whichever backend
  rendered: mflux on a Mac (the table's last row; ~64 s for an 832×1216 picture), or ComfyUI's
  built-in SeedVR2 (~12 s on an RTX 4070), with Comfy-Org's files there
  (`diffusion_models/seedvr2_7b_fp8_e4m3fn` and/or `seedvr2_3b_fp8_e4m3fn`, and
  `vae/seedvr2_ema_vae_fp16`, as ComfyUI's "SeedVR2 upscale image" templates download them;
  mflux's own SeedVR2 files don't load in ComfyUI). The picture to upscale is the one exception to
  ComfyUI keeping nothing: it's sent to ComfyUI's temp folder and blanked to a 1×1 picture once
  used, and ComfyUI clears the stub when it next starts.

### Voices (optional)

For Roleplay Characters, two models: Qwen3-TTS VoiceDesign designs a voice from its description, and
Higgs TTS 3 clones it for every line. "Speak with" on the Voice tab of Settings says what runs
them:

- **The voice service** (a Mac): uv runs `python/voice/serve.py` (mlx-audio), and the two models
  (about 12 GB) download the first time each is needed; `uv run python/voice/serve.py --download`
  fetches both ahead of time. mlx-audio is MLX, so Apple Silicon only.
- **ComfyUI** (a PC with an NVIDIA card of 12 GB, or any machine), at the same address as for
  pictures, with [TTS Audio Suite](https://github.com/diodiogod/TTS-Audio-Suite)'s custom nodes.
  Install them through ComfyUI's Manager (in Comfy Desktop, the Extensions button). On Windows:
  - the Manager won't install while ComfyUI listens on the network: take `--listen 0.0.0.0` out of
    the launch arguments to install, then put it back;
  - turn on long paths (in PowerShell as admin: `New-ItemProperty -Path
    'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1
    -PropertyType DWORD -Force`), then restart ComfyUI, or designing a voice fails to set up;
  - until [#366](https://github.com/diodiogod/TTS-Audio-Suite/issues/366) is fixed, designing a
    voice needs a three-line fix in the suite (docs/research/comfyui.md).

  The models download into ComfyUI the first time each is used (8.9 GB for Higgs). Each voice
  unloads the Text Model first, as a render does, since Higgs takes ~10 GB of the card. On an RTX
  4070 a line takes about 3.7 s per second of speech (a Mac: 0.8 s), plus ~8 s to load Higgs after
  a Reply. Clips come back as FLAC, and ComfyUI keeps none: they're read from its temp folder and
  blanked there.

### 3D (optional)

Each runs once per scene or figure through uv, downloading its weights with the first one
(`uv run python/<tool>/make.py --download` fetches them ahead of time):

- **SHARP** (`python/sharp/make.py`; Apple's
  [apple/Sharp](https://huggingface.co/apple/Sharp), 2.8 GB, research-only license: fine at home,
  not for anything commercial) makes a picture a 2.5D scene. On a Mac's GPU (~11 s) or an NVIDIA
  one (~31 s on an RTX 4070, peaking at 11.9 GB of its 12).
- **TripoSplat** (`python/triposplat/make.py`; its code in `python/triposplat/vendor/`, MIT; weights
  4.2 GB, [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat)) lifts the person out as
  a figure. On a Mac's GPU (70–100 s) or an NVIDIA one (~52 s on an RTX 4070).
- **LiTo** (`python/lito/make.py`, through mlx-spatial, Python 3.13; weights 4.4 GB,
  [appautomaton/lito-research-mlx](https://huggingface.co/appautomaton/lito-research-mlx), Apple's
  research-only, non-commercial license) does the same another way, cutting the person out with
  TripoSplat's BiRefNet first. Apple Silicon Macs only.

### Two machines

The app finds ComfyUI and Ollama by address, so any machine can use another's on the local
network, either way round. The useful case: a Mac rendering and upscaling on a Windows PC's
ComfyUI. Give the PC's address (`http://<its IP>:8188`) as the ComfyUI address, and set "Upscale
with" to ComfyUI. On the tested pair, a picture took ~21 s instead of 56–97 s with mflux, and an
upscale 14 s instead of ~66 s. The Text Model can live on the other machine the same way (the
Text backend's address in Settings), e.g. to keep the Mac's memory for mflux. What runs as a
local program can't be shared: mflux, the voice service, SHARP, TripoSplat and LiTo run where the
app runs.

For another machine to reach ComfyUI, it must listen beyond its own machine: in Comfy Desktop, add
`--listen 0.0.0.0` to the installation's launch arguments, and let the firewall allow TCP 8188 on
the private network (Windows Firewall on a PC). ComfyUI has no login, so anything on that network
can use it. Ollama likewise needs `OLLAMA_HOST=0.0.0.0` set where it runs.

## Getting started

```sh
deno install        # install web dependencies
ollama serve        # if Ollama isn't already running
deno task dev       # starts the API on :8787 and the web app on :5180
```

The same on Windows, in PowerShell. Open <http://localhost:5180>, go to **Settings**, choose a Text
Model (on another backend: pick it and give its address first) and, for pictures, the Image backend
(on Windows, ComfyUI, which must be running), then go **Home** (click **Local Roleplay Studio**) and
press **Start Session**. Your Sessions are listed on Home; open one to carry on, or delete it.

## Tasks

| Command | What it does |
|---|---|
| `deno task dev` | API server (auto-restarts on change) plus the Vite dev server |
| `deno task test` | Server tests (`deno test`), then web tests (Vitest) |
| `deno task check` | Type-checks the server with Deno and the web app with `vue-tsc` |
| `deno task build` | Production build of the web app into `web/dist` |
| `deno fmt` | Formats the TypeScript files |

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | API server port. The Vite proxy expects 8787. |
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama listens |
| `IMAGE_GENERATOR` | (Settings' backend) | Set to `placeholder` to render SVG cards instead, for working without a GPU |

The web app's dev server is pinned to port **5180** and fails, rather than picking another port,
if something else is using it.

Everything else is chosen on the Settings page (in tabs: Text, Images, Voice, 3D) and saved to
`settings.json`, including the Text backend's API key (never sent back to the browser).

**What runs where.** Only a Text backend is required: Ollama, or a server with the OpenAI chat
API. At startup the server works out which extras this machine can run, and says so in its log
and on the Settings page:

| | Mac (Apple silicon) | Windows or Linux, NVIDIA card |
|---|---|---|
| Pictures | mflux, or ComfyUI | ComfyUI |
| Upscale | mflux, or ComfyUI | ComfyUI |
| Voices | mlx-audio (uv), or ComfyUI | ComfyUI (TTS Audio Suite) |
| SHARP, TripoSplat | yes (uv) | yes (uv) |
| LiTo | yes (uv) | no |

Where mflux or the voice service can't run (a PC), Settings start on ComfyUI for pictures, Upscale
and voices, and the log says whether ComfyUI answers at its address and has what they need.
ComfyUI can be on another machine, so a Mac can use a PC's ([Two machines](#two-machines)). One that can't run is off and its
buttons are hidden, with the reason in Settings; one that can is on, and can be switched off there.
Without pictures, every kind of Session still runs on the Text Model alone: a Roleplay is a
conversation, a Chain writes each Frame's prompt and a Storyboard plans and edits, ready to render
on a machine that can.

## Where things live

```
scenarios/        Scenario files, one Markdown file each (see docs/scenarios.md)
settings.json     Your Settings (gitignored; created on first save)
sessions/<id>/    Each Session: session.json plus its pictures, voices and 3D files (gitignored)
models/           Saved quantized copies of Image Models (gitignored)
server/           Deno API: the app, Sessions, Settings, the job queue, what all kinds of Session share
  chain/          a Chain's Frames and jobs
  storyboard/     a Storyboard's plan and edits
  roleplay/       a Roleplay: its engine, Art Agent, voices and jobs
  text/           the Text backends (Ollama, OpenAI-compatible) behind one Chat interface
  images/         the Image backends: mflux/ (and its saved quantized copies), comfyui/ (its
                  workflows in comfyui/workflows/), and the placeholder
  voice/          the Voice backends: the voice service's client, and comfyui/ (its workflows in
                  comfyui/workflows/)
  comfyui/        what talking to ComfyUI takes, for pictures and voices alike
  3d/             SHARP scenes, TripoSplat and LiTo figures
  prompts/        what the Text Model is told, one Markdown file each: chain/, storyboard/,
                  roleplay/, and shared/ for what more than one uses
web/              Vue 3 + Vite + Tailwind 4 web app
python/           What uv runs, each in its own folder with its packages pinned in the file:
  voice/          the voice service (mlx-audio, so Mac only)
  sharp/          Apple's SHARP: a picture as a 2.5D scene
  triposplat/     TripoSplat: the person in a picture as a 3D figure (VAST's code in vendor/)
  lito/           Apple's LiTo, through mlx-spatial: the same, another way
docs/             Design, models, research, Scenario format, ADRs and open threads
CONTEXT.md        Glossary of the game's terms
```

Sessions stay on disk until you delete them from Home (or remove their folder in `sessions/`
while no Frame is running).

## Writing a new Scenario

Add a Markdown file to `scenarios/`. It appears on Home, under *Start a new Session*, without a
restart. If a file has a problem, Home lists every issue found in it. The format is
documented in [docs/scenarios.md](docs/scenarios.md).

## Known quirks

- **`vue-tsc` runs on Node, not Deno.** Volar hooks into how TypeScript loads files, and
  Deno's Node compatibility doesn't support that. `deno task check` therefore calls
  `node …/vue-tsc`. Everything else runs on Deno.
- **TypeScript is on 6.0, not 7.** `vue-tsc` 3.3 can't run on TypeScript 7 (the Go rewrite no
  longer ships `lib/tsc`). Upgrade once Vue's tooling supports it.
- **One Frame at a time.** A Session accepts no new Action, Message or edit while one is being
  written or rendered. Pictures, upscales, voices and 3D asked for meanwhile are queued, and every
  Session shares one render queue, as one GPU can't usefully render two at once.

## Documentation

- [docs/design.md](docs/design.md): how the app works (Frame loop, failure handling, UI, storage)
- [docs/scenarios.md](docs/scenarios.md): the Scenario file format
- [docs/models.md](docs/models.md): which Text and Image Models to use, and why
- [docs/research/](docs/research/): surveys and trials (ComfyUI, image to 3D, small uncensored
  models, LLM libraries)
- [docs/adr/](docs/adr/): architecture decisions and why they were made
- [docs/open-threads.md](docs/open-threads.md): ideas deliberately deferred
- [CONTEXT.md](CONTEXT.md): glossary
