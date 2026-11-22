import sys, runpy
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
g = runpy.run_path('refs-seed8.py')
wf = g['workflow']
OPT = {}
def workflow(prompt, refs):
    w = wf(prompt, refs)
    w['sampler']['inputs']['seed'] = OPT['seed']
    if refs:
        w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
        w['sampler']['inputs']['model'] = ['cache', 0]
    return w
g['run'].__globals__['workflow'] = workflow
run = g['run']
KAEL, ELARA, STYLE = g['KAEL'], g['ELARA'], g['STYLE']
k, e = 'lrs-bench-portrait-kael.png', 'lrs-bench-portrait-elara.png'
R1 = "Image 1 is Kael. Keep his face, hair and build exactly as in image 1."
R1E = "Image 1 is Elara Vance. Keep her face, hair and build exactly as in image 1."
R2 = g['REF2']
SCENES = {
 'close': (R1, [k], f"{KAEL} A close-up of Kael's face filling the picture, his jaw set and his eyes narrowed in suspicion as he looks just past the viewer, lit from one side by a single oil lamp in a dark tavern. {STYLE}"),
 'far': (R2, [k, e], f"{KAEL} {ELARA} Seen from far along a harbour quay at dawn, Kael and Elara Vance are two small figures walking side by side past moored fishing boats, mist over the grey water and a pale pink sky; he wears a long dark coat, she a dark travelling cloak. {STYLE}"),
 'day': (R1E, [e], f"{ELARA} At midday on a sunlit harbour quay, Elara Vance stands by a stack of crates in a pale blue silk gown with lace at the sleeves and a wide straw hat tied with a ribbon, squinting in the bright sun, gulls overhead and white sails behind her, seen from the waist up. {STYLE}"),
 'profile': (R1, [k], f"{KAEL} Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. {STYLE}"),
 'cry': (R1E, [e], f"{ELARA} Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. {STYLE}"),
}
for name, (ref, refs, scene) in SCENES.items():
    for seed in (8, 9):
        OPT['seed'] = seed
        for kind in ('plain', 'refs'):
            n = f'sc-{name}-{kind}-{seed}'; g['ONLY'][:] = [n]
            run(n, scene if kind == 'plain' else f'{ref} {scene}', [] if kind == 'plain' else refs)
