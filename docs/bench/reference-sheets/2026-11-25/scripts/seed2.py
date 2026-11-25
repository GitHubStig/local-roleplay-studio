"""Stage 0 again on other seeds (scenes 9, camera moves 10, face passes 11): the face pass as settled
(the whole sheet, what it keeps named, the heads counted after, one view if there are more)."""
src = open('views.py').read(); g = {'__name__': 'views'}
exec(compile(src[:src.index("ONE = ")], 'views.py', 'exec'), g)
G = g['edit'].__globals__
render, edit, masks, find_angles, log, view_of = G['render'], g['edit'], g['masks'], g['find_angles'], g['log'], g['view_of']
KAEL, ELARA, GRAX, LANTERN, STYLE, KEEP = G['KAEL'], G['ELARA'], G['GRAX'], G['LANTERN'], G['STYLE'], G['KEEP']
CRY = 'crying, tears running down her cheeks, her face crumpled with grief'
SOLEMN = 'solemn and still, gazing out of the window'
S = {
    'kael': f"{KAEL} Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. {STYLE}",
    'elara': f"{ELARA} Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. {STYLE}",
    'kael-above': f"{KAEL} Kael seen from high above, the camera looking steeply down on him from the rafters, as he stands at a rain-streaked window holding a guttering candle, his face tilted up towards the camera, solemn, in a dark tavern at night. {STYLE}",
    'kael-below': f"{KAEL} Kael seen from the floor, the camera looking steeply up at him, as he stands at a rain-streaked window holding a guttering candle and looks down, solemn, in a dark tavern at night, the rafters behind his head. {STYLE}",
    'elara-above': f"{ELARA} Elara Vance seen from high above, the camera looking steeply down on her from the rafters, as she sits on a narrow bed in a small attic room, her face turned up, crying, tears running down her cheeks, in grey morning light. {STYLE}",
    'elara-below': f"{ELARA} Elara Vance seen from the floor, the camera looking steeply up at her, as she stands in a small attic room and looks down, crying, tears running down her cheeks, in grey morning light, the sloping roof behind her head. {STYLE}",
    'grax': f"{GRAX} Grax sits hunched at a tavern table, a tankard in his huge hand, turned three-quarters to the left and laughing, lit by the hearth, from the chest up. {STYLE}",
    'quay': f"{KAEL} {ELARA} Kael and Elara Vance stand side by side on a harbour quay at dawn, Kael on the left and Elara on the right, both facing the viewer, seen from the knees up, fishing boats behind them. {STYLE}",
    'lantern': f"{LANTERN} The Lantern of Vael hangs from a hook over a tavern table, its green glass glowing, with Kael's hand reaching for it, at night. {STYLE}",
}
for n, p in S.items(): render(f'{n}-s9', p, 9)
for who, noun in (('kael', 'woman' if False else 'man'), ('elara', 'woman')):
    edit(f'{who}-s9-low', f'{who}-s9', f'Move the camera down near the floor, looking up at them: a low angle. {KEEP}', 10)
    edit(f'{who}-s9-high', f'{who}-s9', f'Move the camera up near the ceiling, looking down at them: a high angle. {KEEP}', 10)
    edit(f'{who}-s9-face', f'{who}-s9', f"A close-up of the {noun}'s face, filling the picture, in the same place and light.", 10)
ONE = [(f'kael-s9{v}', 'man', 'him', 'his', SOLEMN, 'sheet-kael') for v in ('', '-low', '-high', '-face')] + \
      [('kael-above-s9', 'man', 'him', 'his', 'solemn, his face tilted up', 'sheet-kael'), ('kael-below-s9', 'man', 'him', 'his', 'solemn, looking down', 'sheet-kael')] + \
      [(f'elara-s9{v}', 'woman', 'her', 'her', CRY, 'sheet-elara') for v in ('', '-low', '-high', '-face')] + \
      [('elara-above-s9', 'woman', 'her', 'her', CRY + ', her face turned up', 'sheet-elara'), ('elara-below-s9', 'woman', 'her', 'her', CRY + ', looking down', 'sheet-elara')] + \
      [('grax-s9', 'troll', 'him', 'his', 'laughing, his mouth open', 'sheet-grax')]
def instr(noun, obj, pos, expr, image=2):
    return (f"Give the {noun} in image 1 the face and hair of the {noun} in image {image}, but keep {obj} exactly as in image 1: "
            f"{pos} expression ({expr}), the way {pos} head is turned and tilted, and the light. Change nothing else.")
for pic, noun, obj, pos, expr, sheet in ONE:
    before = find_angles(pic, f'every person or creature')
    mine = next((h for h in before if noun in h['label'].lower() or 'person' in h['label'].lower() or 'troll' in h['label'].lower() or 'orc' in h['label'].lower()), before[0] if before else None)
    if not mine: log(f'{pic}: no head found'); continue
    edit(f'{pic}-fp', pic, instr(noun, obj, pos, expr), 11, mask=masks(f'mask-{pic}', [mine['bbox_2d']]), refs=[sheet])
    after = find_angles(f'{pic}-fp', 'every person or creature')
    redo = len(after) > len(before)
    log(f'count {pic}-fp: {len(before)} before, {len(after)} after' + ('  <-- redo with one view' if redo else ''))
    if redo:
        v = view_of(sheet, mine.get('facing', 'front'))
        edit(f'{pic}-fp-redo', pic, instr(noun, obj, pos, expr), 12, mask=masks(f'mask-{pic}', [mine['bbox_2d']]), refs=[v])
        again = find_angles(f'{pic}-fp-redo', 'every person or creature')
        log(f'count {pic}-fp-redo ({v}): {len(again)} after')
# Two people, one edit.
hs = find_angles('quay-s9', 'each person')
man = next((h for h in hs if 'woman' not in h['label'].lower()), None); woman = next((h for h in hs if 'woman' in h['label'].lower()), None)
if man and woman:
    edit('quay-s9-fp', 'quay-s9', "Two areas of image 1 are to be repainted: the left one is the man's head, the right one is the woman's head. Repaint the left area with the face and hair of the man in image 2, Kael. Repaint the right area with the face and hair of the woman in image 3, Elara Vance. Both changes are needed. Keep their expressions, calm and watchful, the way each of them faces, and everything else exactly as in image 1.",
         11, mask=masks('mask-quay-s9', [man['bbox_2d'], woman['bbox_2d']]), refs=['sheet-kael', 'sheet-elara'])
    after = find_angles('quay-s9-fp', 'each person'); log(f'count quay-s9-fp: {len(hs)} before, {len(after)} after')
else: log(f'quay-s9: found {[h["label"] for h in hs]}')
# The lantern, its state named.
G['find_angles'] = find_angles
lb = G['find']('lantern-s9', 'the lantern')
if lb: edit('lantern-s9-fp', 'lantern-s9', 'Make the lantern in image 1 the lantern in image 2: its shape, its brass and its etched glass, at the same size and angle. Keep its state exactly as in image 1: its green glass glowing, lit from within, casting green light around it. Change nothing else.', 11, mask=masks('mask-lantern-s9', [lb]), refs=['sheet-lantern'])
log('seed2 done')
