# Bütün evrakları seçilen seslerle üretir: cümle cümle, noktalama araları, −16 LUFS, %8 yavaş, Opus 24 kbps.
# Dosya adı metnin özetini taşır: metin değişirse yalnız o evrak yeniden üretilir. Yarıda kalırsa kaldığı yerden sürer.
import hashlib, json, os, re, subprocess, sys, time, torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from duzey import duzey
from metin import oku
SECIM = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/İndirilenler/ses-secimi.json")))
kadro = json.load(open("kadro.json")); metinler = json.load(open("metinler.json"))
ARA = {".": 0.42, "!": 0.42, "?": 0.45, ";": 0.28, ":": 0.25}
os.makedirs("cikti", exist_ok=True); os.makedirs("gecici", exist_ok=True)
harita = json.load(open("cikti/ses.json")) if os.path.exists("cikti/ses.json") else {}
m = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
t0 = time.time(); yapilan = 0
for i, x in enumerate(metinler):
    who = x["who"]; n = SECIM.get(who)
    if not n: continue
    ozet = hashlib.sha1(f"{who}{n}|{x['text']}".encode()).hexdigest()[:8]
    ad = f"{x['id']}-{ozet}.opus"
    if os.path.exists(f"cikti/{ad}"): harita[x["id"]] = ad; continue
    ref = f"secim/ref/{who}-{n}.wav"; v = kadro[who]
    parcalar = [p.strip() for p in re.findall(r"[^.!?;:]+[.!?;:]?", oku(x["text"])) if p.strip()]
    ses = []
    for p in parcalar:
        if len(re.sub(r"\W", "", p)) < 2: continue
        w = m.generate(p, language_id="tr", audio_prompt_path=ref, exaggeration=v["mizac"], cfg_weight=0.3)
        ses += [w, torch.zeros(1, int(m.sr * ARA.get(p[-1], 0.2)))]
    ta.save("gecici/ham.wav", torch.cat(ses, dim=1), m.sr)
    duzey("gecici/ham.wav", "gecici/duz.wav", 0.92)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "gecici/duz.wav", "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", f"cikti/{ad}"], check=True)
    harita[x["id"]] = ad; yapilan += 1
    if yapilan % 10 == 0:
        json.dump(harita, open("cikti/ses.json", "w"), ensure_ascii=False, indent=0)
        gecen = time.time() - t0; kalan = (len(metinler) - i - 1) * gecen / yapilan
        print(f"{i+1}/{len(metinler)} · {gecen/60:.0f} dk · kalan ≈{kalan/60:.0f} dk", flush=True)
json.dump(harita, open("cikti/ses.json", "w"), ensure_ascii=False, indent=0)
print("bitti", len(harita), "dosya")
