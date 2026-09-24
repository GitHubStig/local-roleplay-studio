---
status: accepted
---

# Images come from the mflux CLI, one process per image, with downloads blocked

mflux has no HTTP API, only per-model `mflux-generate-*` commands and a Python library. The server runs the CLI once per image (`Deno.Command`), reads its progress bar from stderr to report step progress, and kills the process on Cancel. It runs with `HF_HUB_OFFLINE=1`, so an Image Model whose weights aren't downloaded fails straight away with a clear error, instead of silently downloading many gigabytes in the middle of a Turn. Weights are downloaded once, by hand (see the README). The generator sits behind an `ImageGenerator` interface, alongside an SVG placeholder for working without a GPU.

## Considered Options

- **A long-running Python helper** that imports mflux, keeps the model loaded and serves `POST /generate`. Deferred: measured model loading is ~5 s of a 42 s Z-Image Turbo render, and FLUX.2 Klein 4B finishes in ~13 s including loading, so the saving doesn't justify a second process and language. It remains in [open-threads.md](../open-threads.md) and would slot in behind `ImageGenerator`.
- **Allow downloads on first use.** Rejected: a first Turn that silently pulls 10–30 GB looks like a hang.

## Consequences

Each Image Model is an entry in `server/imageModels.ts`: its command, `--model` value, optional `--base-model`, whether its weights are pre-quantized (so `--quantize` is skipped), and its default step count. Adding a model means adding an entry and downloading its weights. Nothing limits rendering to one image across Sessions: two Sessions open in two tabs could each run a Turn and render at once, competing for GPU memory. Within a Session, only one Turn runs at a time.
