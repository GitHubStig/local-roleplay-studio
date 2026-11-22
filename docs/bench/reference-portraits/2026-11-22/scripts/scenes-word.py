import sys, runpy
src = open('scenes-bench.py').read().split("for name, (ref, refs, scene) in SCENES.items():")[0]
g = {'__name__': 'x'}; sys.argv = sys.argv[:4]; exec(compile(src, 'scenes-bench.py', 'exec'), g)
run, OPT, SC = g['run'], g['OPT'], g['SCENES']
k, e = g['k'], g['e']
WK = "Image 1 shows Kael's face and hair only. Take nothing else from it: not its expression, its pose, the way he faces or his clothes, which are all as described here."
WE = "Image 1 shows Elara Vance's face and hair only. Take nothing else from it: not its expression, its pose, the way she faces or her clothes, which are all as described here."
for name, ref, refs in (('cry', WE, [e]), ('profile', WK, [k])):
    for seed in (8, 9):
        OPT['seed'] = seed; n = f'sc-{name}-word-{seed}'; g['g']['ONLY'][:] = [n]
        run(n, f'{ref} {SC[name][2]}', refs)
