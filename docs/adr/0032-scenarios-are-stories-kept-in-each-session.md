---
status: proposed
---

# Scenarios are stories, kept in each Session

A Scenario was a saved Brief, made for Chains before Roleplays existed: free-form Setup facts, `## System` notes for Image Prompts (which a Roleplay leaves out), and an `## Opening`. A Roleplay's Cast call guessed from it who the player is, so the roles couldn't be swapped, and a Session found its Scenario by file name, so editing or deleting the file changed or broke the Sessions made from it. Decided 2026-11-02, to be built in pieces:

- **What a Scenario states holds; what it leaves out is the Text Model's.** Only the Opening is required. The pass inside each Session (a Roleplay's Cast, a Look) keeps what's stated and invents the rest, so a Scenario can be one paragraph, and a better model has room to play. Left without a Style, the Look picks one. The same Scenario and seed give the same Session (ADR 0011).
- **It holds People, Truths, a Place, a Style and the Opening**, each section saying what it's for. A Person is anyone the story treats as someone (a human, an alien, a monster, a talking car), with a stable id beside the name, and `looks` (permanent features, in no art style, like a Look's identity) apart from `wears` (what they have on at the start). A Truth holds whatever anyone does: about one Person ("Kael is stronger; he can only be overpowered by surprise"), travelling with them whichever side they're played on, or about the story ("there's no magic"). Truths are optional, and unlike a goal, nobody is meant to change them in play; they stay editable mid-Roleplay like what steers the Character.
- **A Roleplay stays one-on-one.** The Scenario names who the player plays and who the Text Model plays by default; the player can pick others. The rest of the People are known to the Character and in the Look, and may act and speak briefly in its `actions`: text, never voiced, no thoughts, and never the Persona.
- **Each Session keeps its own copy** of the Scenario in `session.json` (`scenario`, with `scenarioId` as where it came from), so a shared Session works without the file, and an edited Scenario leaves its Sessions alone. `session.json`, Scenario files and anything saved later carry a `version`, added once this work settles rather than bumped along the way; an upgrader comes with the first version 2. The Sessions from before are upgraded by hand.
- **The shape is a TypeScript type first**; a Scenario is saved as Markdown with fixed headings, as it reads well and imports easily. The examples move to `example-scenarios/` (in the repo, read-only in the app; editing one saves a copy); the player's own go in `scenarios/`, gitignored.
- **A Session starts from the Scenario page.** A Scenario picked on Home, or a typed Brief, opens it: Expand (always run, and sparse: it names the People, who's who and the Opening, and suggests what's blank without filling it), hand edits, and later a chat. Then a Roleplay goes on to its Cast review as before. Chains and Storyboards get the new shape turned into what they read now, so their engines don't change at first.
- **The chat replies with edits, not the whole Scenario**: each a field named from the type and its new text, with a note and suggestions for blanks. Each call sends the Scenario as it stands, once, last; never its old versions. Each section's rules are a prompt file of their own, put together into the chat's system message.

## Considered Options

- **Folding an old Scenario into a Session's `brief`.** Loses its title, its notes on every Chain and Storyboard call, and its Setup as separate facts.
- **The whole Scenario as the chat's reply.** Slow for a few thousand tokens, and invites changes nobody asked for, as a Chain's copied sentences do.
- **A prompt enhancer per section, alone.** Can't make changes that cross sections ("swap Kael and Elara", "set it in space").
- **Several Characters, each voiced.** Changes the Reply, the voices and Suggest (ADR 0007), and needs its own bench; later, if at all.
- **A reminder of the Truths beside each Message.** Tried on the bench (2026-11-02): it didn't help, nor did five other wordings or Thinking; see below.
- **Skipping the Cast review once the Scenario page exists.** The player would meet the fleshed-out Cast only after the opening Reply.

## Consequences

- Built in pieces: the copy in `session.json` and the folders first, on main; the format, the Scenario page and the Roleplay's use of it on a branch, with Truths and others speaking checked by a replay of a pushy player before it merges; the chat after.
- A future Library of People and Places shares the Person and Place shape; importing one into a Scenario copies it, noting where from.

## A judge holds the Truths (2026-11-02)

On the bench ([docs/bench/truths](../bench/truths/README.md), Mac, Gemma 4 26B), a Truth in the Character's system message didn't stop a pushy player: whatever a Message said happened, happened, however the Truths were worded ("immutable laws" and NEVER lists too) and with Thinking on. What worked was deciding the outcome first. When the Cast has Truths, a short judge call on the same Text Model (`roleplay/judge.ts`) reads the Truths, the Character's latest Reply and the Message, and says whether it breaks one and what happens instead; the Character gets that after the Message, as what actually happens, and the Frame keeps it (`outcome`). About a second per Message; a workaround for the model, to be checked again when the Text Model changes.

Considered: a classifier model as the judge, faster still, but a second model to keep loaded beside the Text Model (one Text Model for every text job, AGENTS.md); tried if the Text Model judges badly.

