---
status: accepted
---

# Jobs take turns per machine, not per Session

With renders on a ComfyUI on the PC, a Listen on the Mac waited behind them (seen in play, 2026-10-19): each Session ran one job at a time, and every heavy job, a spoken line too, took its turn in the one render queue across Sessions. Both were built for one GPU. [ADR 0013](0013-unload-the-text-model-on-the-job-machine.md) had since taught the app where each job runs, but only to decide whether to unload the Text Model. Since 2026-10-19 the queues use it too:

- **A Session runs at most one job per machine at a time** (`server/jobs.ts`). Each job is given its machine when it's queued (`jobMachine` and `machineKey` in `server/machine.ts`): a picture on the Text Model's server, a render on its Session's Image backend, an upscale on Settings' upscaler, a voice designed or a line spoken on Settings' voice backend, 3D and the style scores here. Jobs on one machine keep their order, so one waiting holds up those behind it there.
- **A job waits for the earlier ones it needs**, wherever they run (`NEEDS`): on its Frame, a render for its picture, an upscale for its render, 3D for its upscale; a spoken line for a voice being designed; the style scores for every picture and render.
- **The render queue is one per machine** (`server/renderQueue.ts`), so across Sessions too a render on the PC doesn't hold up one here, while two on one GPU still take turns.

So a line spoken here plays while the PC renders, and a Reply's picture is written while the render of the one before runs on the PC.

## Considered Options

- **Spoken lines go ahead of queued renders.** Cheaper, but a Listen still waited for the render running, a minute or more.
- **Run every job at once.** The machines that share a GPU would compete for its memory, the reason the render queue was made.

## Consequences

- Several jobs can run on a Session at once. `betweenRenders` (Restart, Undo, a Look edit) waits for every render running; the screens sweep every Frame with a job running, and show a render's picture forming before a picture's text (`runningJob` in `web/src/composables/useJobs.ts`).
- Two names for one machine that aren't its own (a DNS alias for the PC) count as two machines, and now the jobs on them run at once. ComfyUI queues its own work, so they would most likely only wait there; use one address for each machine in Settings.
- A job keeps the machine it was queued with: a Settings change applies to jobs queued after it, and a retried job keeps its own.
- A render keeps the Image Model it was queued with, too (since 2026-10-20, `Job.image`). Before, it took the Session's model when it started: switching a Storyboard from Krea 2 (mflux, the Mac) to FLUX.2 Klein (ComfyUI, the PC) mid-queue left the renders still waiting on the Mac's line rendering Klein on the PC, beside the ones queued after the switch, with the Mac idle (seen in play, 2026-10-20). Now each renders by its own model where it was queued, and a Frame can be queued to render by two models at once; asking again for a render by the same model still queues it once.
- The order of calls in the call log follows when each job ran, which may differ from the order asked.
- Checked on the Mac with the PC's ComfyUI (2026-10-19): during a Moss-Image render on the PC (24.1 s), a Listen on the Mac started at once and spoke its line (15.0 s, designing the voice first) beside it.
