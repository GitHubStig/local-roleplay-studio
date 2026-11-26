# How a person's hair is worn, in the Look (2026-11-26)

The Princess's Roleplay without sheets drew her hair loose, then pulled back, then in a bun by the fourth Frame (stage 4, [research](../../../../research/people-in-pictures.md#4-the-face-pass-after-each-render-done-2026-11-26)), while the Look's words held a hairstyle in every Frame once they named one. So the open thread: the Look's writer could pick how hair is worn where the Scenario leaves it vague, as it picks clothes. A Text Model prompt, so checked over seeds 1–8 straight to Ollama, for a reply ending in whitespace (AGENTS.md).

This Mac, Ollama, Thinking off: gemma-4-26b-heretic nvfp4 for the tavern, and for the Princess the Text Model her Session was made with (`eriktonon/moonlight-dusk-uncensored:26b`). The Roleplay's Look call as the app builds it (`artLookMessages`, `look.ts`), from the Cast and Opening of two kept Sessions: the public tavern's (`20261125-162450-c37c`), whose Scenario states both people's hair ("short unkempt brown hair", "dark hair pulled back neatly"), and a rebuild of the owner's Princess (`20261126-021922-b141`), whose Scenario gives no Looks for her and none naming hair for anyone; its replies stay out of the repo, only counted here. "How worn" counts an identity whose hair clause names a bun, braid, knot, tie, loose hair and the like.

## What was found

- **The Look named no hair at all, as it was**: in the tavern, 0 of 16 identities, though `shared/identity.md` asks for hair. The Cast sums each person up (Kael's appearance: "A lean, rigid man with weathered, scarred skin and piercing, tired eyes."), dropping what the Scenario says of their hair, and the Look's writer is given only the Cast and the Opening, so it never saw the hair the Scenario states.
- **Asking how the hair is worn, picked where the story doesn't say** (`identity-new.md`): the tavern named hair in 14 of 16, but not as the Scenario states it ("short dark hair"; Elara's in a braid or a knot); the Princess's Character's hairstyle was fixed in 7 of 8, her Persona's in 6 of 8 (0 and 0 before).
- **With the Scenario's Truths and facts given too** (`facts`, as a Storyboard's plan has them, `withNotes`): the tavern kept both people's stated hair word for word, 16 of 16; the Princess's Character 6 of 8, her Persona 4 of 8 (her Scenario gives no Looks for her, so the facts carry nothing of her).
- **Two other wordings with the facts were no better**: "keep what you're given, or pick one where nothing says" made it copy the stated Looks, which name no hair: the Character 0 of 8, the Persona 2 of 8. "Always: …, picked where you're not told": 5 and 4 of 8.
- **No reply ended in whitespace or ran to its cap**, in 96 calls of the Look.

**Built**: the first wording in `shared/identity.md`, and the Roleplay's Look call given the Scenario's Truths and facts (`artLookMessages`). Checked as the app now sends it (`look.ts old` runs the app's own call): the same as `facts`, seed for seed.

## The other calls with the same wording

`shared/identity.md` is also in a Storyboard's plan and the Art Agent's picture call (for newcomers), checked as the app sends them (`calls.ts`), seeds 1–8:

- **The picture call** (the tavern's second Frame): 8 of 8 ended cleanly, ~4 s each; no newcomers.
- **A Storyboard's plan**, four Frames: from the tavern, 8 of 8 clean, both people's stated hair kept word for word (the plan already had the facts); from *Knocking on Heaven's Door*, 8 of 8 clean, but Elias, whom the Scenario leaves vague, had his hair named once in 8, how it's worn never; with the old wording, never (`plan-heavens-door-old-wording.log`). His identity is thin either way, with an expression or clothing in it against `identity.md`'s "no pose, expression or clothing": the plan's own weakness, not this wording's (open threads).

## Not done

- No picture was rendered from it: the Princess's words build (stage 4) had already shown a hairstyle named in the Look holds in every Frame.
- Only on this Mac's two Text Models; the PC's not tried.

## Files

- `look.ts`: the Look's call over seeds, as the app sends it (`old`), with `identity-new.md` in place of `shared/identity.md` (`new`), and with the Scenario's facts too (`facts`); `--hair` prints each one's hair clause. Run before the change, `old` was the call as it was; since, it's the built one.
- `identity-new.md`: the wording tried, then built.
- `calls.ts`: the plan and the picture call, as the app sends them, over seeds.
- `results/`: the tavern's Look under each variant (`tavern.log`), as built (`look-as-built-tavern.log`), the plans and the picture call.
