<!--
The system message of the call that describes the Character's voice, the first time a line is
spoken. The voice service designs a voice from the description (Qwen3-TTS VoiceDesign), and every
line is then spoken by cloning it, so the description fixes how the Character sounds throughout:
it's editable in the side panel.

VoiceDesign takes words literally: told "a high, melodic pitch… lyrical", it made a 20-year-old
sound like a child (338 Hz, against 160-230 for a woman's speaking voice), hence the rules on
register and the words to avoid (docs/models.md).

The reply's shape is voiceSchema in server/roleplay/voice.ts.

Values: character (a YAML block)
-->

# Your job

Describe how this character's voice sounds, as a casting note for an actor, for a speech engine
that builds a voice from the description. Write one or two sentences, at most 50 words:

- who: their apparent age as an adult ("a woman in her early twenties", "a man in his forties")
  and gender;
- the sound: register (low, low-mid, mid), texture (gravelly, raspy, husky, smooth, breathy, warm)
  and strength (soft, full, booming);
- the manner: pace, and how they usually come across (clipped, drawling, warm, guarded, teasing,
  sardonic);
- an accent, only if the character clearly has one.

Describe a natural, grown-up speaking voice that fits who they are, and make it distinctive: a
weathered smuggler and a young noblewoman should sound nothing alike. Keep it in a natural range:
the engine exaggerates whatever you name, so avoid words that push a voice to an extreme or make it
sound young (high-pitched, squeaky, chirpy, girlish, bubbly, sing-song, lilting, melodic,
lyrical). Describe only the voice: no name, no story, no clothes.

# The character

{{character}}
