"""Steep angles rendered straight from the prompt (Qwen's camera edits didn't tilt), then the face pass:
the whole sheet, the expression named, and the heads counted before and after."""
src = open('views.py').read(); g = {'__name__': 'views'}
exec(compile(src[:src.index("ONE = ")], 'views.py', 'exec'), g)
G = g['edit'].__globals__
render, edit, masks, find_angles, log = G['render'], g['edit'], g['masks'], g['find_angles'], g['log']
KAEL, ELARA, STYLE = G['KAEL'], G['ELARA'], G['STYLE']
SCENES = {
    'kael-above': (f"{KAEL} Kael seen from high above, the camera looking steeply down on him from the rafters, as he stands at a rain-streaked window holding a guttering candle, his face tilted up towards the camera, solemn, in a dark tavern at night. {STYLE}", 'man', 'his', 'solemn, his face tilted up', 'sheet-kael'),
    'kael-below': (f"{KAEL} Kael seen from the floor, the camera looking steeply up at him, as he stands at a rain-streaked window holding a guttering candle and looks down, solemn, in a dark tavern at night, the rafters behind his head. {STYLE}", 'man', 'his', 'solemn, looking down', 'sheet-kael'),
    'elara-above': (f"{ELARA} Elara Vance seen from high above, the camera looking steeply down on her from the rafters, as she sits on a narrow bed in a small attic room, her face turned up, crying, tears running down her cheeks, in grey morning light. {STYLE}", 'woman', 'her', 'crying, tears running down her cheeks, her face turned up', 'sheet-elara'),
    'elara-below': (f"{ELARA} Elara Vance seen from the floor, the camera looking steeply up at her, as she stands in a small attic room and looks down, crying, tears running down her cheeks, in grey morning light, the sloping roof behind her head. {STYLE}", 'woman', 'her', 'crying, tears running down her cheeks, looking down', 'sheet-elara'),
}
for name, (prompt, noun, pos, expr, sheet) in SCENES.items():
    render(name, prompt, 8)
    before = find_angles(name, f'the {noun}')
    obj = 'her' if noun == 'woman' else 'him'
    instr = (f"Give the {noun} in image 1 the face and hair of the {noun} in image 2, but keep {obj} exactly as in image 1: "
             f"{pos} expression ({expr}), the way {pos} head is turned and tilted, and the light. Change nothing else.")
    edit(f'{name}-fp', name, instr, 9, mask=masks(f'mask-{name}', [before[0]['bbox_2d']]), refs=[sheet])
    after = find_angles(f'{name}-fp', 'every person')
    log(f'count {name}-fp: {len(before)} before, {len(after)} after')
log('steep done')
