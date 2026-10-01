# Median pitch (F0) of voiced speech per clip, to track the drift the user heard.
import json, sys
import librosa, numpy as np

def f0(path):
    y, sr = librosa.load(path, sr=16000)
    f, voiced, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr)
    f = f[voiced & ~np.isnan(f)]
    return round(float(np.median(f)), 0) if len(f) else None

if __name__ == '__main__':
    print(json.dumps({p: f0(p) for p in sys.argv[1:]}))
