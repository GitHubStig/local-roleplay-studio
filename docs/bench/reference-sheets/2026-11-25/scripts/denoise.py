import json, re
src = open('views.py').read(); g = {'__name__': 'views'}
exec(compile(src[:src.index("ONE = ")], 'views.py', 'exec'), g)
masks, log, g0 = g['masks'], g['log'], g['edit'].__globals__
# edit() with a denoise: patch the workflow builder's sampler after fill.
import types
orig_run = g0['run']
def edit_d(name, image, prompt, seed, mask, refs, denoise):
    def run_patched(n, w):
        w['sampler']['inputs']['denoise'] = denoise; return orig_run(n, w)
    g0['run'] = run_patched
    try: g0['edit'](name, image, prompt, seed, mask=mask, refs=refs)
    finally: g0['run'] = orig_run
boxes = {}
for l in open('results.txt'):
    m = re.match(r'angles (\S+) \| [\d.]+ s \| (.*)', l)
    if m: boxes[m.group(1)] = json.loads(m.group(2))[0]['bbox_2d']
E = "Give the woman in image 1 the face and hair of the woman in image 2, but keep her exactly as in image 1: her expression (crying, tears running down her cheeks, her face crumpled with grief), the way her head is turned, and the light. Change nothing else."
K = "Give the man in image 1 the face and hair of the man in image 2, but keep him exactly as in image 1: his expression (solemn and still, gazing out of the window), the way his head is turned, and the light. Change nothing else."
for d in (0.6, 0.75, 0.85, 0.9):
    edit_d(f'elara-face-fp-d{int(d*100)}', 'elara-face', E, 10, masks('mask-elara-face-d', [boxes['elara-face']]), ['sheet-elara'], d)
    edit_d(f'kael-face-fp-d{int(d*100)}', 'kael-face', K, 10, masks('mask-kael-face-d', [boxes['kael-face']]), ['sheet-kael'], d)
    edit_d(f'elara-fp-d{int(d*100)}', 'elara', E, 10, masks('mask-elara-d', [boxes['elara']]), ['sheet-elara'], d)
log('denoise done')
