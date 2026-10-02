---
status: accepted
---

# Images come from the mflux CLI, one process per image, downloading a model on first use

mflux has no HTTP API, only per-model `mflux-generate-*` commands and a Python library. The server runs the CLI once per image (`Deno.Command`), reads its progress bar from stderr to report step progress, and kills the process on Cancel. A model whose weights aren't downloaded yet is downloaded from Hugging Face by that first render; mflux shows it as a "Fetching N files" bar, which the server reports as a `download` phase ("Downloading the model (first use only)…") rather than as steps. The voice service and SHARP do the same for their models. The generator sits behind an `ImageGenerator` interface, alongside an SVG placeholder for working without a GPU.

**Changed 2026-10-02.** Until then the server ran mflux (and later the voice service and SHARP) with `HF_HUB_OFFLINE=1`: a missing model failed at once, and weights were downloaded by hand beforehand. That was dropped because a first use that shows it's downloading no longer looks like a hang, and fetching by hand was a setup step for every model.

## Considered Options

- **A long-running Python helper** that imports mflux, keeps the model loaded and serves `POST /generate`. Deferred: measured model loading is ~5 s of a 42 s Z-Image Turbo render, and FLUX.2 Klein 4B finishes in ~13 s including loading, so the saving doesn't justify a second process and language. It remains in [open-threads.md](../open-threads.md) and would slot in behind `ImageGenerator`.
- **Block downloads (`HF_HUB_OFFLINE=1`) and fetch by hand.** Chosen first, replaced 2026-10-02 (above): a first Frame that *silently* pulls 10–30 GB looks like a hang, which the `download` phase answers.

## Consequences

Each Image Model is an entry in `server/imageModels.ts`: its command, `--model` value, optional `--base-model`, whether its weights are pre-quantized (so `--quantize` is skipped), and its default step count. Adding a model means adding an entry; its weights download on first use. A server-wide render queue lets only one image render at a time across all Sessions, so two Sessions can't compete for GPU memory; later Frames wait their frame, and can be cancelled while waiting.
