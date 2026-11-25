import sys, json
src = open('b0.py').read(); g = {'__name__': 'b0'}
sys.argv = sys.argv[:4] + ['none']
exec(compile(src[:src.index("if PART in ('all', 'alike'):")], 'b0.py', 'exec'), g)
for name, box in (('away-kael', [250, 54, 750, 600]), ('away-turning', [312, 52, 776, 582])):
    g['edit'](f'{name}-fp', name, "Give the man in image 1 the face and hair of the man in image 2, but keep him exactly as in image 1: his expression (solemn), the way his head is turned, and the light. Change nothing else.", 9, g['masks'](f'mask-{name}', [box]), ['sheet-kael'])
g['log']('away done')
