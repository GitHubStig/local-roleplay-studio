# Writing a Scenario

A **Scenario** is a story a Session starts from, in one Markdown file: who's in it, where and when, how it looks, what holds whatever happens, and how it opens. Your own go in `scenarios/` (gitignored); the examples are in `example-scenarios/`, and one of yours with the same file name stands in for an example. The file name, minus `.md`, is its id (`tavern.md` → `tavern`). Files are read fresh on every request, so a new or edited Scenario shows up on Home, under *New Session*, without a restart. A Session keeps its own copy of the Scenario it started from, so editing or deleting the file later leaves it alone.

**Say what matters, and leave the rest out.** Only the title, the description and the Opening are needed. Whatever a Scenario states holds; whatever it leaves out is the Text Model's to invent, so a short Scenario leaves a model room to play, and the same Scenario and seed give the same Session ([ADR 0032](adr/0032-scenarios-are-stories-kept-in-each-session.md)).

[`example-scenarios/tavern.md`](../example-scenarios/tavern.md) is written for a Roleplay (you play Elara, the Text Model plays Kael), and [`example-scenarios/contact.md`](../example-scenarios/contact.md) for a Storyboard of five people. Either can start any kind of Session.

## Layout

```markdown
---
title: The Rain-Soaked Tavern
description: One or two sentences for its card on Home.
player: Elara
character: Kael
---

## Opening

Late on a stormy night, Kael is alone behind the bar…

## Place

A small, creaking 18th-century tavern…

## Time

Late evening, in a storm.

## Style

A moody, cinematic oil painting…

## Truths

- It's the 18th century: nothing modern.

## People

### Kael

- Looks: a 42-year-old man, lean and rigid…
- Wears: a stained leather apron over a linen shirt.
- Personality: dry and wry.
- Speaks: in short sentences.
- Background: a retired smuggler who runs the tavern.
- Goal: find out who sent the letter.
- Truths:
  - Kael is far stronger than Elara; she can't overpower him unless she catches him off guard.

### Elara

- Looks: a slender young woman…
```

Write each paragraph or line on one line, and put a blank line between paragraphs. A description with a colon in it needs YAML's `>-` on the line before it.

## What each part is for

| Part | What it is |
|---|---|
| `title`, `description` | Its card on Home |
| `player`, `character` | In a Roleplay, who you play and who the Text Model plays, by name |
| Opening | The situation when the story starts: who is where, doing what. Not a plot to follow, and not a picture |
| Place | Where it starts |
| Time | The time of day, and the weather |
| Style | The art style every picture is made in. Leave it out, and the Text Model picks one for the story |
| Truths | What holds in the story whatever anyone does or says: "there's no magic", "the enemy is never seen" |
| People | Anyone the story treats as someone (a human, an alien, a monster, a talking car), a `###` heading each, by name |

A Person's lines, each optional:

| Line | What it is |
|---|---|
| Looks | What doesn't change: age, build, skin, hair, face. No clothing, and no art style ("in heavy brushstrokes"): the Style says that |
| Wears | What they have on at the start |
| Personality | How they are |
| Speaks | Their way of speaking |
| Background | Who they are, and their past |
| Goal | What they want in this story, and what drives them |
| Truths | What holds about them, whoever plays them: who is stronger, what they'll never do |

A Truth isn't a goal: a goal can change or fail in play, and a Truth shouldn't.

## How each kind of Session uses it

- **A Roleplay** writes its Cast from the Opening, with who plays whom and what else the Scenario states but its Truths; the Cast fills in what's left out, and you review it before the scene begins.
- **A Chain** gets the Truths on every Frame, and the rest on its Opening Frame only; after that, any of it can be changed by an Action.
- **A Storyboard** gets the Opening as the story to tell, and the Truths and the rest when it plans and writes its Frames.

In every kind, the engine's three Limits hold whatever a Scenario says ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

## Checking a Scenario

Open Home. A file that can't be read is listed under *New Session* with every problem found (a missing title, description or Opening; a section, frontmatter field or Person's line it doesn't know; two People with the same name; a `player` or `character` who isn't one of the People). A valid file appears as a card.
