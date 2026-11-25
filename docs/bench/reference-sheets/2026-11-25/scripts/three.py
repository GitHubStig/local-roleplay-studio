import json, re
src = open('views.py').read(); g = {'__name__': 'views'}
exec(compile(src[:src.index("ONE = ")], 'views.py', 'exec'), g)
edit, masks, log = g['edit'], g['masks'], g['log']
boxes = {}
for l in open('results.txt'):
    m = re.match(r'angles (\S+) \| [\d.]+ s \| (.*)', l)
    if m: boxes[m.group(1)] = json.loads(m.group(2))[0]['bbox_2d']
CASES = [('elara', 'woman', 'her', 'crying, tears running down her cheeks, her face crumpled with grief', 'sheet-elara'),
         ('elara-high', 'woman', 'her', 'crying, tears running down her cheeks, her face crumpled with grief', 'sheet-elara'),
         ('elara-face', 'woman', 'her', 'crying, tears running down her cheeks, her face crumpled with grief', 'sheet-elara'),
         ('kael-face', 'man', 'his', 'solemn and still, gazing out of the window', 'sheet-kael')]
for pic, noun, pos, expr, sheet in CASES:
    obj = 'her' if noun == 'woman' else 'him'
    prompt = (f"Images 2, 3 and 4 show the same {noun} from the front, in a three-quarter turn and in profile. "
              f"Give the {noun} in image 1 that {noun}'s face and hair, but keep {obj} exactly as in image 1: {pos} expression ({expr}), "
              f"the way {pos} head is turned, the framing and the light. Change nothing else.")
    edit(f'{pic}-fp-three', pic, prompt, 10, mask=masks(f'mask-{pic}-three', [boxes[pic]]), refs=[f'{sheet}-v0', f'{sheet}-v1', f'{sheet}-v2'])
log('three done')
