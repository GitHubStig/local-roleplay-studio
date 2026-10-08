---
status: accepted
---

# Voices from the voice service or a ComfyUI server

The voice service (`python/voice/serve.py`) is mlx-audio, so Apple Silicon only, and Windows had no
voices. ComfyUI already makes the pictures there (ADR 0009), and with a custom node pack, [TTS Audio
Suite](https://github.com/diodiogod/TTS-Audio-Suite), it runs the same two models: Qwen3-TTS
VoiceDesign designs a voice from its description, and Higgs TTS 3 clones that clip for each line,
with the same pace, sound and whisper tags (tried on an RTX 4070, 2026-10-08:
docs/research/comfyui.md). So ComfyUI is a second Voice backend. Settings choose it (`voiceBackend`:
`mlx-audio` or `comfyui`, read when a voice is made), at the same address as for pictures
(`imageBaseUrl`). Voices count as available where the voice service runs or Settings choose
ComfyUI. Settings' ComfyUI check also looks for the pack's nodes (`/object_info`).

- **The ComfyUI client is shared**: what talking to ComfyUI takes (queueing a workflow, following it
  over the WebSocket, Cancel, the check that it still answers, uploads, `/view`, the history and
  `/free` after) moved from `images/comfyui/` to `server/comfyui/`, which pictures and voices both
  use. Each part keeps its own workflows (`voice/comfyui/workflows/design.json`, `speak.json`).
- **ComfyUI keeps no audio.** It has no audio output that comes back over the WebSocket, as
  `SaveImageWebsocket` does for pictures, and every save node writes to its output folder. So the
  workflows end in `PreviewAudio`, which writes to its temp folder; the clip is fetched (`/view`)
  and an empty file written over it, as over the uploaded reference clip. ComfyUI clears the stubs
  when it next starts.
- **Each engine says what it makes** (`VoiceProfile`): the voice service writes a WAV reference
  clip and MP3 lines; ComfyUI writes FLAC for both (what `PreviewAudio` writes; there's no MP3
  encoder on the server). The browser plays all three. Lines are about 2.5× the size of the MP3s.
- **A ComfyUI voice is heavy**: Higgs takes ~10 GB of the 4070's 12, so it waits its turn in the
  render queue as a render does, with the Text Model unloaded first (the voice service, beside the
  Text Model in a 48 GB Mac, doesn't), and ComfyUI unloads it after (`/free`).

## Considered Options

- **The voice service on PyTorch and CUDA** (a second backend for `serve.py`). Another inference
  stack to keep, another install (uv, CUDA PyTorch), and a second copy of the models (~13 GB) beside
  ComfyUI's. The pack's slowness (below) looked like PyTorch's generation loop, which this would
  share.
- **Voices in the browser** (the Web Speech API, or Kokoro through transformers.js). No install,
  but no voice designed from a description or cloned, so a Character would pick a preset; kept as an
  open thread.
- **Other node packs.** The Qwen3-TTS-only ones clone generically (docs/models.md), and one pins
  Transformers 4, which would downgrade ComfyUI's; the Higgs-only pack's repository is gone.
- **Converting FLAC to MP3** on the server, to keep lines small. Needs an encoder (ffmpeg) the app
  doesn't otherwise need.

## Consequences

- Slower than a Mac: on the RTX 4070 a line takes ~3.7 s per second of speech (0.8 s on the Mac),
  plus ~8 s to load Higgs after a Reply, and a design ~30 s plus loading.
- Setting it up is the player's, in ComfyUI: the pack through the Manager (which refuses while
  ComfyUI listens on the network), Windows' long paths on, and until its issue #366 is fixed, a
  three-line fix in the pack for designing a voice (README).
- The pack is large (~15 engines and their packages in ComfyUI's Python); the app uses five of its
  nodes (`VOICE_NODES`).
- Its "unload" moves Higgs to the CPU: ~8 GB of ComfyUI's RAM until it restarts, which a 16 GB PC
  feels. Its whispering style pulls a man's voice up to a woman's pitch, so the ComfyUI backend
  whispers with `pitch_low` (docs/research/comfyui.md).
- Higgs's tags are written in two places, `directed()` in the voice service and `higgsText` in
  `voice/comfyui/`; a change to one belongs in the other.
