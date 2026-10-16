---
status: accepted
---

# Carrying on from a Frame makes a new Session, not a branch

A Storyboard's Frames are planned and then edited, but can't be carried on past the plan. Since 2026-10-16, **Chain from here** on a Storyboard Frame makes a new Chain of the Frames up to that one, to carry on from it by Actions, and leaves the Storyboard as it is (design.md, Storyboards). It settles the "forking from an older Frame" thread that had been open since the Chain's early days.

- **A copy in a new Session.** The Frames up to the chosen one are copied, with the Brief, Settings and seed, so their pictures still match and are copied too (under new names). Each Session stays a single line of Frames, so the Frame engine and ADRs 0001 and 0003 are unchanged.
- **In code, not by the Text Model.** Each Image Prompt becomes a Chain's nine sentences by joining the identities of the people shown into one subject sentence, every word kept, so the copied pictures still show their prompts. A Chain reads those joined identities as its people (`subjectParts`, "Kael, a …; the traveller, a …"), so someone who leaves and comes back is remembered as for any Chain (ADR 0001's amendment).

## Considered Options

- **Branches inside one Session**: the Frames list becomes a tree. Rejected: it changes the data model, the Frames list and storage, and is only worth it if branching were central to play.
- **A Chain carried on from one of its own earlier Frames** (Chain from Chain). Not wanted (the owner, 2026-10-16): a Chain's next Action, or Undo, already changes where it goes.
- **Rewriting the prompts with the Text Model** into a Chain's shape. Rejected: slower, and the copied pictures would no longer match their prompts.

## Consequences

- The Look goes no further than the copied prompts: someone in it but in none of them is unknown to the Chain.
- A copied Frame's Beat becomes its Action, and isn't updated by a Storyboard Action edit, so it may be out of date.
- Tried on the Mac (2026-10-16), with gemma-4 26B heretic (NVFP4): one Action ("They both turn to face the viewer.") on a converted two-person Frame gave nine sentences back, the joined subject copied word for word, only the pose and expression rewritten, in 9.2 s (one seed, text only, not rendered). On the PC the same day, with Gemma 4 12B: a converted Frame's traveller, sent out and back in, was listed as away only while out and came back word for word (three Actions, one seed).
