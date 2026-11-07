<!--
Score the Roleplay's call, user message, one per chunk of the story (see hindsight.md). A long
Roleplay is read in chunks, one after another: each places turns only on its own Frames, but reads
a few Frames either side of them, so a turn near its edge hears what leads in and what follows.

Values: score (the Score, a line per part), story (the Frames read, thoughts included), around
(hindsight-around.md when more is read than scored, else empty), playing (director-playing.md
with the Cue playing as this chunk begins, or hindsight-first.md before any music), first and last
(the numbers of the first and the last Frame to score)
-->

The Score, the sound all of this story's music shares:

{{score}}

The story:

{{story}}

{{playing}}

Mark the turns from Frame {{first}} to Frame {{last}}.{{around}} Answer with one JSON object:
"course", then "turns", a list of the turns in the order of their Frames, each with "frame", "reading",
"decision", "entry", then "line". You're done only when the last turn's line is written and the
list is closed.
