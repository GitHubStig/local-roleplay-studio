# RPG

A turn-based, text-driven role-playing simulator that runs entirely on your Mac. You type an
Action; a local language model (via [Ollama](https://ollama.com)) rewrites the Scene; a local
image model (via [mflux](https://github.com/filipstrand/mflux)) renders it. Then you act again.

The first Scenario is a **studio photoshoot**. You play the photographer, and you direct Maya,
a fictional professional fitness model, through a sportswear campaign: her pose and expression,
your camera, the lighting and the set.

The game's vocabulary (Scenario, Session, Scene, Turn, Action, …) is defined in
[CONTEXT.md](CONTEXT.md). The design is in [docs/design.md](docs/design.md).

## Requirements

- **macOS on Apple silicon.** mflux runs on MLX.
- **[Deno](https://deno.com) 2.9+** runs the server, the web app's tooling and the tests.
- **Node.js 24+**, only for the Vue type check (see [Known quirks](#known-quirks)).
- **Ollama** with at least one chat model, e.g. `ollama pull llama3`. Tested with `llama3:latest`
  (about 10 s per Turn) and `maternion/spark-x2.5-heretic:4b` (about 20 s per Turn, better
  narration).
- **mflux 0.20**: `uv tool install mflux`.
- **Image model weights, downloaded once.** The game runs mflux with Hugging Face downloads
  blocked, so each Image Model must be fetched beforehand. Run the command below online once;
  it saves the weights to `~/.cache/huggingface`.

  | Image Model | Download once with |
  |---|---|
  | FLUX.2 Klein 4B (default, ~13 s per image) | `mflux-generate-flux2 --model flux2-klein-4b --prompt test --steps 4 --output /tmp/x.png` |
  | Z-Image Turbo, 4-bit (~42 s per image) | `mflux-generate-z-image-turbo --model filipstrand/Z-Image-Turbo-mflux-4bit --base-model z-image-turbo --prompt test --output /tmp/x.png` |
  | Krea 2 | `mflux-generate-krea2 --model krea-2 --prompt test --output /tmp/x.png` |

## Getting started

```sh
deno install        # install web dependencies
ollama serve        # if Ollama isn't already running
deno task dev       # starts the API on :8787 and the web app on :5180
```

Open <http://localhost:5180>, go to **Settings**, choose a Text Model, then **Play** → **Start
Session**.

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
sessions/<id>/    Each Session: session.json plus one image per Turn (gitignored)
server/           Deno API: settings, Scenarios, Sessions, the Turn engine, Ollama and mflux
web/              Vue 3 + Vite + Tailwind 4 web app
docs/             Design, Scenario format, ADRs and open threads
CONTEXT.md        Glossary of the game's terms
```

Sessions stay on disk after they end. Delete folders in `sessions/` to reclaim space.

## Writing a new Scenario

Add a Markdown file to `scenarios/`. It appears on the Start Session screen without a restart.
If a file has a problem, the Start Session screen lists every issue found in it. The format is
documented in [docs/scenarios.md](docs/scenarios.md).

## Known quirks

- **`vue-tsc` runs on Node, not Deno.** Volar hooks into how TypeScript loads files, and
  Deno's Node compatibility doesn't support that. `deno task check` therefore calls
  `node …/vue-tsc`. Everything else runs on Deno.
- **TypeScript is on 6.0, not 7.** `vue-tsc` 3.3 can't run on TypeScript 7 (the Go rewrite no
  longer ships `lib/tsc`). Upgrade once Vue's tooling supports it.
- **One Turn at a time.** mflux can't usefully render two images at once on one Mac, so a
  Session accepts no new Action while a Turn is running.

## Documentation

- [docs/design.md](docs/design.md): how the game works (Turn loop, failure handling, UI, storage)
- [docs/scenarios.md](docs/scenarios.md): the Scenario file format
- [docs/adr/](docs/adr/): architecture decisions and why they were made
- [docs/open-threads.md](docs/open-threads.md): ideas deliberately deferred
- [CONTEXT.md](CONTEXT.md): glossary
