# Video from Frames: plan

A working plan (started 2026-10-29), linked from [open-threads.md](open-threads.md). When it's built, what was decided moves into [design.md](design.md) and an ADR, and this file is deleted.

## The idea

Turn a Frame's picture into a short clip with LTX 2.5 on ComfyUI, on request. Which kind of clip suits a Frame depends on how its pictures came out (and on the player's edits), so the player chooses; the app doesn't guess.

The finding behind it (the owner, 2026-10-29): a picture shows the middle of what its Frame describes ("the traveller enters the tavern" renders her already inside, standing), while a clip should start a little before and end a little after. So the choice is where the still sits in the clip, not only whether there's a second picture.

## Kinds of clip (working names)

- **Idle**: the still as both the first and the last frame. Small movement that returns to the start, so it loops. The idle-animation thread's option 4.
- **Lead in**: the still as the last frame. The action arriving at the picture (the door opens, she walks in).
- **Play out**: the still as the first frame. What happens after it (plain image-to-video).
- **Into next**: this Frame's still first, the next Frame's last (first–last-frame). Offered only when the next Frame has a picture. It moves from one to the other only when the two pictures agree (the same room, laid out the same): between pictures that disagree it cuts or dissolves (2026-10-29), and Play out on one Frame then Lead in on the next, joined by a cut, is the better pair.

The Text Model writes each clip's prompt for its kind, from the Frame's story (and the next Frame's, for Into next), describing the movement between the pictures rather than the pictures themselves.

## Decided

- The player picks the kind of clip; nothing detects it (2026-10-29).
- An option to leave the dialogue out of a clip's prompt, so it has only background sound (the owner, 2026-10-29). The Voice clips can then play over it.
- The ComfyUI backend finds LTX's files by name pattern, as it does an Image Model's, so each machine uses the copy it has installed.

## Open questions

- How strongly to hold the ends: 1.0 lands closest and still moves, but no strength lands exactly on the picture ([research/video-models.md](research/video-models.md), 2026-10-29). Whether 1.0 looks too still is for watching.
- Length: the clip's frame count must be 8n+1 (97 at 24 fps is ~4 s, 121 ~5 s). Proposed: a Frame with a Voice clip runs the line's length plus some lead and tail; otherwise the Text Model picks from a short list (3, 5 or 8 s), which the player can change; Idle stays short, as it loops.
- Measured on the PC (2026-10-29, [research/video-models.md](research/video-models.md)): about 70 s to load plus ~19 s per second of clip at 1280×704; a still can sit at the last frame only, so every kind of clip is one workflow. Still to judge by watching: the motion, the sound, and Into next between two pictures that disagree.
- Whether LTX runs on the Mac through ComfyUI, and with which files: the PC's are the `int8-convrot` variants, which may need CUDA.
- LTX makes sound with the picture, which may clash with the Voice clips.
- The UX: where the buttons go, and how a clip shows on its Frame. To sketch together before building it.
- Chains: what a test Chain is made of, for the replay script.

## Not planned: playing or exporting a Session's clips

Playing every clip one after another, as one film, is left out (the owner, 2026-10-29): the app isn't a video editor. If it's wanted later, the cheap way is an export: the clips joined with ffmpeg's concat by stream copy (no re-encoding, as every clip comes out of ComfyUI's SaveVideo the same: MP4, H.264 High 8-bit 4:2:0 at ~4.4 Mb/s, AAC stereo 48 kHz), or each clip on its own, to edit elsewhere. No clip lands exactly on its picture (research/video-models.md), so the joins are cuts, and an export would have to decide whether the Voice clips go over a clip made without dialogue.

## Installed on the PC (2026-10-29)

From ComfyUI's LTX 2.5 template: `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot`, `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot` (text encoder), the video and audio VAEs (bf16) and the x2 spatial upscaler.

## Tasks

- [x] Measure on the PC: each kind of clip, time and peak VRAM, and a still at the last frame only (2026-10-29).
- [ ] A replay script that rebuilds a test Session through the app's HTTP API (a Scenario and a list of Messages, or a Storyboard's Cast and Briefs, with a fixed seed), so it doesn't depend on `session.json`'s format.
- [ ] Sketch the UX with the owner.
- [ ] Server: a `VideoGenerator` interface and its ComfyUI backend, with workflows in `server/video/comfyui/`, run as jobs on the machine's queue.
- [ ] Prompts for each kind of clip in `server/prompts/video/`.
- [ ] Web: the buttons, a clip on its Frame.
