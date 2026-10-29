# Video from Frames: plan

A working plan (started 2026-10-29), linked from [open-threads.md](open-threads.md). When it's built, what was decided moves into [design.md](design.md) and an ADR, and this file is deleted.

## The idea

Turn a Frame's picture into a short clip with LTX 2.5 on ComfyUI, on request. Which kind of clip suits a Frame depends on how its pictures came out (and on the player's edits), so the player chooses; the app doesn't guess.

The finding behind it (the owner, 2026-10-29): a picture shows the middle of what its Frame describes ("the traveller enters the tavern" renders her already inside, standing), while a clip should start a little before and end a little after. So the choice is where the still sits in the clip, not only whether there's a second picture.

## Kinds of clip

- **Idle Loop**: the still as both the first and the last frame. Small movement that returns to the start, so it loops. The idle-animation thread's option 4.
- **Lead In**: the still as the last frame. The action arriving at the picture (the door opens, she walks in).
- **Play out**: the still as the first frame. What happens after it (plain image-to-video).
- **Into Next**: this Frame's still first, the next Frame's last (first–last-frame). Offered only when the next Frame has a picture. It moves from one to the other only when the two pictures agree (the same room, laid out the same): between pictures that disagree it cuts or dissolves (2026-10-29), and Play out on one Frame then Lead In on the next, joined by a cut, is the better pair.

The Text Model writes each clip's prompt for its kind, from the Frame's story (and the next Frame's, for Into Next), describing the movement between the pictures rather than the pictures themselves.

## Decided

- The kinds of clip are named Lead In, Play out, Idle Loop and Into Next (the owner, 2026-10-29).
- The player picks the kind of clip; nothing detects it (2026-10-29).
- An option to leave the dialogue out of a clip's prompt, so it has only background sound (the owner, 2026-10-29). The Voice clips can then play over it.
- The ComfyUI backend finds LTX's files by name pattern, as it does an Image Model's, so each machine uses the copy it has installed.
- The video model is a setting, as the upscaler is (the owner, 2026-10-29, with Wan 2.2 and MiniMax H3 in mind): `videoModel` in Settings, chosen on the Clips tab from those `server/video/comfyui/models.ts` lists (each its workflow and files), read as each clip starts and saved on it. The tab checks the ComfyUI clips go to for the model's files, as the other tabs check theirs. A new model is a new entry there and a workflow; for now each guides its pictures in by `firstGuide` and `lastGuide` nodes, as LTX 2.5's does, which a model that does it otherwise would change.
- A Play out is told the Frame's story as already happened, and given what happens next (the next Frame's story, or nothing new on the newest Frame): told the Frame's story as what happens, it replayed it from the wrong place (2026-10-29).
- Into Next may move the camera between two framings, the best of five tries at joining two pictures that disagree; no prompt makes them one moment at the same place (a still camera cut, a morph moved the people), so the app warns when it offers Into Next that it works best when the next picture shows the same place, and suggests Lead In on the next Frame otherwise (2026-10-29, [research/video-models.md](research/video-models.md)).

## Open questions

- How strongly to hold the ends: 1.0 lands closest and still moves, but no strength lands exactly on the picture ([research/video-models.md](research/video-models.md), 2026-10-29). Whether 1.0 looks too still is for watching.
- Length: the clip's frame count must be 8n+1 (97 at 24 fps is ~4 s, 121 ~5 s). Proposed: a Frame with a Voice clip runs the line's length plus some lead and tail; otherwise the Text Model picks from a short list (3, 5 or 8 s), which the player can change; Idle Loop stays short, as it loops.
- Measured on the PC (2026-10-29, [research/video-models.md](research/video-models.md)): about 70 s to load plus ~19 s per second of clip at 1280×704; a still can sit at the last frame only, so every kind of clip is one workflow. Still to judge by watching: the motion, the sound, and Into Next between two pictures that disagree.
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
- [x] A replay script that rebuilds a test Session through the app's HTTP API, so it doesn't depend on `session.json`'s format: `deno task replay` (2026-10-29), with the tavern as a Roleplay in `server/replay/replays/tavern-arrival.yaml`.
- [x] Sketch the UX with the owner (2026-10-29): two mock-ups over the real screens, settled as "Session screens" below.
- [x] Server: a `VideoGenerator` interface and its ComfyUI backend (`server/video/`, 2026-10-29): one LTX 2.5 workflow, the guide at an end without a picture dropped, guides at 1.0; no copy of the pictures or the clip left with ComfyUI (both overwritten with stubs after).
- [x] Server: clips as jobs (2026-10-29): a `clip` job with its order (kind, prompt, seconds 2–10, speech), in the render queue as a `video` heavy job, saved on the picture version it's made from (one per kind, a new one replacing the old, deleted with the picture), served as `video/mp4`. The `video` Feature (Clips) is available where Settings list a ComfyUI; a clip goes to the ComfyUI pictures go to, else the first listed (no Settings picker of its own yet). Into Next is refused when the next Frame has no picture. Checked through the app on the PC: a 4 s Lead In in 133 s, 1152×800 from a 1216×832 picture.
- [x] Prompts for each kind of clip in `server/prompts/video/` (2026-10-29): the Text Model writes one for the player to read and edit (`POST /api/sessions/:id/frames/:index/clip-prompt`, streamed, nothing saved), from the Frame's Image Prompt and story, the Frame before, and for Into Next the next one; read on the tavern in [research/video-models.md](research/video-models.md), not yet made into clips.
- [x] Web: the Clip section in every kind of Session's Frame tab (`FrameClips`, 2026-10-29): the kind, the length, With speech, Write prompt (streamed, editable), Make clip; the clips made, to Play over the picture (`ClipOverlay`, an Idle Loop looping) or put back with Again; Into Next only with a next picture, and its warning.
- [x] Fixing a clip's prompt after watching it (2026-10-29: What went wrong? on each clip in the Frame tab, the same route with `revise: { prompt, problem }` and `prompts/video/clip-revise.md`; tried on the tavern's Into Next, it rewrote a walk out of the door into one step and the coin at the same table). As asked by the owner, 2026-10-29: the player says what went wrong ("she walks out of the door; she should stay at the table and put the coin down"), and the Text Model rewrites the prompt to match, for another try, as Edit takes an instruction. One Text Model call per try. It would have fixed Play out's retelling and "the bar in the background"; it can't join pictures that disagree, which it could say when asked for no travel between two places.

