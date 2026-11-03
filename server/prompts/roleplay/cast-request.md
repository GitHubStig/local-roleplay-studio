<!--
The Cast call's user message: the Brief to write the Cast from. For a Scenario, the Brief is its
Opening and the facts are the rest it states (factsOf, who plays whom too) but its Truths; for a
typed Brief there are no facts.

Naming the reply's parts in order, and saying it's done only after the setting, keeps Gemma 4 26B
from closing the object after "persona" and padding with whitespace until its cap, which the
schema's required "setting" forces otherwise (11 seeds in 32 on a Scenario with long People; 1 in
32 since, 2026-11-03; the same trap as Expand's, expand-request.md).

Values: brief, facts (a YAML block, or "none")
-->

Set up a roleplay from this Brief.

Brief:

{{brief}}

Facts:

{{facts}}

Answer with one JSON object: "character", "persona", then "setting". You're done only when the setting is written.
