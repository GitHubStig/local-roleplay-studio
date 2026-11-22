# Showcase

Material for a public page about Local Roleplay Studio, collected as it happens, for the page to be built from later, in this folder (as [retrospectives/screens-redesign/](../retrospectives/screens-redesign/index.html) is). It's the owner's own project, not a feature of the app: after two months of building every day, a lot was built, and as much was tried and not built, which is why `docs/bench/`, `docs/research/` and a few artifacts are kept.

## What the page is for

Three things, the last as important as the others:

1. **What the app is.** It began as a way to write Image Prompts with a local Text Model, change them and see each one rendered by a local Image Model, with no other apps and no cloud services. It grew into one app that brings text, image, voice, video, music and 2.5D/3D models together in the form of a game: a roleplay or companion chat (a Roleplay), or a story planned ahead (a Storyboard) or steered picture by picture (a Chain), pictured, voiced, scored and animated as it's played. Plenty of tools wrap ComfyUI and other runtimes in workflows, and this one does too, but as a story to play rather than a workflow to run. It's local first, and it's also a testbed for AI models of every kind: when a new one comes out, it can be benchmarked here, or added to the app, which is what `docs/bench/` and `docs/research/` record.
2. **What was built, and how we got there**: the benches, retrospectives, ADRs and research behind each part.
3. **What was tried and dropped, and why**: the experiments that didn't generalise, didn't scale or were overtaken by something better.

## How it started

The owner's own account, moved from [design.md](../design.md) on 2026-11-22, as it was written:

