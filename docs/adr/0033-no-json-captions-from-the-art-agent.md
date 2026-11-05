---
status: accepted
---

# No JSON captions from the Art Agent

Some Image Models are trained on structured JSON captions rather than prose: Ideogram 4, FIBO 1.5 and 2.0, and MOSS-Image's layout prompt on ComfyUI (boxes, each with a caption and any text to render). Since 2026-10-11 an open thread asked whether the Art Agent should write captions as a second picturing format for those models, beside prose ([ADR 0023](0023-the-art-agent-writes-prose.md) left that door open). Decided with the owner on 2026-11-05 not to build it: the Art Agent writes prose for every Image Model.

- **A model that reads prose doesn't get captions.** FIBO 2.0 takes prose straight into its text encoder on ComfyUI (`TextEncodeFibo2`, no VLM; checked 2026-10-27 on the PC), and on mflux prose is the app's entry, since `--expand-prompt` cost about 92 s more and missed the style asked for (research/image-models.md). MOSS-Image is the closest to the words of any model on the PC from prose. So neither needs a caption, even though FIBO 2.0's mflux README calls prose "freeform text that works less well".
- **FIBO 1.5 is superseded by FIBO 2.0**, so nothing more is built for it, including writing its caption in place of its 8.9 GB VLM (`briaai/FIBO-vlm`).
- **Ideogram 4 was the only model that needed a caption**, and it isn't worth building for. From prose it stamped a line of garbled lettering across the picture, where the same scene as a caption came out clean (Mac, one scene, research/image-models.md). On 2026-10-14 (Mac, mflux 0.22) a plain tavern prompt with nothing to block came back as a black "Image blocked by safety filter" picture at seed 42, 512², on both the 12- and 20-step presets. mflux has no filter of its own, so the model draws that picture itself. mflux's Ideogram 4 README says plain prompts "can reduce quality and increase safety-filter false positives", so a caption might have helped, but that was never checked. Ideogram 4 is slow (~36–57 s at 512² on the Mac) and Ideogram 4.5 is out, possibly with open weights soon. Waiting for it beats building a caption format for 4.
- **A caption is costly for the Text Model.** It's nested JSON with bounding boxes and colours, the kind of schema where Gemma 4 has written runaway whitespace (AGENTS.md), and prose did better than the last other format tried (tags, ADR 0023).

## Considered Options

- **Captions for Ideogram 4 only**, after a hand-written caption had been checked over a few seeds. Not worth it for a slow model with a successor out.
- **One caption format for Ideogram 4 and MOSS-Image**, since both lay out elements in boxes. MOSS-Image reads prose well, so it would serve Ideogram 4 alone.
- **ComfyUI's Prompt Enhancer for FIBO 2.0** (`image_fibo2_edit_dev_pe` templates: a `TextGenerate` node on Qwen3-VL-8B with Bria's rewrite prompt), which writes a caption without the Art Agent. Its notes say a structured rewrite kept an edit to the one change asked for, where prose with "keep X unchanged" invented props. Not needed while FIBO 2.0 takes prose, and it's a second text model ([one Text Model](../../AGENTS.md)).

## Consequences

Ideogram 4 stays in Settings, worth picking only for an Image Prompt written by hand in caption form (mflux takes one in `--prompt` or `--prompt-file`). When Ideogram 4.5's weights are released, look at whether it reads prose; if it needs captions too, this is decided again for it. Other unchecked notes from the thread, now dropped: whether mflux's dropping of empty fields and compacting of a caption is why FIBO 2.0 came out photographic on mflux where ComfyUI painted, and Ming-Image keeping a Subject consistent over many Frames.
