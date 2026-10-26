---
status: proposed
---

# Settings list the Backends on each Machine; a Session keeps only its models

Settings had one place for each kind of work: one ComfyUI address for pictures, Upscale, edits and voices, one Text backend and its address, and a backend kind beside each model (`imageBackend`, `upscaleBackend`, `voiceBackend`). Jobs already take turns per machine (ADR 0020), but a second ComfyUI, or Ollama on both machines, couldn't be told apart, and every Session copied the address it started with. Decided with the owner on 2026-10-26 (open-threads.md, "Settings built on the machines and backends there are"):

- **Settings list the Backends.** A Backend is one program that runs models, at an address: a ComfyUI, an Ollama, a server with the OpenAI chat API (its API key kept apart, as now). Two ComfyUIs are two Backends. Each has an id, so its address can change without breaking what refers to it.
- **This machine's own programs are Backends too**: mflux, the voice service, SHARP, TripoSplat, LiTo and the style scores, found at startup as now. Every job is sent to a Backend the same way, whether it runs here or not, so any of them could later run on another machine, or a kind of job be shared across several.
- **A Machine is found from a Backend's address** (`machineKey`), not set by hand. Jobs take turns per Machine (ADR 0020), and Settings show the Backends grouped by it.
- **A Session keeps only its models**: its Text Model, its Image Model and steps, and its seed, which decide what it makes. Not a Backend or an address: where a job runs changes how fast it comes and which queue it waits in, not what comes back (a model of the same name on two Backends already counts as the same).
- **Settings decide where each job runs.** For each kind of job (text, pictures, Upscale, edits, voices) Settings name a preferred Backend. A job goes there if it runs the job's model, or else to the next Backend in Settings' list that does; if none does, it says so. This is worked out when the job is queued, and it keeps that Backend (ADR 0020), so a change in Settings moves the jobs queued after it, in running Sessions too.
- **Settings' defaults are models**, each list showing every Backend's: the Default Text Model, Image Model, upscaler and edit model. An edit model on two kinds of Backend becomes one entry (ADR 0021 had two); a version records the Backend that made it, as a Picture records what rendered it.
- **Older files are converted by hand**, on each machine: `settings.json` and the Settings copied into each Session. The app carries no code for it.

## Considered Options

- **A Session keeps its Backend.** Nothing it makes depends on where it runs, and an address it kept would go stale when Settings change.
- **One order for every kind of job.** Simplest, but a Mac couldn't render with mflux and upscale on the PC while both can do both.
- **An order of Backends for each kind of job.** Most control, but more to set up than a preferred one with the list behind it.
- **Defaults naming a Backend with the model.** Not needed once the preferred Backend says where a kind of job goes.

## Consequences

- The Session's Image Model picker lists models, not backends. A Picture keeps recording which kind of Backend rendered it.
- A Text Model is known by its name, which differs between Ollama and a server with the OpenAI chat API, so a Session's Text Model is found only on the Backends that list it.
- The Art Agent model, if set, goes where the Session's Text Model goes.
- 3D and the style scores run only here for now, but are sent to this machine's Backend like any other job.
