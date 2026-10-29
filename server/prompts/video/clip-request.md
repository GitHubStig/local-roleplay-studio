<!--
The user message for writing a clip's prompt (server/video/clipPrompt.ts): the picture and the
story around it, and the clip asked for.

Values: kind (its name: Lead In, Play out, Idle Loop or Into Next), seconds, picture (the Frame's
Image Prompt), story (what happens in the Frame), before (the Frame before, or "none"), next (for
Into Next, video/clip-next filled in; else empty)
-->

The picture: {{picture}}

What happens in this part of the story:
{{story}}

Just before it:
{{before}}

{{next}}

Write the prompt for a {{seconds}}-second {{kind}} clip.
