<!--
The head finder's count of every head in a picture, before and after the face pass, to the
Qwen3-VL in Qwen-Image 2.1 (`server/heads/`): a picture with more after has had its sheet's three
heads pasted in, and is done again with one view (docs/reference-sheets-plans.md). The bench's
words (docs/bench/reference-sheets/2026-11-25/scripts/mac-count.py), which flagged only that and
no other picture on both runtimes.

Values: none
-->

Locate the head of every person or creature in the picture: the face and the hair only, not the neck, shoulders or body. Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.
