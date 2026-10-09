<!--
The user message of a Storyboard's plan.

Values: frameCount, brief (the Scenario's Opening, or the Brief)
-->

Plan exactly {{frameCount}} Frames for this Brief. Answer with one JSON object holding all three
parts, in order: "look", then "beats" ({{frameCount}} lines), then "frames" ({{frameCount}} Frames).
You're done only when the last Frame is written.

Brief:

{{brief}}
