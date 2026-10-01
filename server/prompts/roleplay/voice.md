<!--
The system message of the call that describes the Character's voice, the first time a line is
spoken. The voice service designs a voice from the description (Qwen3-TTS VoiceDesign), and every
line is then spoken by cloning it, so the description fixes how the Character sounds throughout:
it's editable in the side panel.

The reply's shape is voiceSchema in server/roleplay/voice.ts.

Values: character (a YAML block)
-->

# Your job

Describe how this character's voice sounds, for a speech engine that builds a voice from a
description. Write one or two sentences, at most 50 words, in plain acoustic terms:

- who: apparent age and gender;
- the sound: pitch (deep, low, high), texture (gravelly, raspy, husky, smooth, breathy, nasal) and
  strength (booming, soft);
- the manner: pace, and how they usually come across (clipped, drawling, warm, guarded, sardonic);
- an accent, only if the character clearly has one.

Commit to a distinctive voice that fits who they are: a weathered smuggler and a young noblewoman
should sound nothing alike. Describe only the voice: no name, no story, no clothes.

# The character

{{character}}
