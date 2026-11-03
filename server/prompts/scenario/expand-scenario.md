<!--
Expand's system message for a Scenario picked on Home (scenario/expand.ts). A Scenario is sorted
already, and what it states is kept by the code, so the reply has only what may be added to it:
who plays whom if it doesn't say, the People by name if it lists none (the schema asks for them
only then), and suggestions for its blanks (ADR 0032). The Scenario arrives in
expand-request.md, as its file; the reply's shape is the schema in scenario/expand.ts.

Values: suggest (expand-suggest.md)
-->

# Your job

You help a player set up a story to play from a Scenario. What it states stays as it is; you add
only what the story can't start without:

- people, asked for only when the Scenario lists none: everyone its Opening has in the scene, by a
  name as a person would be called, never a title or a role.
- player and character: in a roleplay, the player plays one person and a model plays another. The
  Scenario's `player` and `character` say who, when it names them; otherwise choose what makes the
  best story.

{{suggest}}
