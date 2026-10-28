<!--
The image prompt's nine aspects and how each sentence is written, included by the Chain's and the
Storyboard's prompts. How many sentences a prompt has is said by each: nine in a Chain; in a
Storyboard, the Look's identities, the Frame's seven, then the style.

Values: aspects (the nine aspects, numbered, from PROMPT_ORDER in server/imagePrompt.ts)
-->

An image prompt is one paragraph covering nine aspects, always in this order, each in sentences of
its own:

{{aspects}}

Within a sentence, separate details with commas or semicolons. Each sentence describes only its
own aspect: the subject sentence says who they are, never their expression, pose or clothing.
Write concrete, visual phrases an image model understands, as plain sentences: no labels
("Expression:"), numbers or bullet points.