## Where things stand (2026-10-29, end of the first day)

What was decided is in [ADR 0025](adr/0025-clips-by-kind.md), and how it works in [design.md](design.md) (Screens: the selected Frame and Clips); this plan keeps what's still to do.

Built and committed: the video backend (LTX 2.5 on ComfyUI), clips as jobs on a Frame's picture, the Text Model writing (and rewriting) each kind of clip's prompt, the Session screens' Frame tab in all three kinds of Session with its Clip section, playing a clip over its picture, the Clips tab in Settings with the Video model and its ComfyUI check. Everything was checked on the Windows PC; nothing on the Mac.

Next, when picked up:

- **More video models** (the owner: Wan 2.2, MiniMax H3): an entry in `server/video/comfyui/models.ts` and a workflow each. LTX 2.5's workflow guides the pictures in by `firstGuide` and `lastGuide` nodes, which `withoutEnds` drops for a kind of clip without that end; a model that takes its start and end pictures otherwise (Wan's first–last-frame node) needs its own way of leaving an end out.
- **The Mac**: LTX 2.5 through its ComfyUI, with which files (the PC's are `int8-convrot`, likely CUDA only).
- **Seeking in a clip**, and the ComfyUI picker for clips: in "Left for later" below.
- **A Roleplay's pictures that agree**: its Art Agent writes each Frame's Image Prompt afresh, so the room drifts from Frame to Frame and Into Next cuts, where a Chain, which edits the last prompt, joined two Frames without one (research/video-models.md). Worth an open thread of its own: not raised with the owner yet.

## Session screens: a selected Frame (discussion, 2026-10-29)

Where the clip buttons go led to a wider cleanup of the Session screens, to settle with a mock-up before any code. The owner's points: while playing a Roleplay it's hard to tell which Frame you're on; every Frame carries a row of buttons (Picture again, Re-render, Upscale, Edit, SHARP, TripoSplat, LiTo), distracting and many DOM elements; the Image Prompt and timings could live outside the conversation.

The idea on the table: one selected Frame (the newest while playing, or the one clicked), marked in the conversation; its buttons, clip controls, 3D, Image Prompt and timings in a Frame tab in the side panel, under a strip of small pictures that shows where you are and scrolls the conversation. The conversation keeps the text, the picture and Listen, close to how a finished or exported Session would look. One shared component for all three kinds of Session.

Agreed so far: a clip plays over its Frame's picture in the conversation, the same in every kind of Session, and in the large viewer; the panel holds only the controls. Undo stays beside Send.

The mock-up (2026-10-29, drawn over the real screens) found that a Chain and a Storyboard already work this way: one big picture of the selected Frame, a Frames list in the side panel, a panel for that Frame, one row of buttons. So the cleanup is mostly the Roleplay coming into line with them, from the same parts. Settled with the owner on the second version:

- **The middle panel is for moving around**: Frames and Queue, the same in all three (a Roleplay gains the Frames list, which selects a Frame and scrolls the conversation to it).
- **The right panel is for detail, in tabs**: the selected Frame, beside Look & Cast (a Roleplay) or Look (a Storyboard; out from above the Frame); a Chain has only the Frame.
- **Everything about the selected Frame is in its tab**: its Image Prompt and timings (out of the conversation), Picture again beside the prompt it rewrites, Re-render, Upscale and Edit, the Clip section, 3D. **The row under the text box keeps only what's about the whole Session**: Send, Suggest, Render all, Undo (Chain from here on a Storyboard, which has no Undo).
- **Listen becomes a small speaker icon** at the end of the thought and of the spoken line, in place of the two buttons; it needs a speaker icon drawn for the app.
- **The Clip section, one component in all three**: the kind, the length, With speech, the prompt to read and edit (Write again), Make clip; the clips made, each with Play and What went wrong? (the prompt-fixing task); Into Next's warning.
- Later: the right panel folds away to the side on a narrow screen (three columns are cramped at 1440 px; fine at 21:9, the owner's screens).

## Left for later (noted 2026-10-29)

- A picker for which ComfyUI clips go to, if pictures and clips should ever go to different ones (the switch for Clips is in Settings, on a Clips tab, since 2026-10-29).
- Seeking in a clip: the Session's file route sends whole files, without Range requests, which some browsers need to seek a video (to check when the player is built).
