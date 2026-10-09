---
status: accepted
---

# A heavy job unloads the Text Model only on the machine it runs on

A render next to a loaded Text Model pushed a 48 GB Mac into swap: Qwen-Image 2.1 at 1024 px took
375–403 s in a Roleplay beside the 18 GB heretic, against 66 s alone (2026-10-05). Ollama keeps a
model loaded for 5 minutes after its last use, so since then every heavy job unloads it when its
turn in the render queue comes (`keep_alive: 0`): a render, an upscale, a SHARP scene, a figure,
and a voice made with a heavy engine. A spoken line doesn't: it's small and frequent. A Text
backend on the OpenAI API can't be unloaded, so it's left alone.

Since 2026-10-09 the job unloads it **only when both run on the same machine**
(`server/machine.ts`). Pictures, Upscale and voices can run on a ComfyUI elsewhere on the network
(ADR 0009, ADR 0010), and unloading the Mac's Text Model for a render on a PC freed nothing: it only
made the next Reply reload it. Where each job runs:

- a render: on its Session's Image backend (ComfyUI at the Session's address, or mflux here);
- an upscale and a voice: on the backend Settings choose now (ComfyUI at Settings' address, or
  mflux and the voice service here);
- a scene or a figure: here (SHARP, TripoSplat, LiTo).

The Text Model runs at its Settings address, or Ollama's own. Two addresses are the same machine
when both are this one (loopback, or one of its own names and addresses, which Deno reads with
`--allow-sys=hostname,networkInterfaces`), or when they name the same host.

## Considered Options

- **Unload before every heavy job, wherever it runs** (2026-10-05 to 2026-10-09). Safe, but a
  render on another machine reloaded the Text Model for nothing after each picture: seconds for the
  heretic, more for gemma4 31B.
- **Keep the Text Model loaded when both fit**, judged by the free memory at each render against
  the job's measured peak. With mflux 0.22's `--low-ram`, Qwen-Image 2.1 (9.4 GB at 1024 px) and
  gemma4 (~20 GB) fit in 48 GB. Not done: the app can't know what else is running or will start, the
  peaks are measured on one Mac only, and a wrong guess costs minutes of swap, where unloading
  costs seconds. Kept in [open-threads.md](../open-threads.md) ("Memory headroom").
- **A Setting to switch unloading off.** A choice the player would have to understand, where the
  machine can be worked out.

## Consequences

- A new heavy job passes where it runs to the render queue (`HeavyJob`); one that passes nothing
  counts as running here, so it unloads.
- Two names for one machine that aren't its own (a DNS alias for a PC, say) count as two machines,
  so the Text Model stays loaded. That errs towards the slower render, not the lost Reply.
- When the Text Model itself is on another machine (Ollama on the PC), a render here leaves it
  loaded, and a render on that machine unloads it.
