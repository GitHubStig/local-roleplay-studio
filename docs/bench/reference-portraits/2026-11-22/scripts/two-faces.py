import sys, json, runpy
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
OUT, REPO = sys.argv[3], sys.argv[2]
g = runpy.run_path('refs-comfy-v.py'); up, run = g['upload'], g['run']
base = json.load(open(f'{REPO}/server/images/comfyui/workflows/qwen-image-2.1-edit.json')); base.pop('_note')
def fill(x, v):
    if isinstance(x, dict): return {k: fill(y, v) for k, y in x.items()}
    if isinstance(x, list): return [fill(y, v) for y in x]
    return v.get(x, x) if isinstance(x, str) else x
JOB = {}
def edit_wf(prompt, refs):
    w = fill(base, {'$unet': g['UNET'], '$clip': g['CLIP'], '$vae': g['VAE'], '$image': JOB['image'], '$mask': JOB['mask'], '$prompt': JOB['prompt'], '$seed': JOB['seed'], '$steps': 25, '$width': 1024, '$height': 1024, '$fitWidth': 1024, '$fitHeight': 1024})
    for i, p in enumerate(JOB['portraits'], 2):
        w[f'p{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': p}}
        w['conditioning']['inputs'][f'images.image_{i}'] = [f'p{i}', 0]
    w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
    w['sampler']['inputs']['model'] = ['cache', 0]; w['save']['class_type'] = 'PreviewImage'
    return w
T2I = g['workflow']
LAND = {}
def t2i_wf(prompt, refs):
    w = T2I(prompt, refs); w['latent']['inputs'].update(width=1216, height=832); w['sampler']['inputs']['seed'] = LAND['seed']
    w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
    w['sampler']['inputs']['model'] = ['cache', 0]; return w
glb = g['run'].__globals__
def go(name, **job):
    JOB.clear(); JOB.update(job); glb['workflow'] = edit_wf; g['ONLY'][:] = [name]; run(name, '', [])
k, e = 'lrs-bench-portrait-kael.png', 'lrs-bench-portrait-elara.png'
BOTH = "In image 1, give the man on the left the face and hair of the man in image 2, Kael, and the woman on the right the face and hair of the woman in image 3, Elara Vance. Keep their expressions, the way each of them faces, and everything else exactly as in image 1."
ONE_K = "In image 1, give the man on the left the face and hair of the man in image 2, Kael. Keep his expression, the way he faces, and everything else exactly as in image 1."
ONE_E = "In image 1, give the woman on the right the face and hair of the woman in image 2, Elara Vance. Keep her expression, the way she faces, and everything else exactly as in image 1."
for s in (8, 9):
    pic = up(f'{OUT}/sc-far-plain-{s}.png', f'lrs-bench-sc-far-{s}.png')
    m = {x: up(f'{OUT}/mask-far-{s}-{x}.png', f'lrs-bench-mask-far-{s}-{x}.png') for x in ('k', 'e', 'both')}
    go(f'two-one-{s}', image=pic, mask=m['both'], prompt=BOTH, seed=s + 1, portraits=[k, e])
    go(f'two-k-{s}', image=pic, mask=m['k'], prompt=ONE_K, seed=s + 1, portraits=[k])
    mid = up(f'{OUT}/two-k-{s}.png', f'lrs-bench-two-k-{s}.png')
    go(f'two-seq-{s}', image=mid, mask=m['e'], prompt=ONE_E, seed=s + 2, portraits=[e])
# Someone without a portrait: Bram, with only Kael's and Elara's passed.
src = open('three-bench.py').read(); SCENE = None
exec(src[src.index('BRAM = '):src.index('REF3 = ')].replace('g[\'STYLE\']', repr(g['STYLE'])))
REF2 = g['REF2']
glb['workflow'] = t2i_wf
for s in (8, 9):
    LAND['seed'] = s
    for name, prompt, refs in ((f'nb-plain-{s}', SCENE, []), (f'nb-refs-{s}', f'{REF2} {SCENE}', [k, e])):
        g['ONLY'][:] = [name]; run(name, prompt, refs)
