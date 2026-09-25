# RPG

A text-to-image prompt generator that runs entirely on your Mac. You say what to
change; a local language model (via [Ollama](https://ollama.com)) rewrites an image prompt, one
paragraph with a sentence each for subject → pose → expression → camera → clothing →
environment → lighting → color → style; a
local image model (via [mflux](https://github.com/filipstrand/mflux)) renders it. Then you change
something else. That's a **Chain**. A **Storyboard** instead plans a whole sequence at once
(a manga page, a video storyboard) from a Brief you type: every Frame's prompt is written up
front, sharing one Look, and you edit and render each Frame as you like.

The first Scenario is a **studio photoshoot** with Maya, a fictional fitness model. Anything in
the prompt can be changed, within four limits the engine enforces: everyone depicted is an
adult, no sexual or nude imagery, no real identifiable people, no restraint or captivity.

The vocabulary (Scenario, Session, Image Prompt, Frame, Action, …) is defined in
[CONTEXT.md](CONTEXT.md). The design is in [docs/design.md](docs/design.md).

## Requirements

- **macOS on Apple silicon.** mflux runs on MLX.
- **[Deno](https://deno.com) 2.9+** runs the server, the web app's tooling and the tests.
- **Node.js 24+**, only for the Vue type check (see [Known quirks](#known-quirks)).
- **Ollama** with at least one chat model. Recommended: `gemma4:31b-mlx` (about 10 s per Frame
  once loaded, Thinking off). Small models (4–8B) can't reliably follow the prompt format; see
  [docs/models.md](docs/models.md) for the comparison.
- **mflux 0.20**: `uv tool install mflux`.
- **Image model weights, downloaded once.** The game runs mflux with Hugging Face downloads
  blocked, so each Image Model must be fetched beforehand. Run the command below online once;
  it saves the weights to `~/.cache/huggingface`.

  | Image Model | Download once with |
  |---|---|
  | FLUX.2 Klein 4B (default, ~13 s per image) | `mflux-generate-flux2 --model flux2-klein-4b --prompt test --steps 4 --output /tmp/x.png` |
  | Z-Image Turbo, 4-bit (~42 s per image) | `mflux-generate-z-image-turbo --model filipstrand/Z-Image-Turbo-mflux-4bit --base-model z-image-turbo --prompt test --output /tmp/x.png` |
  | Krea 2 Turbo (~32 s at 512 px) | `mflux-generate-krea2 --model krea-2 --prompt test --output /tmp/x.png` |
  | ERNIE-Image Turbo (~18 s at 512 px) | `mflux-generate-ernie-image-turbo --model ernie-image-turbo --prompt test --output /tmp/x.png` |
  | Boogu Image Turbo (~16 s at 512 px) | `mflux-generate-boogu --model boogu-image-turbo --prompt test --output /tmp/x.png` |
  | Qwen-Image 2.1 (~38 s at 512 px) | `mflux-generate-qwen-2.1 --model qwen-image-2.1 --prompt test --output /tmp/x.png` |

## Getting started

```sh
deno install        # install web dependencies
ollama serve        # if Ollama isn't already running
deno task dev       # starts the API on :8787 and the web app on :5180
```

Open <http://localhost:5180>, go to **Settings**, choose a Text Model, then go **Home** (click
**RPG**) and press **Start Session**. Your Sessions are listed on Home; open one to carry on,
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

Everything else is chosen on the Settings page and saved to `settings.json`.

## Where things live

```
scenarios/        Scenario files, one Markdown file each (see docs/scenarios.md)
settings.json     Your Settings (gitignored; created on first save)
sessions/<id>/    Each Session: session.json plus one image per Frame (gitignored)
server/           Deno API: settings, Scenarios, Sessions, the Frame engine, Ollama and mflux
web/              Vue 3 + Vite + Tailwind 4 web app
docs/             Design, Scenario format, ADRs and open threads
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
- [docs/adr/](docs/adr/): architecture decisions and why they were made
- [docs/open-threads.md](docs/open-threads.md): ideas deliberately deferred
- [CONTEXT.md](CONTEXT.md): glossary
