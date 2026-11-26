<!--
Looking over a reference sheet before the face pass uses it (`lookOver`, `server/heads/heads.ts`),
to the Qwen3-VL in Qwen-Image 2.1: whether its Subject has a head (a person or creature) or not (a
thing), as only a head's turns are checked. On the bench's 42 sheets it counted three heads on
every person's and none on every lantern's (docs/bench/reference-sheets/2026-11-26/check/). Stage
0's words, from when it counted heads before and after the face pass.

Values: none
-->

Locate the head of every person or creature in the picture: the face and the hair only, not the neck, shoulders or body. Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.
