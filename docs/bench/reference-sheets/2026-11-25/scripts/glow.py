src = open('stage0.py').read(); g = {'__name__': 'stage0'}
exec(compile(src[:src.index("STEP = ")], 'stage0.py', 'exec'), g)
g['edit']('lantern-fp-glow', 'lantern', 'Make the lantern in image 1 the lantern in image 2: its shape, its brass and its etched glass, at the same size and angle. Keep its state exactly as in image 1: its green glass glowing, lit from within, casting green light around it. Change nothing else.', 10, mask='mask-lantern', refs=['sheet-lantern'])
