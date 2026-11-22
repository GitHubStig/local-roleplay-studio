import sys
src = open('scenes-bench.py').read().split("for name, (ref, refs, scene) in SCENES.items():")[0]
g = {'__name__': 'x'}; sys.argv = sys.argv[:4]; exec(compile(src, 'scenes-bench.py', 'exec'), g)
inner = g['g']; run, OPT, SC, up = g['run'], g['OPT'], g['SCENES'], inner['upload']
OUT = sys.argv[3]
base = inner['run'].__globals__['workflow']
RES = {'v': 1024}
def workflow(prompt, refs):
    w = base(prompt, refs); w['text']['inputs']['resolution'] = RES['v']; return w
inner['run'].__globals__['workflow'] = workflow
fk, fe = up(f'{OUT}/face-kael.png', 'lrs-bench-face-kael.png'), up(f'{OUT}/face-elara.png', 'lrs-bench-face-elara.png')
k, e = g['k'], g['e']
for variant, res, imgs in (('crop', 1024, {'k': fk, 'e': fe}), ('r512', 512, {'k': k, 'e': e}), ('crop512', 512, {'k': fk, 'e': fe})):
    RES['v'] = res
    for name, who in (('cry', 'e'), ('profile', 'k')):
        ref = SC[name][0]
        for seed in (8, 9):
            OPT['seed'] = seed; n = f'sc-{name}-{variant}-{seed}'; inner['ONLY'][:] = [n]
            run(n, f'{ref} {SC[name][2]}', [imgs[who]])
