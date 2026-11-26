# The name in front of each identity (2026-11-26)

A Roleplay played on `eriktonon/moonlight-dusk-uncensored:26b` had Image Prompts starting "a man of disciplined build in a crisp Imperial uniform. a 19-year-old woman…": its Look's identities had no names. The Image Prompt pastes each shown Subject's identity in as written (`composePrompt`), and `shared/identity.md` asked the model to start it with the name, though the Look's reply already gives the name in a field of its own, just before.

This Mac, Ollama, Thinking off, the app's own calls (`artLookMessages`, and `calls.ts` from the [hair bench](../reference-sheets/2026-11-26/hair/README.md) for the plan and the picture call). The private Roleplay's replies stay out of the repo: counts only.

## What was found

- **With the old wording, moonlight-dusk never wrote the name**: 0 of 24 identities over seeds 1–8 on the private Roleplay (three people), and 2 of 16 in the Looks of six Sessions it had written. Qwen3.8 27B (`orcarouter/Qwen3.8-27B-Uncensored:mlx-4bit`) wrote it 42 times in 42 on the same Roleplay and the tavern's; Gemma 4 26B heretic in every Look it had written on disk.
- **So the name moved out of the model's job**: `shared/identity.md` asks for the identity without the name, the Look's example drops it, and `namedIdentity` (`server/identity.ts`) puts it in front for the Image Prompt, a Chain's subject sentence, a sheet's prompt and the head finder. A name written in anyway, by a model or by hand, is taken off as the Look is read (`withoutName`, in `parseLook`, `cleanLook` and Change…).
- **With the new wording** (`look.ts`, `run.sh`): no model wrote the name, 0 of 160 identities (Gemma and moonlight-dusk, the private Roleplay's Look and the tavern's, seeds 1–8 each), and every identity came out named in the prompt. A Storyboard's plan of the tavern (Gemma, 4 Frames) left it out too. None of the 48 calls ended in whitespace or ran to its cap (`results/`).
- **Moonlight-dusk also writes clothing into an identity** on about half its seeds, against the wording's "no … clothing": not addressed.

The 11 Sessions on this Mac whose identities started with the name (33 identities, sheets included) were rewritten once by a script, not by a migration (the owner's call): only those lines changed. The PC's Sessions weren't.

## Files

- `look.ts`: the Roleplay's Look call over seeds, counting identities that still start with the name and those named in the prompt.
- `run.sh`: the runs, in order, each to `results/`.
