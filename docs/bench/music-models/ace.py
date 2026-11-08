# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = []
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Renders the music bench's cases with ACE-Step 1.5 through a running ComfyUI (ComfyUI's own
"ACE-Step 1.5 split" template: the 2B turbo, the 0.6B and 1.7B text encoders, 8 steps), timing
each and noting how much more of the machine's memory was in use at the most. See README.md.

    uv run ace.py                       # every case, seed 1, on 127.0.0.1:8188
    uv run ace.py tavern-60 song-150    # only these
    DIT=acestep_v1.5_xl_turbo_bf16 uv run ace.py tavern-60
    COMFYUI=http://192.168.50.85:8188 SEED=2 uv run ace.py

The captions are written as ACE-Step's guide asks (docs/en/Tutorial.md in its repo): prose on the
style, emotion, instruments, timbre and production, with the tempo, key and length left out of
them and set as their own inputs; an instrumental's lyrics are structure tags that agree with the
caption. Output goes to out/ace-step-1.5-turbo/, results to results.jsonl.
"""
import json, os, sys, threading, time, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
COMFYUI = os.environ.get('COMFYUI', 'http://127.0.0.1:8188').rstrip('/')
SEED = int(os.environ.get('SEED', '1'))
# The DiT and the planner (the LM that writes audio codes first): the 2B turbo with the 1.7B by default;
# DIT=acestep_v1.5_xl_turbo_bf16 for the 4B XL turbo, LM=qwen_4b_ace15 for the 4B planner its template uses.
DIT = os.environ.get('DIT', 'acestep_v1.5_turbo')
LM = os.environ.get('LM', 'qwen_1.7b_ace15')
NAMES = {'acestep_v1.5_turbo': 'turbo', 'acestep_v1.5_xl_turbo_bf16': 'xl-turbo'}
MODEL = f"ace-step-1.5-{NAMES.get(DIT, DIT)}" + ('' if LM == 'qwen_1.7b_ace15' else f"-{LM.split('_')[1]}-lm")

TAVERN = ('Intimate acoustic folk from an 18th-century harbour tavern on a rainy night. A lone fiddle '
          'plays a slow, weary melody over a low cello and a soft, breathing squeezebox. Guarded warmth, '
          'smoky and close, like two strangers testing each other by the fire. Sparse and restrained, '
          'a live, roomy recording with natural reverb, warm and woody. No drums, no vocals.')
TAVERN_LYRICS = """[Intro - solo fiddle]

[Main Theme - fiddle and cello]

[Interlude - squeezebox, soft]

[Main Theme - fiddle, cello and squeezebox]

[Outro - fiddle alone, fading]"""
TENSE = ('Dark acoustic folk from an 18th-century harbour tavern. A low cello pulses under a lone fiddle '
         'playing short, uneasy phrases, with a muffled frame drum like a slow heartbeat. Creeping menace '
         'under a calm surface, a friendly face hiding a knife. Building tension, layered, tight and dry, '
         'close-miked and raw. No vocals.')
TENSE_LYRICS = """[Intro - cello pulse, frame drum]

[Verse - uneasy fiddle phrases]

[Build - layers thicken, tension rises]

[Outro - cut to a held low note]"""
HEAVEN = ('Sacred ambient choral music at the gates of heaven. A choir sings without words, long and '
          'soft, over a pipe organ held low, slow harp arpeggios and warm, soft strings. Vast awe with '
          'warmth under the solemnity, rising slowly like light through clouds. Airy, lush and spacious, '
          'cathedral reverb, no drums, no electronic sounds.')
HEAVEN_LYRICS = """[Intro - low organ, harp]

[Choir - wordless, soft]

[Swell - strings and choir rising]

[Outro - choir fades into organ]"""
BUFFET = ('Gentle cinematic underscore for the last scene of a film. A soft solo piano plays a simple, '
          'bittersweet melody, warm strings swell beneath it, and a far-off acoustic guitar answers. '
          'Regret slowly giving way to peace and acceptance. Unhurried, intimate and warm, a polished '
          'studio recording with a soft, airy room. No drums, no vocals.')
BUFFET_LYRICS = """[Intro - solo piano]

[Main Theme - piano and strings]

[Bridge - acoustic guitar answers]

[Outro - piano alone, fading]"""
SONG = ('A tender folk ballad sung by a weathered, gravelly male voice, close and unhurried, telling the '
        'story of a father who finds his long-lost daughter in a harbour tavern. Fiddle, cello and '
        'squeezebox, an acoustic guitar picked softly. Bittersweet and warm, building gently into each '
        'chorus. A live, roomy recording, warm and woody.')
SONG_LYRICS = """[Intro - fiddle]

