<!--
Expand's user message (scenario/expand.ts): the Scenario as its Markdown file, or the typed Brief,
and what the reply holds, in order. Saying the reply is done only after the suggestions keeps
Gemma 4 26B from taking it as done after "character" and padding with whitespace until its cap,
which the schema's required "suggestions" forces otherwise (2 seeds in 8 on the tavern, 2026-11-03;
the Storyboard plan's trap, research/people-in-pictures.md).

Values: what ("Scenario" or "Brief"), text, parts (the reply's parts before "suggestions")
-->

Here is the {{what}}.

{{text}}

Answer with one JSON object: {{parts}}, then "suggestions". You're done only when the suggestions are written.
