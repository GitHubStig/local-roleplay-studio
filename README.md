# Local Roleplay Studio

Local Roleplay Studio is a local-first studio for creating and iterating on image prompts, then trying them with image-generation models. It offers three ways to work:

- **Chain** (short for Chain of Events): start with one picture and change it one step at a time. For each new Frame, tell the Text Model what to change in the previous Frame's Image Prompt (the instruction is called an Action). For example, start with “A red fox sits beneath a streetlamp in a rainy city.” Then use the Action “Move the fox onto a rooftop and make the rain stop.” The model carries forward details not affected by your Action, and the Image Model can render the revised prompt. The built-in Scenario is a rain-soaked 18th-century tavern, where Kael, a retired smuggler, meets a well-off traveller.
- **Storyboard:** describe the story you want from beginning to end and choose how many Frames it should have (1–32; for example, an 8–10 panel manga). The Text Model proposes a sequence for you to review, then writes an Image Prompt for each Frame using a shared Look. You can edit and render the Frames individually.
- **Roleplay:** play a Persona in a conversation with a Character who has a goal of their own and is played by the Text Model. Each exchange is a Frame; the Character replies with a thought, what they do and what they say. When you choose to picture a moment, the Art Agent writes an Image Prompt based on the conversation so far.

It runs on your own machines: a Mac with Apple silicon, a Windows PC with an NVIDIA card, or both together. Every kind of Session works with a Text Model alone; add image generation, voices and 3D on machines that support them. No cloud is needed, though a cloud Text Model is an option. See [Requirements](#requirements) to check what your machine can run.

With Limits on, the engine enforces three rules on what the models write: no sexual or nude imagery, no real identifiable people, and no restraint or captivity. Age is not restricted. Settings can turn the three Limits off; when off, none are enforced.

The vocabulary (Scenario, Session, Image Prompt, Frame, Action, …) is defined in [CONTEXT.md](CONTEXT.md). The design is in [docs/design.md](docs/design.md).

## Requirements

**On every machine:**

- **[Deno](https://deno.com) 2.9+** runs the server, the web app's tooling and the tests.
- **Node.js 24+**, only for the Vue type check (see [Known quirks](#known-quirks)).
- **A Text backend**: [Ollama](https://ollama.com) with a Text Model (below), or any server with the OpenAI chat API (LM Studio, llama.cpp's server, vLLM, or a cloud service such as OpenRouter), added on the Machines tab of Settings with its address and API key; see [ADR 0008](docs/adr/0008-own-text-client.md) for what it can't do that Ollama can.
- **[uv](https://docs.astral.sh/uv/)** for the optional Python extras (voices, SHARP, TripoSplat, LiTo): each installs its own Python packages on first use.

Everything else is optional: what a machine can run is worked out at startup and shown on the Settings page ([What runs where](#configuration)).

### The Text Model

One model does every text job ([docs/models.md](docs/models.md) has the comparisons, uncensored builds and how to make one). Small models (4–8B) can't reliably follow the prompt format.

- **Gemma 4 12B Heretic, on a Mac or on a Windows/Linux box with enough VRAM:** `ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`, Thinking off. Uncensored, and the most accurate of the small models tried here. **Q4_K_M** is a 4-bit quantization: the weights are stored in about 4.8 bits each on average (most in 4, some sensitive ones in 6) instead of 16, so the model is 7.4 GB on disk and ~8–9.5 GB loaded, enough for a 12 GB card or a 16 GB Mac, at little cost in quality. The same build runs on both machines, so a Session behaves the same on either. ~5 s a Reply on an RTX 4070; on a Mac, ~8 s per Chain Action.
- **Faster on a Mac with memory to spare (32 GB+):** Gemma 4 26B-A4B Heretic on Ollama's MLX engine (`gemma-4-26b-heretic:nvfp4`, made locally as models.md describes; 18 GB loaded), 2–3× faster than the 12B (~3.5 s per Chain Action) because only about 4B of its weights work per token. MLX builds run only on Apple silicon.
- **Ollama's context length** (the slider in Ollama's settings, or `OLLAMA_CONTEXT_LENGTH`) matters for GGUF models, the ones Ollama runs on Windows and Linux. The app sends a Roleplay's whole history with every Reply (a 30-Frame Roleplay is 8–11k tokens, each exchange adds 220–310, so 200 Frames is about 65k) and doesn't set the context itself. When a chat doesn't fit, Ollama keeps the system message, drops the oldest exchanges, and fills the context to the brim, so the Reply has no room and fails, saying the conversation no longer fits. And Ollama reserves a GGUF model's context memory when it loads it, so too much can push the model off the GPU. Set it as high as still fits (`ollama ps` should say `100% GPU`). Gemma 4 keeps most layers' cache to a short window, so its context is cheap: on a 12 GB card, Gemma 4 12B Heretic (Q4_K_M) loads at 8.1 GB, 100% GPU, at 128k, and read a 56.5k-token chat with 11.2 GB of the card in use; 64k covers a 200-Frame Roleplay. On a Mac, the MLX models (the `safetensors` ones, like the Heretic 26B) ignore the slider: they take memory only as a prompt grows (17 GB loaded, 23 GB at 67k tokens).

### Pictures (optional)

The default Image Model is **Qwen-Image 2.1**. Choose a backend on the Images tab of Settings:

- [**mflux**](https://github.com/mflux-community/mflux) (Apple Silicon Macs; mflux 0.23+): FLUX.2 Klein 4B and 9B, FLUX.3 Klein, Z-Image Turbo and Z-Image, Krea 2 and Krea 2 + LoRA, ERNIE-Image Turbo, Boogu Image Turbo, Qwen-Image 2.1, Qwen-Image 2.1 Turbo, Qwen-Image 2.1 Viggle Turbo, Ming-Image 0.1 Design, FIBO 1.5, and Ideogram 4.
- [**ComfyUI**](https://www.comfy.org) (any machine): Qwen-Image 2.1, Qwen-Image 2.1 Turbo, FLUX.2 Klein 4B, FLUX.3 Klein, Ming-Image 0.1 Design, MOSS-Image, and Z-Image Turbo. ComfyUI must be installed and running; it can be on another machine.

**Image edits:** Qwen-Image 2.1 Edit on mflux or ComfyUI; FLUX.3 Klein Edit, FIBO 2.0 Dev Edit, and FIBO 2.0 Edit Turbo on ComfyUI.

**Upscaling:** SeedVR2 7B or 3B on either backend.

Across all three Session types, any pictured Frame can be re-rendered, edited, upscaled or turned into 3D when those features are available on your machine. In Roleplay, the Character's lines can also be spoken aloud in their designed voice.

mflux downloads model files the first time you render with a model. ComfyUI model files must be installed in ComfyUI separately; the app checks for missing files. See [docs/image-model-setup.md](docs/image-model-setup.md) for setup and download details, and [docs/models.md](docs/models.md) for model comparisons.

### Compare and share

Once at least two Image Models have rendered pictures in a Session, **Compare** lays them out by Frame so you can view the results side by side. **Export** makes a standalone page with the comparison and its pictures that you can open locally or publish on a static host. If you include Style scores, the exported page can switch between the pictures and the scores.

Examples: [image comparison](https://vivid-sorbet-76fq.here.now/) · [style scores](https://vivid-sorbet-76fq.here.now/?view=scores)

### Voices (optional)

For Roleplay Characters, two models: Qwen3-TTS VoiceDesign designs a voice from its description, and Higgs TTS 3 clones it for every line. "Speak with" on the Voice tab of Settings says what runs them:

- **The voice service** (a Mac): uv runs `python/voice/serve.py` (mlx-audio), and the two models (about 12 GB) download the first time each is needed; `uv run python/voice/serve.py --download` fetches both ahead of time. mlx-audio is MLX, so Apple Silicon only.
- **ComfyUI** (a PC with an NVIDIA card of 12 GB, or any machine), at the same address as for pictures, with [TTS Audio Suite](https://github.com/diodiogod/TTS-Audio-Suite)'s custom nodes. Install them through ComfyUI's Manager (in Comfy Desktop, the Extensions button). On Windows:
  - the Manager won't install while ComfyUI listens on the network: take `--listen 0.0.0.0` out of the launch arguments to install, then put it back;
  - turn on long paths (in PowerShell as admin: `New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`), then restart ComfyUI, or designing a voice fails to set up;
  - install version 5.9.3 or later, which fixes designing a voice on Windows ([#366](https://github.com/diodiogod/TTS-Audio-Suite/issues/366)). Comfy's registry has flagged every release since 5.8.4, so the Manager offers 5.8.4: choose **nightly** in its version list (it installs the repository's latest) until the registry approves a later one.

  The models download into ComfyUI the first time each is used (8.9 GB for Higgs). Each voice unloads the Text Model first when it's on that machine, as a render does, since Higgs takes ~10 GB of the card. On an RTX 4070 a line takes about 3.7 s per second of speech (a Mac: 0.8 s), plus ~8 s to load Higgs after a Reply. Clips come back as FLAC, and ComfyUI keeps none: they're read from its temp folder and blanked there.

### 3D (optional)

Each runs once per scene or figure through uv, downloading its weights with the first one (`uv run python/<tool>/make.py --download` fetches them ahead of time):

- **SHARP** (`python/sharp/make.py`; Apple's [apple/Sharp](https://huggingface.co/apple/Sharp), 2.8 GB, research-only license: fine at home, not for anything commercial) makes a picture a 2.5D scene. On a Mac's GPU (~11 s) or an NVIDIA one (~31 s on an RTX 4070, peaking at 11.9 GB of its 12).
- **TripoSplat** (`python/triposplat/make.py`; its code in `python/triposplat/vendor/`, MIT; weights 4.2 GB, [VAST-AI/TripoSplat](https://huggingface.co/VAST-AI/TripoSplat)) lifts the person out as a figure. On a Mac's GPU (70–100 s) or an NVIDIA one (~52 s on an RTX 4070).
- **LiTo** (`python/lito/make.py`, through mlx-spatial, Python 3.13; weights 4.4 GB, [appautomaton/lito-research-mlx](https://huggingface.co/appautomaton/lito-research-mlx), Apple's research-only, non-commercial license) does the same another way, cutting the person out with TripoSplat's BiRefNet first. Apple Silicon Macs only.

### Style scores (optional)

Compare's **Style scores** measure how much each Image Model's art style varies across a Session's Frames. `python/style/make.py` runs once per scoring through uv, on the GPU (a Mac's or an NVIDIA one) or slowly on the CPU, and downloads its two models the first time (CSD, 2.4 GB of which 1.2 GB is used, CC-BY-4.0; CLIP ViT-L/14, 1.7 GB). On a Mac, 340 pictures take about 35 s.

### Two machines

The app finds ComfyUI and Ollama by address, so any machine can use another's on the local network, either way round. A common case is a Mac rendering and upscaling on a Windows PC's ComfyUI. On Settings' Machines tab, add a ComfyUI at the PC's address (`http://<its IP>:8188`), and choose it under "Render on" and "Upscale on" (Images tab). On the tested pair, a picture took ~21 s instead of 56–97 s with mflux, and an upscale 14 s instead of ~66 s. The Text Model can live on the other machine the same way (an Ollama or a server at its address, chosen under "Text Model runs on"), e.g. to keep the Mac's memory for mflux. What runs as a local program can't be shared yet: mflux, the voice service, SHARP, TripoSplat and LiTo run where the app runs (ADR 0022).

For another machine to reach ComfyUI, it must listen beyond its own machine: in Comfy Desktop, add `--listen 0.0.0.0` to the installation's launch arguments, and let the firewall allow TCP 8188 on the private network (Windows Firewall on a PC). ComfyUI has no login, so anything on that network can use it. Ollama likewise needs `OLLAMA_HOST=0.0.0.0` set where it runs.

## Getting started

```sh
deno install        # install web dependencies
ollama serve        # if Ollama isn't already running
deno task dev       # starts the API on :8787 and the web app on :5180
```

The same on Windows, in PowerShell. Open <http://localhost:5180>, go to **Settings**, choose a Text Model (on another machine: add it on the Machines tab first) and, for pictures, an Image Model (on Windows, add your ComfyUI on the Machines tab first; it must be running), then go **Home** (click **Local Roleplay Studio**) and press **Start Session**. Your Sessions are listed on Home; open one to carry on, or delete it.

## Tasks

| Command | What it does |
|---|---|
| `deno task dev` | API server (auto-restarts on change) plus the Vite dev server |
| `deno task test` | Server tests (`deno test --parallel`, a file per worker) and web tests (Vitest), side by side |
| `deno task check` | Type-checks the server with Deno and the web app with `vue-tsc` |
| `deno task build` | Production build of the web app into `web/dist` |
| `deno fmt` | Formats the TypeScript files |

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | API server port. The Vite proxy expects 8787. |
| `OLLAMA_HOST` | `http://localhost:11434` | Where Ollama listens |
| `IMAGE_GENERATOR` | (Settings' backend) | Set to `placeholder` to render SVG cards instead, for working without a GPU |

The web app's dev server is pinned to port **5180** and fails, rather than picking another port, if something else is using it.

Everything else is chosen on the Settings page (in tabs: Machines, Text, Images, Voice, 3D, Advanced) and saved to `settings.json`, including each Backend's API key (never sent back to the browser).

**What runs where.** Only a Text backend is required: Ollama, or a server with the OpenAI chat API. At startup the server works out which extras this machine can run, and says so in its log and on the Settings page:

| | Mac (Apple silicon) | Windows or Linux, NVIDIA card |
|---|---|---|
| Pictures | mflux, or ComfyUI | ComfyUI |
| Upscale | mflux, or ComfyUI | ComfyUI |
| Voices | mlx-audio (uv), or ComfyUI | ComfyUI (TTS Audio Suite) |
| SHARP, TripoSplat | yes (uv) | yes (uv) |
| LiTo | yes (uv) | no |

Where mflux or the voice service can't run (a PC), Settings start on ComfyUI for pictures, Upscale and voices, and the log says whether ComfyUI answers at its address and has what they need. ComfyUI can be on another machine, so a Mac can use a PC's ([Two machines](#two-machines)). One that can't run is off and its buttons are hidden, with the reason in Settings; one that can is on, and can be switched off there. Without pictures, every kind of Session still runs on the Text Model alone: a Roleplay is a conversation, a Chain writes each Frame's prompt and a Storyboard plans and edits, ready to render on a machine that can.

## Where things live

```
scenarios/        Scenario files, one Markdown file each (see docs/scenarios.md)
settings.json     Your Settings (gitignored; created on first save)
sessions/<id>/    Each Session: session.json plus its pictures, voices and 3D files (gitignored)
exports/<id>/     A Session's Compare table exported as a page, with its pictures (gitignored)
server/           Deno API: the app, Sessions, Settings, the job queue, what all kinds of Session share
  chain/          a Chain's Frames and jobs
  storyboard/     a Storyboard's plan and edits
  roleplay/       a Roleplay: its engine, Art Agent, voices and jobs
  text/           the Text backends (Ollama, OpenAI-compatible) behind one Chat interface
  images/         the Image backends: mflux/, comfyui/ (its workflows in comfyui/workflows/),
                  and the placeholder
  voice/          the Voice backends: the voice service's client, and comfyui/ (its workflows in
                  comfyui/workflows/)
  comfyui/        what talking to ComfyUI takes, for pictures and voices alike
  3d/             SHARP scenes, TripoSplat and LiTo figures
  style/          Compare's style scores: the embedder, the measures and the job
  export/         the Compare table as a page of its own, its pictures as WebP
  prompts/        what the Text Model is told, one Markdown file each: chain/, storyboard/,
                  roleplay/, and shared/ for what more than one uses
web/              Vue 3 + Vite + Tailwind 4 web app; export.html is the exported Compare page
python/           What uv runs, each in its own folder, its packages in the file and locked beside it
                  (`make.py.lock`), so both machines run the same versions:
  voice/          the voice service (mlx-audio, so Mac only)
  sharp/          Apple's SHARP: a picture as a 2.5D scene
  triposplat/     TripoSplat: the person in a picture as a 3D figure (VAST's code in vendor/)
  lito/           Apple's LiTo, through mlx-spatial: the same, another way
  style/          CSD and CLIP: the pictures as vectors, for Compare's style scores
docs/             Design, models, research, Scenario format, ADRs and open threads
CONTEXT.md        Glossary of the game's terms
```

Sessions stay on disk until you delete them from Home (or remove their folder in `sessions/` while no Frame is running).

## Writing a new Scenario

Add a Markdown file to `scenarios/`. It appears on Home, under *Start a new Session*, without a restart. If a file has a problem, Home lists every issue found in it. The format is documented in [docs/scenarios.md](docs/scenarios.md).

## Known quirks

- **`vue-tsc` runs on Node, not Deno.** Volar hooks into how TypeScript loads files, and Deno's Node compatibility doesn't support that. `deno task check` therefore calls `node …/vue-tsc`. Everything else runs on Deno.
- **TypeScript is on 6.0, not 7.** `vue-tsc` 3.3 can't run on TypeScript 7 (the Go rewrite no longer ships `lib/tsc`). Upgrade once Vue's tooling supports it.
- **One Frame at a time.** A Session accepts no new Action, Message or edit while one is being written or rendered. Pictures, upscales, voices and 3D asked for meanwhile are queued, and every Session shares one render queue, as one GPU can't usefully render two at once.

## Documentation

- [docs/design.md](docs/design.md): how the app works (Frame loop, failure handling, UI, storage)
- [docs/scenarios.md](docs/scenarios.md): the Scenario file format
- [docs/image-model-setup.md](docs/image-model-setup.md): image model setup and optional prefetching
- [docs/models.md](docs/models.md): which Text and Image Models to use, and why
- [docs/uv-upgrades.md](docs/uv-upgrades.md): how to update uv and validate its Python scripts on Windows and Mac
- [docs/research/](docs/research/): surveys and trials (ComfyUI, image to 3D, small uncensored models, LLM libraries)
- [docs/adr/](docs/adr/): architecture decisions and why they were made
- [docs/open-threads.md](docs/open-threads.md): ideas deliberately deferred
- [CONTEXT.md](CONTEXT.md): glossary