[Verse]
The rain hadn't stopped in three days
When a stranger came in from the quay
She said you are late, by twenty years
And set her mother's ring by me

[Chorus]
Sit down, if you're staying
The fire's low but it's warm
Sit down, if you're staying
We'll wait out the storm

[Verse]
I knew the scar above her eye
I'd sworn I'd never see again
Your daughter, she said, and the room went still
As the tide came in

[Chorus]
Sit down, if you're staying
The fire's low but it's warm
Sit down, if you're staying
We'll wait out the storm

[Outro - fiddle, fading]"""

# Second tries, after the owner's listen (2026-11-08): the tense Cue wasn't tense (its caption spoke
# of a "calm surface" and a "friendly face", the scene's subtext, which the model heard as calm), and
# Heaven climbed into high, busy organ after 20 s ("rising slowly like light through clouds", and a
# "rising" section). These say only what should be heard, and what it should stay.
TENSE_2 = ('Dark, suspenseful acoustic folk score for a scene where danger is close. A low cello drone '
           'holds one ominous note, a lone fiddle plays sparse, uneasy, dissonant phrases, and a muffled '
           'frame drum beats slowly like a heartbeat. Ominous, tense, threatening, full of dread, steadily '
           'tightening. Dry, close and raw. No melody that resolves, no vocals.')
TENSE_2_LYRICS = """[Intro - low cello drone, heartbeat drum]

[Verse - sparse dissonant fiddle, ominous]

[Build - tension tightens, drum louder]

[Outro - drone holds, unresolved]"""
HEAVEN_2 = ('Sacred, somber ambient choral music, still and reverent. A choir sings without words, low and '
            'soft, over a pipe organ that holds long, low chords and changes them rarely, with slow, gentle '
            'harp and warm, low strings. Solemn awe with quiet warmth, calm and unchanging, staying low and '
            'soft throughout. Cathedral reverb, no high organ notes, no drums, no electronic sounds.')
HEAVEN_2_LYRICS = """[Intro - low organ, harp]

[Choir - wordless, low and soft]

[Main Theme - choir and low organ, still]

[Outro - choir fades into organ]"""

# Third try at Heaven, after the second was "just bad" (the choir gone): the first caption, which
# the owner liked for its first 20 s, with only what pushed it upward taken out ("rising slowly like
# light through clouds", the "rising" section), and no negations added.
HEAVEN_3 = HEAVEN.replace(', rising slowly like light through clouds', '')
HEAVEN_3_LYRICS = HEAVEN_LYRICS.replace('[Swell - strings and choir rising]', '[Main Theme - choir, organ and strings]')
assert HEAVEN_3 != HEAVEN and HEAVEN_3_LYRICS != HEAVEN_LYRICS

# Fourth, from what the owner asked for after the third ("more low choir singing in the background"):
# the third, the choir made low, soft and constant beneath the rest.
HEAVEN_4 = ('Sacred ambient choral music at the gates of heaven. A low, soft choir sings without words in '
            'the background throughout, a deep, warm hum beneath everything, over a pipe organ held low, '
            'slow harp arpeggios and warm, soft strings. Vast awe with warmth under the solemnity, calm and '
            'reverent. Airy, lush and spacious, cathedral reverb.')
HEAVEN_4_LYRICS = """[Intro - low choir hum, low organ]

[Main Theme - low choir in the background, harp and strings]

[Interlude - low choir and organ]