> The original aim was to make it easy to iterate on Image Prompts and test them across image-generation models. I found [Draw Things](https://drawthings.ai) and [ComfyUI](https://www.comfy.org) hard to learn and overwhelming when all I wanted was to iterate on prompts; discovering [mflux](https://github.com/mflux-community/mflux) and Qwen-Image 2.1 led me to a simpler, more playful interface. Chain began as one-step-at-a-time prompt editing; Storyboard grew from wanting to build a short comic more quickly, and Roleplay added prompt-making to an ongoing character conversation.

## Pictures in the README

The repo's README has no pictures or videos of the app, on purpose: the owner didn't want to show the screens before the redesign ([ADR 0039](../adr/0039-every-session-screen-has-one-shape.md)). Since it, they're happy to add some, once more of the app's features are settled. What shows each part best can be noted here as it's found.

## Built, and how we got there

A line each: the part, and what tells its story.

- **The screens.** Redesigned in November: [retrospectives/screens-redesign/](../retrospectives/screens-redesign/index.html), with before and after shots, and [ADR 0039](../adr/0039-every-session-screen-has-one-shape.md).
- **3D from a picture.** A Frame's picture as a 2.5D scene (SHARP), and a person as a whole 3D figure (TripoSplat, LiTo): the survey in [research/image-to-3d.md](../research/image-to-3d.md). Something to see is the point here: a small hosted interactive scene if practical, otherwise a screenshot or short capture. (From open threads, the owner, 2026-10-26.)
- **The camera moved by an edit.** [bench/camera/](../bench/camera/README.md): a re-render can't keep the people and place while the camera moves, an edit can; decided in [ADR 0038](../adr/0038-the-camera-is-moved-by-an-edit.md).
- **People in a Roleplay.** Who's in the picture and what they wear, carried from Frame to Frame: [research/people-in-pictures.md](../research/people-in-pictures.md), [bench/two-people/](../bench/two-people/README.md); Truths against a player who overpowers everyone, [bench/truths/](../bench/truths/README.md); others in the scene, [bench/others/](../bench/others/README.md).
- **Music that follows the story.** [bench/music-models/](../bench/music-models/README.md) (MiniMax Music 3 against ACE-Step 1.5, by ear), [bench/music-director/](../bench/music-director/README.md) (where the music changes), [bench/music-cues/](../bench/music-cues/README.md) (what each Cue asks for); [research/music-in-play.md](../research/music-in-play.md) for what's still hard.
- **Clips.** Each kind of clip, across LTX 2.5, Wan 2.2 and MiniMax H3: [bench/video-ltx/](../bench/video-ltx/README.md), [bench/video-kinds/](../bench/video-kinds/README.md), [research/video-models.md](../research/video-models.md).
- **Voices.** [bench/voices/](../bench/voices/README.md) and [research/voices.md](../research/voices.md).
- **Image Models.** How a picture forms and how many steps it needs, [bench/steps/](../bench/steps/README.md); precision and memory, [bench/precision/](../bench/precision/README.md); [research/image-models.md](../research/image-models.md).

## Tried and dropped

A line each: what it was, why it went, and what took its place.

- **Idle animation** (2026-10-06 to 10-29). Making a still picture feel alive between Frames: a blink, lamp light, a flickering flame. It worked on the demos but didn't generalise to every picture or scale, and image-to-video, the Idle Loop clip, did it easily once built. [bench/idle-animation/](../bench/idle-animation/README.md), [ADR 0025](../adr/0025-clips-by-kind.md).
- **Tags instead of prose for the Art Agent** (2026-09-29 to 10-26). A few tags per aspect of a picture, for speed or tag-trained models; prose did better on every model measured, as tags can't say who does what to whom. [bench/art-tags/](../bench/art-tags/README.md), [ADR 0023](../adr/0023-the-art-agent-writes-prose.md).
- **JSON captions for the models trained on them** (2026-10-11 to 10-27). Not built: the models that read them read prose as well. [ADR 0033](../adr/0033-no-json-captions-from-the-art-agent.md).
- **A figure inside its 3D scene** (2026-10-04, decided 10-28). SHARP's room with the TripoSplat or LiTo figure placed where the person was: it worked as an image, but not well enough to ship. [ADR 0024](../adr/0024-no-figure-in-its-room.md).
- **Pictures that agree, for clips between them** (dropped 2026-11-01). Each Roleplay picture shows the room differently, which LTX 2.5 couldn't join; Wan 2.2 and MiniMax H3 could, so it wasn't needed. [research/video-models.md](../research/video-models.md#into-next-between-pictures-that-dont-agree-an-ltx-problem-the-owner-2026-11-01).
- **MiniMax Music 3** (2026-11-07 to 08). Benched against ACE-Step 1.5 by ear, and dropped: its tracks were its own length, and voices came in where none were asked. [ADR 0035](../adr/0035-music-from-ace-step-through-comfyui.md).
- **Posing a Character with a ControlNet** (2026-10-09 to 11-22). Posing a figure for a Frame: more work than a player would put in, when an edit model fixes a pose from a sentence. Its suggested uses are in [research/people-in-pictures.md](../research/people-in-pictures.md#controlnets-suggested-uses-untried).
- **Thumbnails as a file per picture.** Dropped for the files they add; a sprite sheet is the idea now (open threads).
- **A Frame all or nothing** ([ADR 0003](../adr/0003-turns-are-all-or-nothing.md), replaced by [ADR 0030](../adr/0030-a-chain-frame-renders-as-a-job.md)), and **a Storyboard in one call** ([ADR 0006](../adr/0006-storyboards-plan-in-one-call.md), replaced by [ADR 0019](../adr/0019-storyboards-plan-review-write.md)): designs replaced as the app grew.

## Tried, not built yet

- **Reference portraits** (2026-10-06 on the Mac; a day of trials on 2026-11-22, both machines). A portrait of each person to keep faces the same: in the render it holds faces but pulls expressions and poses; repainting only the faces after the render keeps the moment, with the faces found by the vision model already loaded. The collages, full-size crops, and four conclusions that turned out wrong, three overturned by the owner's questions (a ComfyUI "regression" that was a seed, "one face per edit" that was wording, "prompt order" that was a prompt with no looks in it) and one by a closer look (a "dark band" that was a seam): [bench/reference-portraits/2026-11-22/](../bench/reference-portraits/2026-11-22/README.md). On the way it found a real bug, edits reusing their picture's seed, fixed the same day.

## Hosting, and what's kept for it

GitHub Pages could host the page and its static files, as here.now hosts the exported Compare page. The artifacts kept for it can be listed here.
