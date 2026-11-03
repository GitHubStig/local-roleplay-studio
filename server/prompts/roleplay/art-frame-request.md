<!--
The Art Agent's picture call, user message: the Look, the story up to and including the Frame to
picture, and which Frame that is. The story leaves out the Character's thoughts: a picture can't
show them.

Values: look (a YAML block), story (the exchanges, as text), worn (what each person wore when
last pictured: the clothing sentence of the latest earlier picture showing them, a line per
picture; for a Person of the Scenario not pictured yet, their Wears, "At the start"), frame (the
Frame's number, from 1, as the story numbers it)

Naming the reply's parts in order, and saying it's done only after "shown", keeps Gemma 4 26B
from closing the object after "color" and padding with whitespace until its cap, which the
schema's required "newcomers" and "shown" force otherwise (AGENTS.md; research/text-models.md).
-->

Look:

{{look}}

The story so far:

{{story}}

What each person wore when last pictured, or at the start:

{{worn}}

Picture Frame {{frame}}. Answer with one JSON object: its seven sentences, "pose" to "color", then "newcomers" and "shown". You're done only when "shown" is written.
