# FLEURS kliplerini ölç: süre, ortanca perde (F0), konuşma hızı (harf/sn), gürültü kabası. Aday havuzu: 5-13 sn
import csv, json, os, sys, numpy as np, librosa
from concurrent.futures import ProcessPoolExecutor
def satirlar():
    for L, tsvs in (("tr_tr", ["tr_tr_train.tsv", "tr_tr_dev.tsv", "tr_tr_test.tsv"]), ("de_de", ["de_de_dev.tsv"]), ("nb_no", ["nb_no_dev.tsv"])):
        yol = {}
        for r, _, fs in os.walk(f"fleurs/{L}"):
            for f in fs: yol[f] = os.path.join(r, f)
        for t in tsvs:
            if not os.path.exists(f"fleurs/{t}"): continue
            for x in csv.reader(open(f"fleurs/{t}"), delimiter="\t"):
                if len(x) < 7 or x[1] not in yol: continue
                sn = int(x[5]) / 16000
                if 5 <= sn <= 13: yield {"dil": L[:2], "yol": yol[x[1]], "metin": x[2], "sn": sn, "cins": x[6]}
def olc(r):
    try:
        y, sr = librosa.load(r["yol"], sr=16000)
        f0, v, _ = librosa.pyin(y, fmin=60, fmax=450, sr=sr, frame_length=1024)
        f0 = f0[~np.isnan(f0)]
        if len(f0) < 20: return None
        e = librosa.feature.rms(y=y)[0]
        r.update(f0=float(np.median(f0)), f0s=float(np.std(f0)), hiz=len(r["metin"]) / r["sn"],
                 snr=float(20 * np.log10(np.percentile(e, 90) / max(np.percentile(e, 10), 1e-5))))
        return r
    except Exception: return None
if __name__ == "__main__":
    rs = list(satirlar())
    with ProcessPoolExecutor(12) as ex: out = [x for x in ex.map(olc, rs, chunksize=8) if x]
    json.dump(out, open("klipler.json", "w"), ensure_ascii=False)
    print(len(rs), "klip,", len(out), "ölçüldü")
