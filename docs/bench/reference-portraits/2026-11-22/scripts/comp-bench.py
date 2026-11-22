import sys, runpy
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
OUT = sys.argv[3]
g = runpy.run_path('refs-seed8.py')
wf = g['workflow']
def workflow(prompt, refs):
    w = wf(prompt, refs)
    w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
    w['sampler']['inputs']['model'] = ['cache', 0]
    return w
g['run'].__globals__['workflow'] = workflow
run, frame, up = g['run'], g['frame'], g['upload']
KAEL, ELARA, STYLE = g['KAEL'], g['ELARA'], g['STYLE']
names = ['fb-kael', 'fb-elara'] + [f'{v}-{i}' for v in ('word', 'after', 'full') for i in (9, 12)]
g['ONLY'][:] = names
# Full-length portraits, seed 7 as the head-and-shoulders ones (the Frames are at 8).
seed7 = lambda prompt, refs: (lambda w: (w['sampler']['inputs'].__setitem__('seed', 7), w)[1])(workflow(prompt, refs))
g['run'].__globals__['workflow'] = seed7
full = lambda who, pron: f"{who} A full-length portrait of {pron} alone, standing, head to toe, facing the viewer in a slight three-quarter turn, face clearly and evenly lit, in plain dark clothes, against a plain dark grey backdrop. {STYLE}"
run('fb-kael', full(KAEL, 'him')); run('fb-elara', full(ELARA, 'her'))
g['run'].__globals__['workflow'] = workflow
fk, fe = up(f'{OUT}/fb-kael.png', 'lrs-bench-fb-kael.png'), up(f'{OUT}/fb-elara.png', 'lrs-bench-fb-elara.png')
k, e = 'lrs-bench-portrait-kael.png', 'lrs-bench-portrait-elara.png'
WORD = "Image 1 shows only Kael's face and hair, and image 2 only Elara Vance's: take nothing else from them. The framing, the camera, the poses, the clothes and the scene are as described here."
for i in (9, 12):
    run(f'word-{i}', f"{WORD} {frame(i)}", [k, e])
    run(f'after-{i}', f"{frame(i)} {g['REF2']}", [k, e])
    run(f'full-{i}', f"{g['REF2']} {frame(i)}", [fk, fe])
