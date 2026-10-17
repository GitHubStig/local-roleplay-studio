---
status: accepted
---

# A Storyboard is planned, reviewed, then written a Frame at a time

A Storyboard's plan cast its Brief badly at times: someone the Brief has missing from the Look, or there with no name, only "demon". Fixing it by hand afterwards didn't reach the Frames: their sentences kept the old name, or left the newcomer out, and the Image Model was left to guess. Since 2026-10-17 a Storyboard is made in three steps (design.md, Storyboards), replacing the one call of [ADR 0006](0006-storyboards-plan-in-one-call.md):

1. **Plan**: one call writes the Look and the Beats, each Beat with who it shows.
2. **Review**: the player edits the Look (names, identities, the style) and each Beat's line and who it shows. Nothing is written out yet, so whatever is fixed here reaches every Frame.
3. **Write Frames**: a Text Model call per Frame, in order, each given the Look, every Beat with who it shows, the Brief and the seven sentences of the Frames before it. Each Frame is saved as it comes.

Once a Frame is written the Look and Beats are **fixed**: an Action edits only its own Frame, from the Look as it is, and one that would change the Look comes back unclear. **Restart** is the way back to the plan, deleting every Frame's sentences and pictures. This closes the open threads "A rename that carries into the text" and "Adding someone to several Frames at once": a name is settled before any sentence uses it, and who's in each Frame is chosen on its Beat.

The plan's casting wording changed with it: everyone and everything the story follows goes in the Look (people, creatures, animals, and objects with a part of their own: a horse, a car, a ship), each with a name, made up when the Brief has none and then what the Brief calls them ("Silas, the hooded stranger"); a group that acts together and looks alike is one entry ("the two city guards"); and each identity has the features of its kind (`shared/identity.md`).

## What was measured

On the Mac, 2026-10-16, with Gemma 4 26B Heretic (nvfp4, Ollama's MLX engine, Thinking off), text only; benches run from scratch folders and not kept.

- **A call per Frame, not one.** One 8- and one 32-Frame tavern plan written both ways. One call took 20–25 s for 8 Frames and 74 s for 32; a call per Frame, with the Frames before it, 24–27 s and 111 s (1.2× and 1.5×). One call of 32 Frames slipped out of step with its Beats from Frame 19 on, two Frames behind, so their people were no longer who each Frame shows, and grew a third terser by its last quarter (76 to 49 words a Frame); the plan call that had written it had slipped about one Frame by its end too. A call per Frame can't slip, and kept 100–113 words throughout. Continuity looking back was the same either way (clothing carried word for word as often). Seeing the Beats ahead made no difference: two late payoffs (a pistol hidden under the bar, a letter left on it) were set up in no earlier Frame, given every Beat or only those so far.
- **Ollama's MLX engine doesn't reuse a shared start of the prompt**: the same 2,075-token prompt read in 1.27 s, then 0.03 s sent again, but 1.04 s with five tokens more on the end. Reading is fast enough (about 2,000 tokens a second) that the growing prompt added half a second a call by Frame 32. So each call is sent whole (the Frames before it in its one user message), which also lets a Write that stopped carry on later.
- **No Beats in an edit.** 72 Action edits of two Frames (vague Actions, Actions leaning on the story, a control) sent with every Beat, only the Frame's own, or none: all done, none unclear, alike each way; the other Beats didn't help continuity ("bring back the letter" gave it to the wrong person with them or without).
- **Casting.** Plans of five Briefs with unnamed people, a demon, a dog and two vehicles. With the old wording, 7 of 14 unnamed people were named, a demon in the Beats was left out of the Look by three of four set-ups on one seed, two guards were cast as two people, and the dog was the only non-human cast. With the new: 10 of 14 named, the demon cast every time, the guards one entry, the dog, the roadster and the truck all cast, each described as what it is. "The traveller" and "the demon" stayed unnamed, even with a sentence saying that's not a name: the review is where they get one. Thinking didn't help the casting (8 of 14 with it, 5 of 14 on Gemma 4 12B nvfp4) at 5–8× the time, so it's not used for it.

## Considered Options

- **One call for the plan and every Frame** (ADR 0006). Replaced: a name fixed after it doesn't reach the sentences, and at 32 Frames it slips and shortens.
- **Find and replace a rename in every Frame's sentences**, and **"Add to Frames…"**, a Text Model rewrite of each Frame someone is added to. Not needed once the plan is reviewed before anything is written; a name that's also a word ("Rose") made the first risky.
- **Editing the Look after Write.** Not allowed: it would bring back both problems. Restart is the way, at the cost of the pictures.
- **Thinking for the plan.** No better casting, and minutes a plan.

## Consequences

- A Storyboard has a stage the player must act on: nothing is written until **Write Frames**.
- A Write that fails or is cancelled keeps the Frames written so far (not all or nothing, unlike the plan); writing again carries on.
- The Look can't change after Write, so a Look saved never has to wait for a render.
- A Frame's Beat is the plan's line, not updated by an Action edit; Chain from here still uses it as the copied Frame's Action (ADR 0018).
- `shared/identity.md` is the Roleplay Art Agent's too: its features by kind reach a Roleplay's Look, not yet checked there.
- Run through the engine on the Mac (2026-10-17, the same model, text only, 6 Frames each of the tavern and a knight-and-demon Brief): plans in 6–8 s, each Frame written in 3.3–4.8 s. Next to a short Beat, the model first wrote each person's whole identity into "shown" ("Kael, the 42-year-old…"), so no one matched and every Beat showed no one; the plan prompt now says a "shown" entry is only a name, and a name followed by more text matches by its words (`matchShown`). An Action asking to change the Look ("Make the traveller a tall bearded man instead") still came back done, not unclear, rewriting that Frame's sentences around a man the Look doesn't have; the Look itself can't change, so it stays within that Frame.
- Not run on the PC.
