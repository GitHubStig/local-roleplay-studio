import sys
src = open('two-faces.py').read()
head = src[:src.index("for s in (8, 9):\n    pic = up(")]
g2 = {'__name__': 'x'}; sys.argv = sys.argv[:4]; exec(compile(head, 'two-faces.py', 'exec'), g2)
go, k, e, run, glb, LAND, t2i_wf, g = g2['go'], g2['k'], g2['e'], g2['run'], g2['glb'], g2['LAND'], g2['t2i_wf'], g2['g']
SWAP = "In image 1, give the woman on the right the face and hair of the woman in image 2, Elara Vance, and the man on the left the face and hair of the man in image 3, Kael. Keep their expressions, the way each of them faces, and everything else exactly as in image 1."
EXPL = ("Two areas of image 1 are to be repainted: the left one is the man's head, the right one is the woman's head. "
        "Repaint the left area with the face and hair of the man in image 2, Kael. Repaint the right area with the face and hair of the woman in image 3, Elara Vance. "
        "Both changes are needed. Keep their expressions, the way each of them faces, and everything else exactly as in image 1.")
for s in (8, 9):
    pic, mask = f'lrs-bench-sc-far-{s}.png', f'lrs-bench-mask-far-{s}-both.png'
    go(f'swap-{s}', image=pic, mask=mask, prompt=SWAP, seed=s + 1, portraits=[e, k])
    go(f'expl-{s}', image=pic, mask=mask, prompt=EXPL, seed=s + 1, portraits=[k, e])
STYLE = g['STYLE']
FIRST = ("Bram, a 60-year-old sailor, sits on a stool at the bar, laughing, a tankard of ale raised in his fist: he is stocky and barrel-chested, with ruddy wind-burned skin, a bald head, a thick grey beard braided at the chin and a gold ring in one ear, in a salt-stained sailor's coat. "
         "Elara Vance, a 20-year-old woman with pale skin and dark hair pulled back neatly, sits on the stool beside him in a damp dark travelling cloak, leaning forward with her elbows on the bar, a folded letter under her hand. "
         "Kael, a 42-year-old man with weathered tanned skin, old scars and short unkempt brown hair, stands behind the warped wooden bar, wiping a cracked mug with a rag and watching the two across from him. "
         "The three are shown at eye level from across the room in a small 18th-century harbour tavern, all of them fully in view, with oil lamps on the bar and a rain-lashed window behind. " + STYLE)
glb['workflow'] = t2i_wf
for s in (8, 9):
    LAND['seed'] = s
    for name, prompt, refs in ((f'bf-plain-{s}', FIRST, []), (f'bf-refs-{s}', f"Image 1 is Kael and image 2 is Elara Vance. Keep each one's face, hair and build exactly as in their image. {FIRST}", [k, e])):
        g['ONLY'][:] = [name]; run(name, prompt, refs)
