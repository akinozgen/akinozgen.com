# Seçme sınavı: her karaktere 3 aday kaynak klip, her aday karakterin kendi evrağını okur; seçme sayfası yazılır
import json, os, re, subprocess, sys, html, numpy as np, librosa, soundfile as sf, torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from duzey import duzey
kadro = {k: v for k, v in json.load(open("kadro.json")).items() if not k.startswith("_") and v.get("ses") != "yok"}
ornek = json.load(open("ornek.json")); ks = json.load(open("klipler.json"))
HEDEF_YAS = {"genc": 26, "orta": 45, "yasli": 65, "cocuk": 20}
PERDE = {"e": {"alcak": 100, "orta": 120, "yuksek": 145}, "k": {"alcak": 180, "orta": 205, "yuksek": 235}}
KAYDIR = {"yasli": {"k": -1.5}, "cocuk": {"k": 4.0}}  # yarım ses: yaşlı kadın biraz kalın, çocuk ince
kullanildi = set()
def puan(k, v):
    cins = "MALE" if v["cins"] == "e" else "FEMALE"
    dil = {"de": "de", "nb": "nb"}.get(v.get("dil"), "tr")
    if k["dil"] != dil or (dil == "tr" and k["cins"] != cins): return -1e9
    p = -abs(k["yas"] - HEDEF_YAS[v["yas"]]) * 1.0
    p -= abs(k["f0"] - PERDE[v["cins"]][v["perde"]]) * 0.3
    p -= max(0, k["hiz"] - 14) * 2.0           # hızlı okuyanları istemeyiz
    p += min(k["snr"], 40) * 0.3               # temiz kayıt
    return p
os.makedirs("secim/ref", exist_ok=True); os.makedirs("secim/ses", exist_ok=True)
plan = {}
for ad, v in kadro.items():
    adaylar = sorted(ks, key=lambda k: -puan(k, v))
    sec = []
    for k in adaylar:
        imza = (round(k["f0"] / 4), round(k["yas"] / 4))  # aynı konuşmacıyı iki kez almamak için kaba imza
        if k["yol"] in kullanildi or any(s[1] == imza for s in sec): continue
        sec.append((k, imza)); kullanildi.add(k["yol"])
        if len(sec) == 3: break
    plan[ad] = [s[0] for s in sec]
m = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
ARA = {".": 0.42, "!": 0.42, "?": 0.45, ";": 0.28, ":": 0.25}
satir = []
for ad, adaylar in plan.items():
    v = kadro[ad]; metin = ornek.get(ad, "")
    parcalar = [p.strip() for p in re.findall(r"[^.!?;:]+[.!?;:]?", metin) if p.strip()]
    for i, k in enumerate(adaylar):
        ref = f"secim/ref/{ad}-{i+1}.wav"
        y, sr = librosa.load(k["yol"], sr=24000)
        kay = KAYDIR.get(v["yas"], {}).get(v["cins"], 0)
        if kay: y = librosa.effects.pitch_shift(y, sr=sr, n_steps=kay)
        sf.write(ref + ".ham.wav", y, sr); duzey(ref + ".ham.wav", ref); os.remove(ref + ".ham.wav")
        ses = []
        for p in parcalar:
            w = m.generate(p, language_id="tr", audio_prompt_path=ref, exaggeration=v["mizac"], cfg_weight=0.3)
            ses += [w, torch.zeros(1, int(m.sr * ARA.get(p[-1], 0.2)))]
        ta.save("secim/ham.wav", torch.cat(ses, dim=1), m.sr)
        duzey("secim/ham.wav", f"secim/ses/{ad}-{i+1}.wav", 0.92)
        satir.append((ad, i + 1, k))
        print(ad, i + 1, f"yaş≈{k['yas']:.0f} perde {k['f0']:.0f} hız {k['hiz']:.1f}", flush=True)
json.dump({a: [k["yol"] for k in ks_] for a, ks_ in plan.items()}, open("secim/plan.json", "w"), ensure_ascii=False, indent=1)
# seçme sayfası
h = ['<!doctype html><meta charset=utf-8><title>Ses seçimi</title><style>body{font:15px system-ui;max-width:900px;margin:2rem auto;background:#13221b;color:#eee}section{border-bottom:1px solid #345;padding:.8rem 0}h3{margin:.2rem 0}small{color:#9ab}.a{display:flex;gap:1rem;align-items:center;margin:.3rem 0}</style><h1>Çaylar Belediyeden: ses seçimi</h1><p>Her karakter için üç aday. Beğendiğinizin numarasını söyleyin (örn. bekir 2).</p>']
for ad in plan:
    v = kadro[ad]
    h.append(f"<section><h3>{ad} <small>{html.escape(v['tarif'])}</small></h3><p><small>{html.escape(ornek.get(ad,''))}</small></p>")
    for a, i, k in [s for s in satir if s[0] == ad]:
        h.append(f"<div class=a><b>{i}</b><audio controls preload=none src='ses/{ad}-{i}.wav'></audio><small>yaş≈{k['yas']:.0f} · perde {k['f0']:.0f} Hz · hız {k['hiz']:.1f}</small></div>")
    h.append("</section>")
open("secim/index.html", "w").write("\n".join(h))
print("sayfa hazır")
