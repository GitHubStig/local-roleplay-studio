# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["mlx-audio", "torch"]
# [tool.uv]
# prerelease = "allow"
# python-preference = "only-managed"
# ///
"""
The voice service: Roleplay Characters' voices, spoken locally with mlx-audio. The Deno server
starts it (`uv run voice/serve.py`) the first time a voice is needed and talks to it over HTTP on
localhost. Measured 2026-09-30 (docs/models.md):

- design: Qwen3-TTS VoiceDesign speaks a reference sentence in a voice built from a written
  description. Done once per Character; the clip is saved with the Roleplay.
- speak: Higgs TTS 3 clones that clip for each line. Without emotion or style tags and with
  steadier sampling it held the voice in 24 renders of 24; with emotion tags, in 6, drifting up
  to a woman's pitch. A line can come with a pace and a sound (a sigh, a laugh, a cough), which
  held the voice too, and sounded better than plain to the player.

One model is loaded at a time, and unloaded after a while unused, so it doesn't sit on 7-10 GB of
memory next to the Text Model and the Image Model. MLX keeps the working memory of each generation
for reuse unless told otherwise: left alone, the service grew to 36 GB with only Higgs (~10 GB)
loaded, so its cache is capped and cleared after every request. `--download` fetches both models
and exits.
"""
import argparse
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import write as write_audio
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio

DESIGN_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
SPEAK_MODEL = 'bosonai/higgs-tts-3-4b'
# Steadier than the default (1.0, no top-k): with these, the cloned voice stayed put.
SPEAK_SAMPLING = dict(temperature=0.5, top_k=30)

# MLX's buffer cache: what it may keep between requests (it's cleared after each one anyway).
mx.set_cache_limit(512 * 1024**2)

lock = threading.Lock()
loaded = {'repo': None, 'model': None, 'used': 0.0}


def model(repo):
    """The model for `repo`, loading it (and unloading any other) if it isn't loaded."""
    if loaded['repo'] != repo:
        unload()
        # mlx-audio doesn't map the renamed Higgs repo's model type by itself.
        extra = {'model_type': 'higgs_audio_v3'} if repo == SPEAK_MODEL else {}
        loaded.update(repo=repo, model=load_model(repo, **extra))
    loaded['used'] = time.time()
    return loaded['model']


def unload():
    loaded.update(repo=None, model=None)
    mx.clear_cache()


def generate(m, out, seed, **kwargs):
    mx.random.seed(seed)
    start = time.time()
    audio = np.concatenate([np.asarray(r.audio) for r in m.generate(**kwargs)])
    write_audio(out, audio, m.sample_rate)
    return {'seconds': round(time.time() - start, 2), 'duration': round(len(audio) / m.sample_rate, 2)}


def design(req):
    return generate(model(DESIGN_MODEL), req['out'], req.get('seed', 0),
                    text=req['text'], instruct=req['description'])


# A sound is its tag followed at once by the sound itself, as Higgs's model card says.
SOUNDS = {'sigh': 'Uh', 'laughter': 'Heh', 'cough': 'Ahem'}
PACES = {'slow': '<|prosody:speed_slow|>', 'fast': '<|prosody:speed_fast|>'}


def directed(text, pace=None, sound=None, whisper=False):
    """
    The line with Higgs's tags for its pace and sound; a slow line also pauses between sentences.
    A whispered one (a Character's thought) is hushed and breathy, still in their voice: tested on
    twelve thoughts, it stayed in each Character's pitch range, unlike the emotion tags.
    """
    if pace == 'slow':
        text = re.sub(r'([.!?…]) (?=\S)', r'\1 <|prosody:pause|>', text)
    before = f'<|sfx:{sound}|>{SOUNDS[sound]} ' if sound in SOUNDS else ''
    return before + ('<|style:whispering|>' if whisper else '') + PACES.get(pace, '') + text


def speak(req):
    m = model(SPEAK_MODEL)
    ref = load_audio(req['ref'], sample_rate=m.sample_rate)
    text = directed(req['text'], req.get('pace'), req.get('sound'), req.get('whisper', False))
    return generate(m, req['out'], req.get('seed', 0), text=text, ref_audio=ref,
                    ref_text=req['refText'], **SPEAK_SAMPLING)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, {'ok': True, 'loaded': loaded['repo']})
        self.reply(404, {'error': 'Not found'})

    def do_POST(self):
        work = {'/design': design, '/speak': speak}.get(self.path)
        if not work:
            return self.reply(404, {'error': 'Not found'})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            with lock:
                try:
                    result = work(req)
                finally:
                    mx.clear_cache()
            self.reply(200, result)
        except Exception as err:  # Reported to the server, which shows it on the job.
            self.reply(500, {'error': f'{type(err).__name__}: {err}'})

    def log_message(self, *args):
        pass


def unload_when_idle(idle):
    while True:
        time.sleep(15)
        with lock:
            if loaded['repo'] and time.time() - loaded['used'] > idle:
                unload()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8791)
    # Reloading Higgs takes 2-3 s (even straight after a 20 GB Image Model), so it needn't linger.
    parser.add_argument('--idle', type=int, default=60, help='seconds unused before unloading')
    parser.add_argument('--download', action='store_true', help='fetch both models and exit')
    args = parser.parse_args()
    if args.download:
        for repo in (DESIGN_MODEL, SPEAK_MODEL):
            model(repo)
        print('Both voice models are downloaded.')
        return
    threading.Thread(target=unload_when_idle, args=(args.idle,), daemon=True).start()
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
