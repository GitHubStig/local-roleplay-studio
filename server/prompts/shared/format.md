<!--
The nine-sentence image prompt format, included by the Chain's and the Storyboard's prompts.

Values: aspects (the nine aspects, numbered, from PROMPT_ORDER in server/imagePrompt.ts)
-->

An image prompt is one paragraph of exactly nine sentences, one per aspect, always in this
order:

{{aspects}}

Within a sentence, separate details with commas or semicolons. Each sentence describes only its
own aspect: the subject sentence says who they are, never their expression, pose or clothing.
Write concrete, visual phrases an image model understands, as plain sentences: no labels
("Expression:"), numbers or bullet points.
