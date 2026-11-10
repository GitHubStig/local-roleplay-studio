<!--
The Music Director's call, user message (see director.md).

Values: score (the Score, a line per part), story (every exchange up to this Frame, thoughts
included), playing (director-playing.md, or director-first.md before any music), frame (this
Frame's name)
-->

The Score, the sound all of this story's music shares:

{{score}}

The story so far:

{{story}}

{{playing}}

Direct the music at {{frame}}, the latest exchange. Answer with one JSON object: "reading",
"decision", "entry", then "line". You're done only when the line is written.
