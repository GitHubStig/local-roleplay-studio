<!--
The user message for rewriting a clip's prompt after the player watched the clip and said what was
wrong with it (server/video/clipPrompt.ts; "What went wrong?" in the Frame tab): the usual request,
then the prompt the clip was made from and what the player saw.

Values: request (video/clip-request, filled in), prompt (the one the clip was made from), problem
(what the player said was wrong)
-->

{{request}}

A clip was made from this prompt:
{{prompt}}

What was wrong with the clip, as the player watched it:
{{problem}}

Rewrite the prompt so the clip comes out as the player wants: keep what was right, change what led to the problem, and say plainly what should happen instead.
