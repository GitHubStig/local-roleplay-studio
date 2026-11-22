import sys, json, runpy
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
OUT, REPO = sys.argv[3], sys.argv[2]
g = runpy.run_path('refs-comfy-v.py')
up = g['upload']
base = json.load(open(f'{REPO}/server/images/comfyui/workflows/qwen-image-2.1-edit.json')); base.pop('_note')
JOB = {}
def fill(x, vals):
    if isinstance(x, dict): return {k: fill(v, vals) for k, v in x.items()}
    if isinstance(x, list): return [fill(v, vals) for v in x]
    return vals.get(x, x) if isinstance(x, str) else x
def workflow(prompt, refs):
    w = fill(base, {'$unet': g['UNET'], '$clip': g['CLIP'], '$vae': g['VAE'], '$image': JOB['image'], '$mask': JOB['mask'], '$prompt': JOB['prompt'], '$seed': JOB['seed'], '$steps': 25, '$width': 1024, '$height': 1024, '$fitWidth': 1024, '$fitHeight': 1024})
    w['portrait'] = {'class_type': 'LoadImage', 'inputs': {'image': JOB['portrait']}}
    w['conditioning']['inputs']['images.image_2'] = ['portrait', 0]
    w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
    w['sampler']['inputs']['model'] = ['cache', 0]
    w['save']['class_type'] = 'PreviewImage'
    return w
g['run'].__globals__['workflow'] = workflow
EL = "Give the woman in image 1 the face and hair of the woman in image 2, Elara Vance, but keep her expression exactly as it is in image 1: crying, tears running down her cheeks, her face crumpled with grief. Change nothing else."
KA = "Give the man in image 1 the face and hair of the man in image 2, Kael, but keep him exactly as he is in image 1: seen in profile facing left, half his face in shadow, lit by the candle. Change nothing else."
for scene, prompt, portrait in (('cry', EL, 'lrs-bench-portrait-elara.png'), ('profile', KA, 'lrs-bench-portrait-kael.png')):
    for s in (8, 9):
        JOB.update(image=up(f'{OUT}/sc-{scene}-plain-{s}.png', f'lrs-bench-sc-{scene}-{s}.png'),
                   mask=up(f'{OUT}/mask-{scene}-{s}.png', f'lrs-bench-mask-{scene}-{s}.png'),
                   prompt=prompt, seed=s + 1, portrait=portrait)
        n = f'fe-{scene}-{s}'; g['ONLY'][:] = [n]; g['run'](n, '', [])
