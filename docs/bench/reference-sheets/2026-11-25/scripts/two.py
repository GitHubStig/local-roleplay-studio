import sys
src = open('stage0.py').read(); g = {'__name__': 'stage0'}
exec(compile(src[:src.index("STEP = ")], 'stage0.py', 'exec'), g)
g['render']('quay', f"{g['KAEL']} {g['ELARA']} Kael and Elara Vance stand side by side on a harbour quay at dawn, Kael on the left and Elara on the right, both facing the viewer, seen from the knees up, fishing boats behind them. {g['STYLE']}", 8)
g['find']('quay', 'each person')
