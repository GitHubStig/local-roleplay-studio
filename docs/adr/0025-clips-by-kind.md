---
status: accepted
---

# Clips are made by kind, on the player's choice, from one workflow per model

A Frame's picture can be made into a few seconds of video (LTX 2.5 on a ComfyUI, 2026-10-29; the findings: [research/video-models.md](../research/video-models.md); what's left: [open-threads.md](../open-threads.md), "Clips: what's left").

- **The kind of clip is where the picture sits in it.** A picture shows the middle of what its Frame describes ("she enters" renders her already inside), while a clip should start a little before or end a little after. So a clip is a Lead In (ends on the picture), a Play out (starts on it), an Idle Loop (both ends) or an Into Next (this picture first, the next Frame's last).
- **The player picks the kind; nothing detects it.** Which suits a Frame depends on how its pictures came out and on the player's edits, which nothing upstream sees. Into Next joins two pictures as one shot only when they agree about the place: between two parts of a room, five tries at the prompt gave a cut, a morph that moved the people, or at best a camera move, and the same story as a Chain, whose pictures agree, joined without one. So it's offered only with a next picture, and warns.
- **The Text Model writes the prompt for the player to read and edit**, from the Frame's Image Prompt and story and the Frames either side; a Play out is told the Frame's own story as already happened, as told it as what happens it replayed it from the wrong place. After watching a clip, the player can say what was wrong, and the prompt is rewritten by it.
- **One workflow per video model, for every kind**: the pictures are guided in at the first frame, the last or both (LTX 2.5's `LTXVAddGuide`, at strength 1.0, nearest the picture while still moving), and a kind without an end drops that end's nodes.
- **A clip is kept on the picture version it's made from**, one of each kind (a new one replaces the old), and goes with it: a re-render or an edit makes a picture of its own, without the old one's clips.
- **The Video model is a setting, as the upscaler is, not a kind of work with a Backend of its own**: only a ComfyUI runs one, so it goes to the ComfyUI pictures go to, or else the first listed, and a Settings entry of its own would have nothing to name on a machine without one. Settings check that ComfyUI for the model's files.
- **Not built**: playing a Session's clips as one film, or exporting them (the app isn't a video editor; the plan notes how an export could join them).