[Outro - low choir fades]"""

# name → (caption, lyrics, seconds, bpm, key)
CASES = {
    'tavern-60': (TAVERN, TAVERN_LYRICS, 60, 70, 'A minor'),
    'tavern-180': (TAVERN, TAVERN_LYRICS, 180, 70, 'A minor'),
    'tavern-tense-60': (TENSE, TENSE_LYRICS, 60, 96, 'D minor'),
    'heaven-60': (HEAVEN, HEAVEN_LYRICS, 60, 60, 'D major'),
    'buffet-60': (BUFFET, BUFFET_LYRICS, 60, 66, 'F major'),
    'key-d': (TAVERN, TAVERN_LYRICS, 60, 70, 'D minor'),
    'key-a': (TAVERN, TAVERN_LYRICS, 60, 70, 'A major'),
    'song-150': (SONG, SONG_LYRICS, 150, 72, 'G major'),
    'tavern-tense-2-60': (TENSE_2, TENSE_2_LYRICS, 60, 80, 'D minor'),
    'heaven-2-60': (HEAVEN_2, HEAVEN_2_LYRICS, 60, 60, 'D major'),
    'heaven-3-60': (HEAVEN_3, HEAVEN_3_LYRICS, 60, 60, 'D major'),
    'heaven-4-60': (HEAVEN_4, HEAVEN_4_LYRICS, 60, 60, 'D major'),
}


def workflow(caption, lyrics, seconds, bpm, key, prefix):
    """ComfyUI's ACE-Step 1.5 split template, in API format, its values from the template."""
    return {
        'unet': {'class_type': 'UNETLoader',
                 'inputs': {'unet_name': f'{DIT}.safetensors', 'weight_dtype': 'default'}},
        'clip': {'class_type': 'DualCLIPLoader',
                 'inputs': {'clip_name1': 'qwen_0.6b_ace15.safetensors',
                            'clip_name2': f'{LM}.safetensors', 'type': 'ace', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ace_1.5_vae.safetensors'}},
        'shift': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['unet', 0], 'shift': 3}},
        'text': {'class_type': 'TextEncodeAceStepAudio1.5',
                 'inputs': {'clip': ['clip', 0], 'tags': caption, 'lyrics': lyrics, 'seed': SEED, 'bpm': bpm,
                            'duration': seconds, 'timesignature': '4', 'language': 'en', 'keyscale': key,
                            'generate_audio_codes': True, 'cfg_scale': 2.0, 'temperature': 0.85,
                            'top_p': 0.9, 'top_k': 0, 'min_p': 0.0}},
        'negative': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['text', 0]}},
        'latent': {'class_type': 'EmptyAceStep1.5LatentAudio', 'inputs': {'seconds': seconds, 'batch_size': 1}},
        'sample': {'class_type': 'KSampler',
                   'inputs': {'model': ['shift', 0], 'seed': SEED, 'steps': 8, 'cfg': 1.0, 'sampler_name': 'euler',
                              'scheduler': 'simple', 'positive': ['text', 0], 'negative': ['negative', 0],
                              'latent_image': ['latent', 0], 'denoise': 1.0}},
        'decode': {'class_type': 'VAEDecodeAudio', 'inputs': {'samples': ['sample', 0], 'vae': ['vae', 0]}},
        'save': {'class_type': 'SaveAudio', 'inputs': {'audio': ['decode', 0], 'filename_prefix': prefix}},
    }


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(COMFYUI + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as res:
        return res.read()


def ram_free():
    return json.loads(call('/system_stats'))['system']['ram_free']


def render(name):
    caption, lyrics, seconds, bpm, key = CASES[name]
    total = json.loads(call('/system_stats'))['system']['ram_total']
    before = total - ram_free()
    most = [before]
    done = threading.Event()

    def watch():
        while not done.wait(2):
            most[0] = max(most[0], total - ram_free())

    threading.Thread(target=watch, daemon=True).start()
    start = time.perf_counter()
    prompt = json.loads(call('/prompt', {'prompt': workflow(caption, lyrics, seconds, bpm, key, f'bench/{name}')}))
    pid = prompt['prompt_id']
    while True:
        history = json.loads(call(f'/history/{pid}')).get(pid)
        if history and history.get('status', {}).get('completed') is not None:
            break
        time.sleep(1)
    took = time.perf_counter() - start
    done.set()
    if history['status'].get('status_str') != 'success':
        raise RuntimeError(json.dumps(history['status'])[:2000])
    audio = history['outputs']['save']['audio'][0]
    q = urllib.parse.urlencode({'filename': audio['filename'], 'subfolder': audio['subfolder'], 'type': audio['type']})
    out = HERE / 'out' / MODEL
    out.mkdir(parents=True, exist_ok=True)
    path = out / f'{name}-s{SEED}{Path(audio["filename"]).suffix}'
    path.write_bytes(call(f'/view?{q}'))
    row = dict(model=MODEL, dit=DIT, lm=LM, case=name, seed=SEED, steps=8, asked=seconds, bpm=bpm, key=key,
               took=round(took, 1), used_before_gb=round(before / 1e9, 1), used_most_gb=round(most[0] / 1e9, 1),
               file=path.name, date=time.strftime('%Y-%m-%d'))
    print(json.dumps(row), flush=True)
    with open(HERE / 'results.jsonl', 'a') as f:
        f.write(json.dumps(row) + '\n')


import urllib.parse
for name in sys.argv[1:] or list(CASES):
    render(name)
