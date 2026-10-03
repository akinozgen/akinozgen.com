# req.txt'teki her paket için uygun tekerleği PyPI'den bulur, URL listesini yazar (aria2c kaldığı yerden indirir)
import json, re, urllib.request
out = []
for line in open("req.txt"):
    m = re.match(r"^([A-Za-z0-9_.\-]+)==([^\s;]+)", line)
    if not m: continue
    name, ver = m.groups()
    d = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{ver}/json", timeout=60))
    files = d["urls"]
    def score(f):
        fn = f["filename"]
        if not fn.endswith(".whl"): return -1
        if "py3-none-any" in fn or "py2.py3-none-any" in fn: return 1
        if ("cp311" in fn or "abi3" in fn or "py3-none-manylinux" in fn) and ("manylinux" in fn) and "x86_64" in fn: return 2
        return -1
    best = max(files, key=score) if files else None
    if not best or score(best) < 0:
        sd = [f for f in files if f["filename"].endswith(".tar.gz")]
        best = sd[0] if sd else None
    if best: out.append(best["url"]); print(f"{name} {ver} {best['size']//1_000_000}MB")
    else: print("YOK", name, ver)
open("urls.txt", "w").write("\n".join(out) + "\n")
