# Local Roleplay Studio

A private roleplay studio that runs entirely on your Mac, with no cloud. A local language model
(via [Ollama](https://ollama.com)) plays a Character you talk to, every scene can be painted by a
local image model (via [mflux](https://github.com/filipstrand/mflux)), the Character speaks in a
voice designed for them (via [mlx-audio](https://github.com/Blaizzy/mlx-audio)), and any picture
can be turned into 3D Gaussian splats you can look around (Apple's SHARP, TripoSplat, LiTo).

There are three kinds of Session:

- **Roleplay:** a conversation. Set up from a Brief you type, a Character with a goal of their own
  talks with the character you play, replying with a thought, what they do and what they say.
  Any moment can be pictured, rendered, upscaled, spoken aloud or made 3D as you go, queued so you
  can keep talking.
- **Chain:** a picture you change one step at a time. You say what to change; the language model
  rewrites the Image Prompt (one paragraph, a sentence each for subject → pose → expression →
  camera → clothing → environment → lighting → color → style) and the image model renders it.
  The built-in Scenario is a rain-soaked 18th-century tavern: Kael, a retired smuggler, and you, a
  well-off traveller who might solve his troubles for a price.
- **Storyboard:** a whole sequence planned at once (a manga page, a video storyboard) from a
  Brief: every Frame's prompt is written up front, sharing one Look, and you edit and render each
  Frame as you like.

The engine enforces four limits on everything the models write: everyone depicted is an adult,
no sexual or nude imagery, no real identifiable people, no restraint or captivity. Settings can
turn the last three off; "everyone depicted is an adult" always stays.

The vocabulary (Scenario, Session, Image Prompt, Frame, Action, …) is defined in
[CONTEXT.md](CONTEXT.md). The design is in [docs/design.md](docs/design.md).

## Requirements

- **macOS on Apple silicon.** mflux runs on MLX.
- **[Deno](https://deno.com) 2.9+** runs the server, the web app's tooling and the tests.
- **Node.js 24+**, only for the Vue type check (see [Known quirks](#known-quirks)).
- **Ollama** with a Text Model: `gemma4:26b-nvfp4` (Gemma 4 26B-A4B on Ollama's MLX engine, 17 GB
  loaded, a few seconds a reply, Thinking off) for every text job. On Windows with a 12 GB NVIDIA
  card: `hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M` (Gemma 4 12B Heretic, 8.3 GB loaded,
  ~5 s a Reply on an RTX 4070). Small models (4–8B) can't
  reliably follow the prompt format. The comparisons, uncensored builds and how to make one are in
  [docs/models.md](docs/models.md). Or, instead of Ollama, **any server with the OpenAI chat API**
  (LM Studio, llama.cpp's server, vLLM, or a cloud service such as OpenRouter), chosen on the Text
  tab of Settings with its address and API key. See
  [ADR 0008](docs/adr/0008-own-text-client.md) for what it can't do that Ollama can.
- **Ollama's context length** (the slider in Ollama's settings, or `OLLAMA_CONTEXT_LENGTH`) matters
  for GGUF models, the ones Ollama runs on Windows and Linux. The app sends a Roleplay's whole
  history with every Reply (a 30-Frame Roleplay is 8–11k tokens, each exchange adds 220–310, so 200
  Frames is about 65k) and doesn't set the context itself. When a chat doesn't fit, Ollama keeps the
  system message, drops the oldest exchanges, and fills the context to the brim, so the Reply has no
  room and fails ("ran past its length limit"). And Ollama reserves a GGUF model's context memory
  when it loads it, so too much can push the model off the GPU. Set it as high as still fits
  (`ollama ps` should say `100% GPU`). Gemma 4 keeps most layers' cache to a short window, so its
  context is cheap: on a 12 GB NVIDIA card, Gemma 4 12B Heretic (Q4_K_M) loads at 8.1 GB, 100% GPU,
  at 128k, and read a 56.5k-token chat with 11.2 GB of the card in use; 64k covers a 200-Frame
  Roleplay. On a Mac, the MLX models (`gemma-4-26b-heretic`
  and the other `safetensors` ones) ignore the slider: they read the whole prompt whatever it says,
  and take memory only as a prompt grows (17 GB loaded, 23 GB at 67k tokens), so any setting works.
- **mflux 0.21+** (the step cache and Fast need it): `uv tool install --managed-python --python 3.14 mflux`. (uv's own Python, kept apart from any other Python on the Mac; mflux runs on 3.10 or newer.)
- **Or ComfyUI, for pictures on Windows (or any machine):** choose it as the Image backend on the
  Images tab of Settings, with its address (empty for this machine's `http://127.0.0.1:8188`).
  ComfyUI must be running (Comfy Desktop, the portable build or a manual install) with the Image
  Model's files installed; for Qwen-Image 2.1, its `diffusion_models`, `text_encoders` (Qwen3-VL
  8B) and `vae` files, as ComfyUI's own "Qwen Image 2.1 text to image" template downloads them.
  Settings names any that are missing. The app talks to it only through its API, so it can run on
  another machine, and ComfyUI keeps nothing: no copy of a picture (it comes back over the API into
  the Session's folder) and no prompt in its history. The app doesn't start ComfyUI: open Comfy
  Desktop, or run ComfyUI itself (the command is in the findings). Upscale still needs mflux. Findings: [docs/research/comfyui.md](docs/research/comfyui.md).
- **Models download on first use.** Each model (Image Models, the upscaler, the voice models,
  SHARP) is downloaded from Hugging Face into `~/.cache/huggingface` the first time it's needed,
  shown as "Downloading the model (first use only)…" while it is; they're 3–30 GB each, so the
  first use takes minutes. To fetch an Image Model ahead of time, run its command below once:

  | Image Model | Fetch ahead of time with |
  |---|---|
  | FLUX.2 Klein 4B (default, ~13 s per image) | `mflux-generate-flux2 --model flux2-klein-4b --prompt test --steps 4 --output /tmp/x.png` |
  | FLUX.2 Klein 9B (~8 s at 512 px, ~22 s at 832×1216) | `mflux-generate-flux2 --model flux2-klein-9b --prompt test --steps 4 --output /tmp/x.png` |
  | Z-Image Turbo, 4-bit (~42 s per image) | `mflux-generate-z-image-turbo --model filipstrand/Z-Image-Turbo-mflux-4bit --base-model z-image-turbo --prompt test --output /tmp/x.png` |
  | Krea 2 Turbo (~32 s at 512 px) | `mflux-generate-krea2 --model krea-2 --prompt test --output /tmp/x.png` |
  | ERNIE-Image Turbo (~18 s at 512 px) | `mflux-generate-ernie-image-turbo --model ernie-image-turbo --prompt test --output /tmp/x.png` |
  | Boogu Image Turbo (~16 s at 512 px) | `mflux-generate-boogu --model boogu-image-turbo --prompt test --output /tmp/x.png` |
  | Qwen-Image 2.1 (~23 s at 512 px, 25 steps) | `mflux-generate-qwen-2.1 --model qwen-image-2.1 --prompt test --output /tmp/x.png` |
  | SeedVR2 upscaler, 7B and 3B (Upscale, ~46 s to 2048 px) | `mflux-upscale-seedvr2 --model seedvr2-7b --image-path /tmp/x.png --resolution 2048 --output /tmp/y.png` (one download holds both) |

- **Voices (optional), for Roleplay Characters:** [uv](https://docs.astral.sh/uv/) runs the voice
  service (`python/voice/serve.py`), which installs its own Python packages (mlx-audio, torch) on first
  use, and its two models (about 12 GB: Qwen3-TTS VoiceDesign and Higgs TTS 3) the first time
  each is needed; `uv run python/voice/serve.py --download` fetches both ahead of time.
  Apple Silicon Macs only (mlx-audio).
- **2.5D scenes (optional), for Roleplay and Chain pictures:** uv runs Apple's SHARP (`python/sharp/make.py`), which
  installs its own Python packages (torch) on first use, and its weights (2.8 GB, from Hugging
  Face's [apple/Sharp](https://huggingface.co/apple/Sharp)) with the first scene;
  `uv run python/sharp/make.py --download` fetches them ahead of time. They're under Apple's
  research-only model license: fine for playing at home, not for anything commercial.
  Runs on an Apple Silicon Mac's GPU or an NVIDIA one (CUDA, on Windows or Linux).
- **3D figures (optional), for the person in a Roleplay or Chain picture:** uv runs TripoSplat (`python/triposplat/make.py`; its code is
  in `python/triposplat/vendor/`, MIT), which installs its own Python packages (torch) on first use, and
  its weights (4.2 GB, Hugging Face's [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat))
  with the first figure; `uv run python/triposplat/make.py --download` fetches them ahead of time.
  Runs on an Apple Silicon Mac's GPU or an NVIDIA one.
- **LiTo figures (optional):** uv runs Apple's LiTo through mlx-spatial (`python/lito/make.py`, Python
  3.13, fetched by uv), cutting the person out with TripoSplat's BiRefNet first. Its weights (4.4 GB,
  [appautomaton/lito-research-mlx](https://huggingface.co/appautomaton/lito-research-mlx), Apple's
  research-only, non-commercial license) download with the first figure;
  `uv run python/lito/make.py --download` fetches them ahead of time.
  Apple Silicon Macs only (mlx-spatial is MLX).
- **Saved quantized copies** of Image Models (with Quantize on in Settings) are made by the app on
  first use, 13–22 GB each, in `models/quantized/` in this folder (gitignored); Settings lists them
  to delete.
- **Fast (Qwen-Image 2.1, optional):** Settings → Fast renders with Viggle's 6-step turbo LoRA
  ([Viggle/Qwen-Image-2.1-viggle-turbo](https://huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo),
  1.3 GB, Qwen's research license), which mflux downloads with the first fast render.

## Getting started

```sh
deno install        # install web dependencies
ollama serve        # if Ollama isn't already running
deno task dev       # starts the API on :8787 and the web app on :5180
```

Open <http://localhost:5180>, go to **Settings**, choose a Text Model (on another backend: pick it
and give its address first), then go **Home** (click
**Local Roleplay Studio**) and press **Start Session**. Your Sessions are listed on Home; open one to carry on,
or delete it.

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
| `IMAGE_GENERATOR` | (mflux) | Set to `placeholder` to render SVG cards instead of running mflux, for working without a GPU |

The web app's dev server is pinned to port **5180** and fails, rather than picking another port,
if something else is using it.

Everything else is chosen on the Settings page (in tabs: Text, Images, Voice, 3D) and saved to
`settings.json`, including the Text backend's API key (never sent back to the browser).

**What runs where.** Only a Text backend is required: Ollama, or a server with the OpenAI chat API. At startup the server works out which extras this
machine can run, and says so in its log and on the Settings page: pictures need mflux (an Apple
Silicon Mac) or ComfyUI chosen in Settings; Upscale and voices (mlx-audio) need an Apple Silicon Mac; SHARP and TripoSplat need an Apple Silicon Mac or an NVIDIA
GPU; LiTo needs an Apple Silicon Mac; the Python ones need uv. One that can't run is off and its
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
  voice/          the voice service's client
  3d/             SHARP scenes, TripoSplat and LiTo figures
  prompts/        what the Text Model is told, one Markdown file each: chain/, storyboard/,
                  roleplay/, and shared/ for what more than one uses
web/              Vue 3 + Vite + Tailwind 4 web app
python/           What uv runs, each in its own folder with its packages pinned in the file:
  voice/          the voice service (mlx-audio)
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
- **One Frame at a time.** mflux can't usefully render two images at once on one Mac, so a
  Session accepts no new Action while a Frame is running.

## Documentation

- [docs/design.md](docs/design.md): how the game works (Frame loop, failure handling, UI, storage)
- [docs/scenarios.md](docs/scenarios.md): the Scenario file format
- [docs/models.md](docs/models.md): which Text and Image Models to use, and why
- [docs/research/](docs/research/): surveys and trials (image to 3D, small uncensored models)
- [docs/adr/](docs/adr/): architecture decisions and why they were made
- [docs/open-threads.md](docs/open-threads.md): ideas deliberately deferred
- [CONTEXT.md](CONTEXT.md): glossary
