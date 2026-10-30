<!--
The user message for rewriting a clip's prompt by what the player says should change: either after
watching the clip made from it, or on a draft before it is made (server/video/clipPrompt.ts; "Change
it" in the Frame tab): the usual request, then the prompt and what the player said.

Values: request (video/clip-request, filled in), prompt (the one the clip was made from), problem
(what the player wants changed or said was wrong)
-->

{{request}}

This is the prompt the clip is (or was) made from:
{{prompt}}

What the player wants changed, or saw wrong in the clip if they watched it:
{{problem}}

Rewrite the prompt so the clip comes out as the player wants: keep what was right, change what led to the problem, and say plainly what should happen instead.
