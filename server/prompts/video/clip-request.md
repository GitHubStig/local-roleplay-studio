<!--
The user message for writing a clip's prompt (server/video/clipPrompt.ts): the picture and the
story around it, and the clip asked for.

Values: kind (its name: Lead In, Play out, Idle Loop or Into Next), seconds, picture (the Frame's
Image Prompt), story (the Frame's story, as video/clip-story or, for Play out and Into Next,
video/clip-story-done has it), before (the Frame before, or "none"), after (for Into Next,
video/clip-next; else empty)
-->

The picture: {{picture}}

{{story}}

Just before it:
{{before}}

{{after}}

Write the prompt for a {{seconds}}-second {{kind}} clip.
