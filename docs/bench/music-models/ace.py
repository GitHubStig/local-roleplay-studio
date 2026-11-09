# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["psutil", "soundfile"]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Renders the music bench's cases with ACE-Step 1.5 through a running ComfyUI (ComfyUI's own
"ACE-Step 1.5 split" template, the pick by default: the XL turbo, the 0.6B and 4B text encoders,
8 steps), timing each and noting ComfyUI's memory at the most (comfyui_memory, polled every 2 s). See README.md.

    uv run ace.py                       # every case, seed 1, on 127.0.0.1:8188
    uv run ace.py tavern-60 song-150    # only these
    FROM=out/ace-step-1.5-xl-turbo-4b-lm/tavern-60-s1.flac MODE=cover uv run ace.py tavern-tense-60
    FROM=out/ace-step-1.5-xl-turbo-4b-lm/tavern-60-s1.flac MODE=extend uv run ace.py tavern-60

FROM and MODE make a Cue from an earlier one's audio, with ComfyUI's own nodes (it has no template
for either): MODE=cover gives the earlier audio to "Set Reference Audio" (ReferenceTimbreAudio,
which ComfyUI's ACE-Step 1.5 treats as a cover: the source the new music is built over), the
planner's audio codes off, as that node asks; MODE=extend joins EXTEND_BY seconds (30) of empty
latent to the earlier audio's and masks the sampling to the new part and the OVERLAP seconds (10)
before it, so only that is drawn and the join is drawn again.
    COMFYUI=http://192.168.50.85:8188 SEED=2 uv run ace.py

The captions are written as ACE-Step's guide asks (docs/en/Tutorial.md in its repo): prose on the
style, emotion, instruments, timbre and production, with the tempo, key and length left out of
them and set as their own inputs; an instrumental's lyrics are structure tags that agree with the
caption. Output goes to out/<setup>/ (out/ace-step-1.5-xl-turbo-4b-lm/, with "-pc" on the end on the PC, as
the same seed makes another clip on another machine; MACHINE= overrides which), results to
results.jsonl. FREE=1 frees ComfyUI after each render, as the app does after every job, and records
how long the card took to empty and what stayed.
"""
import json, os, re, subprocess, sys, threading, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
COMFYUI = os.environ.get('COMFYUI', 'http://127.0.0.1:8188').rstrip('/')
PORT = urllib.parse.urlparse(COMFYUI).port or 8188
SEED = int(os.environ.get('SEED', '1'))
MACHINE = os.environ.get('MACHINE', 'pc' if sys.platform == 'win32' else 'mac')
FREE = os.environ.get('FREE') == '1'
# The DiT and the planner (the LM that writes audio codes first): the XL turbo with its 4B planner, the
# pick. DIT=acestep_v1.5_turbo and LM=qwen_1.7b_ace15 are the setups benched before it, whose files both
# machines have since deleted (2026-11-09).
DIT = os.environ.get('DIT', 'acestep_v1.5_xl_turbo_bf16')
LM = os.environ.get('LM', 'qwen_4b_ace15')
# A folder's name leaves the 1.7B planner out, as it was the first default, so results.jsonl, clips/ and
# verdicts.json keep matching their folders. Don't name the folders after the default.
NAMES = {'acestep_v1.5_turbo': 'turbo', 'acestep_v1.5_xl_turbo_bf16': 'xl-turbo'}
MODEL = f"ace-step-1.5-{NAMES.get(DIT, DIT)}" + ('' if LM == 'qwen_1.7b_ace15' else f"-{LM.split('_')[1]}-lm") + ('' if MACHINE == 'mac' else f'-{MACHINE}')

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

# The tension test (2026-11-08): no tense Cue came out tense (three captions, two models, two
# planners). A leaves folk for a thriller score; B keeps the tavern's instruments with the ways of
# playing that make strings tense (tremolo, staccato, a relentless pulse); C is B quicker, to hear
# how much tempo carries it.
TENSE_A = ('Suspense thriller film score. Pulsing low strings play a relentless staccato ostinato, '
           'dark sustained cellos and basses swell beneath, sharp dissonant string stabs, a deep, slow '
           'drum hit like a heartbeat. Tense, ominous, menacing, anxious, building dread. Dark, tight '
           'and cinematic.')
TENSE_A_LYRICS = """[Intro - pulsing low strings, ostinato]

[Build - dissonant stabs, tension rising]

[Climax - full strings, menacing]

[Outro - low pulse, unresolved]"""
TENSE_B = ('Tense, dark folk score. A fiddle plays a nervous tremolo, a cello plays a relentless '
           'staccato pulse, a frame drum keeps a tight, insistent beat. Anxious, suspicious, menacing, '
           'like danger in the room. Dark, dry and tight.')
TENSE_B_LYRICS = """[Intro - cello staccato pulse, frame drum]

[Verse - fiddle tremolo, nervous]

[Build - pulse tightens, tension rising]

[Outro - tremolo, unresolved]"""

# A again, after the owner's listen: it had tension but was monotonous (the same stabs without a
# break, nothing until 20 s in), as it asked for a texture and no course. This one says how it
# develops, in the caption and in each section, and is meant for the 4B planner.
TENSE_D = ('Suspense thriller film score that keeps developing. It opens on a low, uneasy string pulse '
           'with a single dark cello line; within a few bars sharp dissonant string stabs break in, the '
           'pulse quickens, and low brass and a slow, heavy drum join, the tension climbing in waves. '
           'Midway it drops to a near-silent held note and a ticking pulse, then surges back louder and '
           'denser. Ominous, menacing, anxious, building dread. Dark, tight and cinematic.')
TENSE_D_LYRICS = """[Intro - low string pulse, dark cello line, uneasy]

[Build - dissonant stabs break in, pulse quickens]

[Rise - low brass and heavy drum join, tension climbing]

[Break - near-silent held note, ticking pulse]

[Climax - full strings and brass surge back, menacing]

[Outro - stabs stop, one low note, unresolved]"""

# The other Cues written as a course too (2026-11-08), as D was: how each piece unfolds, its
# section tags following the same stages.
TAVERN_D = ('Intimate acoustic folk from an 18th-century harbour tavern on a rainy night, guarded warmth, '
            'smoky and close. It opens on a lone fiddle playing a slow, weary melody; a low cello slips in '
            'beneath it a few bars later; midway a soft squeezebox breathes in with gentle chords and the '
            'three play together, warmer but still hushed; then the squeezebox falls away and the fiddle '
            'and cello settle back to a quiet close. A live, roomy recording, warm and woody.')
TAVERN_D_LYRICS = """[Intro - lone fiddle, slow and weary]

[Verse - low cello slips in beneath]

[Middle - soft squeezebox chords join, warmer]

[Outro - squeezebox falls away, fiddle and cello, quiet]"""
HEAVEN_D = ('Sacred ambient choral music at the gates of heaven, vast awe with warmth under the solemnity. '
            'It opens on a pipe organ held low and slow harp arpeggios; a low, soft wordless choir then '
            'enters in the background and stays beneath everything to the end; warm, soft strings join '
            'the choir midway and the sound grows fuller but stays calm; it ends on the low choir and '
            'organ alone, fading. Airy, lush and spacious, cathedral reverb.')
HEAVEN_D_LYRICS = """[Intro - low organ, slow harp]

[Verse - low soft choir enters in the background]

[Middle - warm strings join the choir, fuller, calm]

[Outro - low choir and organ alone, fading]"""
BUFFET_D = ('Gentle cinematic underscore for the last scene of a film, bittersweet regret giving way to '
            'peace. It opens on a soft solo piano playing a simple, bittersweet melody; warm strings swell '
            'in beneath it; midway a far-off acoustic guitar answers the piano and the mood eases; the '
            'strings fall away and it ends on the piano alone, at peace. Unhurried, intimate and warm, a '
            'polished studio recording with a soft, airy room.')
BUFFET_D_LYRICS = """[Intro - soft solo piano, bittersweet]

[Verse - warm strings swell beneath]

[Middle - far-off acoustic guitar answers, easing]

[Outro - piano alone, at peace]"""

# A choir that's heard (2026-11-08): no Heaven since the first had one the owner could hear. Each
# since had instrumental section tags and a choir "low", "soft" or "in the background", which the
# planner may take as an instrumental with a trace of choir. ACE-Step's guide puts sung sounds in
# the lyrics, wordless ones as vowels: E is the liked course Heaven with choir lines to sing; F makes
# the choir its lead.
HEAVEN_E_LYRICS = """[Intro - low organ, slow harp]

[Choir - soft, wordless]
Ooh... ooh...
Aah... aah...

[Choir - with warm strings, fuller, calm]
Ooh... aah...
Ooh... aah...

[Outro - choir and organ, fading]
Aah..."""
HEAVEN_F = ('Sacred choral music at the gates of heaven, vast awe with warmth under the solemnity. A soft '
            'choir sings slow, wordless ooh and aah, clearly heard, carrying the piece from start to end; '
            'a pipe organ holds low chords and a harp plays slow arpeggios beneath it; warm strings join '
            'the choir midway and it grows fuller but stays calm; it ends on the choir alone, fading. '
            'Airy, lush and spacious, cathedral reverb.')

FROM = os.environ.get('FROM')
MODE = os.environ.get('MODE', 'cover')
EXTEND_BY = float(os.environ.get('EXTEND_BY', '30'))
OVERLAP = float(os.environ.get('OVERLAP', '10'))

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
    'tense-a-60': (TENSE_A, TENSE_A_LYRICS, 60, 100, 'D minor'),
    'tense-b-60': (TENSE_B, TENSE_B_LYRICS, 60, 100, 'D minor'),
    'tense-c-60': (TENSE_B, TENSE_B_LYRICS, 60, 132, 'D minor'),
    'tense-d-60': (TENSE_D, TENSE_D_LYRICS, 60, 100, 'D minor'),
    'tavern-d-60': (TAVERN_D, TAVERN_D_LYRICS, 60, 70, 'A minor'),
    'heaven-d-60': (HEAVEN_D, HEAVEN_D_LYRICS, 60, 60, 'D major'),
    'buffet-d-60': (BUFFET_D, BUFFET_D_LYRICS, 60, 66, 'F major'),
    'heaven-e-60': (HEAVEN_D, HEAVEN_E_LYRICS, 60, 60, 'D major'),
    'heaven-f-60': (HEAVEN_F, HEAVEN_E_LYRICS, 60, 60, 'D major'),
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


def from_audio(graph, uploaded, source_seconds, seconds):
    """The workflow changed to build on an earlier Cue's audio (MODE), uploaded as `uploaded`."""
    graph['text']['inputs']['generate_audio_codes'] = False
    graph['load'] = {'class_type': 'LoadAudio', 'inputs': {'audio': uploaded}}
    graph['encode'] = {'class_type': 'VAEEncodeAudio', 'inputs': {'audio': ['load', 0], 'vae': ['vae', 0]}}
    if MODE == 'cover':
        graph['reference'] = {'class_type': 'ReferenceTimbreAudio',
                              'inputs': {'conditioning': ['text', 0], 'latent': ['encode', 0]}}
        graph['sample']['inputs']['positive'] = ['reference', 0]
    elif MODE == 'extend':
        tenths = round(seconds * 10)
        graph['latent']['inputs']['seconds'] = EXTEND_BY
        graph['joined'] = {'class_type': 'LatentConcat',
                           'inputs': {'samples1': ['encode', 0], 'samples2': ['latent', 0], 'dim': 'x'}}
        graph['keep'] = {'class_type': 'SolidMask', 'inputs': {'value': 0.0, 'width': tenths, 'height': 1}}
        graph['draw'] = {'class_type': 'SolidMask',
                         'inputs': {'value': 1.0, 'width': round((EXTEND_BY + OVERLAP) * 10), 'height': 1}}
        graph['mask'] = {'class_type': 'MaskComposite',
                         'inputs': {'destination': ['keep', 0], 'source': ['draw', 0],
                                    'x': round((source_seconds - OVERLAP) * 10), 'y': 0, 'operation': 'add'}}
        graph['masked'] = {'class_type': 'SetLatentNoiseMask', 'inputs': {'samples': ['joined', 0], 'mask': ['mask', 0]}}
        graph['sample']['inputs']['latent_image'] = ['masked', 0]
    else:
        raise SystemExit(f'MODE is cover or extend, not {MODE}')
    return graph


def upload(path):
    """Sends a file to ComfyUI's input folder, where LoadAudio finds it."""
    boundary = 'bench' + str(time.time_ns())
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{path.name}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + path.read_bytes() + (
            f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue'
            f'\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(COMFYUI + '/upload/image', data=body,
                                 headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())['name']


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(COMFYUI + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as res:
        return res.read()


def comfyui_memory():
    """ComfyUI's memory now, in GB, if it runs on this machine ({} if not, as for a remote one).

    `ram` is its process's on either machine: macOS's phys_footprint, which counts Metal's, or
    Windows' working set. The card's is apart on the PC, so there's also `vram` (the whole card's in
    use, as nvidia-smi can't split it by process under Windows; compare it with the row's before),
    `commit` (what the process has reserved of RAM and page file), and the machine's `machine_ram`
    and `page_file` in use, as a 16 GB machine may fit only by paging.
    """
    gb = 1024 ** 3
    try:
        if sys.platform == 'win32':
            import psutil  # here, as analyse.py runs this file for its captions without psutil
            pid = next(c.pid for c in psutil.net_connections('tcp')
                       if c.status == psutil.CONN_LISTEN and c.laddr.port == PORT)
            process = psutil.Process(pid).memory_info()
            vram = subprocess.run(['nvidia-smi', '--query-gpu=memory.used', '--format=csv,noheader,nounits'],
                                  capture_output=True, text=True).stdout
            machine = psutil.virtual_memory()
            return {'ram': process.rss / gb, 'vram': float(vram) / 1024, 'commit': process.vms / gb,
                    'machine_ram': (machine.total - machine.available) / gb, 'page_file': psutil.swap_memory().used / gb}
        pid = subprocess.run(['lsof', '-nP', f'-iTCP:{PORT}', '-sTCP:LISTEN', '-t'],
                             capture_output=True, text=True).stdout.split()[0]
        out = subprocess.run(['footprint', '-p', pid], capture_output=True, text=True).stdout
        m = re.search(r'phys_footprint:\s+([\d.]+)\s+(KB|MB|GB)', out)
        return {'ram': float(m[1]) * {'KB': 1 / 1024 ** 2, 'MB': 1 / 1024, 'GB': 1}[m[2]]}
    except Exception:
        return {}


def free_comfyui(vram_before):
    """Frees ComfyUI as the app does after every job (server/comfyui/client.ts, cleanUp), waiting up to
    30 s for the card to come back to about what it was before the job. Says how long that took, and what's left."""
    start = time.perf_counter()
    call('/free', {'unload_models': True, 'free_memory': True})
    while time.perf_counter() - start < 30:
        if comfyui_memory().get('vram', 0) <= vram_before + 0.5:
            break
        time.sleep(0.5)
    took = time.perf_counter() - start
    time.sleep(2)  # the RAM may follow the card
    left = comfyui_memory()
    return {'free_took': round(took, 1), 'freed_ram_gb': round(left.get('ram', 0), 1), 'freed_vram_gb': round(left.get('vram', 0), 1)}

def render(name):
    caption, lyrics, seconds, bpm, key = CASES[name]
    graph = None
    label = name
    if FROM:
        source = Path(FROM)
        import soundfile
        source_seconds = soundfile.info(source).duration
        if MODE == 'extend':
            seconds = round(source_seconds + EXTEND_BY, 1)
        uploaded = upload(source)
        graph = from_audio(workflow(caption, lyrics, seconds, bpm, key, f'bench/{name}'), uploaded,
                           source_seconds, seconds)
        label = f'{name}-{MODE}-from-{source.stem}'
    before = comfyui_memory()
    most = dict(before)
    done = threading.Event()

    def watch():
        while not done.wait(2):
            for key, value in comfyui_memory().items():
                most[key] = max(most[key], value)

    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()
    start = time.perf_counter()
    graph = graph or workflow(caption, lyrics, seconds, bpm, key, f'bench/{name}')
    prompt = json.loads(call('/prompt', {'prompt': graph}))
    pid = prompt['prompt_id']
    while True:
        history = json.loads(call(f'/history/{pid}')).get(pid)
        if history and history.get('status', {}).get('completed') is not None:
            break
        time.sleep(1)
    took = time.perf_counter() - start
    done.set()
    watcher.join()
    measured = {f'{key}_most_gb': round(value, 1) for key, value in most.items() if key != 'ram'}
    if 'vram' in before:
        measured['vram_before_gb'] = round(before['vram'], 1)
    if history['status'].get('status_str') != 'success':
        raise RuntimeError(f'{json.dumps(history["status"])[:2000]}\nAt the most: {measured}, ram {most.get("ram")}')
    audio = history['outputs']['save']['audio'][0]
    q = urllib.parse.urlencode({'filename': audio['filename'], 'subfolder': audio['subfolder'], 'type': audio['type']})
    out = HERE / 'out' / MODEL
    out.mkdir(parents=True, exist_ok=True)
    path = out / f'{label}-s{SEED}{Path(audio["filename"]).suffix}'
    path.write_bytes(call(f'/view?{q}'))
    if FREE:
        measured |= free_comfyui(before.get('vram', 0))
    row = dict(machine=MACHINE, model=MODEL, dit=DIT, lm=LM, case=label, mode=MODE if FROM else 'text', source=FROM, seed=SEED, steps=8, asked=seconds, bpm=bpm, key=key,
               took=round(took, 1), comfyui_before_gb=round(before.get('ram', 0), 1), comfyui_most_gb=round(most.get('ram', 0), 1),
               **measured, file=path.name, date=time.strftime('%Y-%m-%d'))
    print(json.dumps(row), flush=True)
    with open(HERE / 'results.jsonl', 'a', newline='\n') as f:
        f.write(json.dumps(row) + '\n')


if __name__ == '__main__':
    for name in sys.argv[1:] or list(CASES):
        render(name)
