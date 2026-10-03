# Seçme sayfası: her karakter için adaylar, seçim düğmeleri, tarayıcıda saklama ve "Seçimi indir" (ses-secimi.json)
import json, os, html, librosa
kadro = {k: v for k, v in json.load(open("kadro.json")).items() if not k.startswith("_") and v.get("ses") != "yok"}
ornek = json.load(open("ornek.json")); ks = {k["yol"]: k for k in json.load(open("klipler.json"))}
plan = json.load(open("secim/plan.json")) if os.path.exists("secim/plan.json") else {}
h = ["""<!doctype html><meta charset=utf-8><title>Ses seçimi</title><style>
body{font:15px system-ui;max-width:920px;margin:0 auto;padding:0 1rem 4rem;background:#13221b;color:#eee}
header{position:sticky;top:0;background:#13221b;padding:1rem 0;border-bottom:1px solid #456;display:flex;gap:1rem;align-items:center;z-index:2}
button{font:600 15px system-ui;padding:.5rem 1rem;border-radius:6px;border:0;background:#d9b65a;color:#222;cursor:pointer}
section{border-bottom:1px solid #345;padding:.8rem 0}h3{margin:.2rem 0}small{color:#9ab}.a{display:flex;gap:.8rem;align-items:center;margin:.35rem 0}
label{display:flex;gap:.4rem;align-items:center;cursor:pointer}section.ok h3::after{content:" ✓";color:#7d7}
</style><header><b id=say></b><button id=indir>Seçimi indir</button><small>Seçimler tarayıcıda saklanır; "hiçbiri" de seçilebilir.</small></header>"""]
for ad, v in kadro.items():
    h.append(f"<section id={ad}><h3>{ad} <small>{html.escape(v['tarif'])}</small></h3><p><small>{html.escape(ornek.get(ad,''))}</small></p>")
    for i, yol in enumerate(plan.get(ad, []), 1):
        f = f"secim/ses/{ad}-{i}.wav"
        if not os.path.exists(f): continue
        k = ks.get(yol, {})
        h.append(f"<div class=a><label><input type=radio name={ad} value={i}> <b>{i}</b></label><audio controls preload=none src='ses/{ad}-{i}.wav'></audio><small>yaş≈{k.get('yas',0):.0f} · perde {k.get('f0',0):.0f} Hz · hız {k.get('hiz',0):.1f}</small></div>")
    h.append(f"<div class=a><label><input type=radio name={ad} value=0> hiçbiri, yeni aday</label></div></section>")
h.append("""<script>
const K='ses-secimi', s=JSON.parse(localStorage.getItem(K)||'{}'), boyut=document.querySelectorAll('section').length;
const boya=()=>{document.querySelectorAll('section').forEach(x=>x.classList.toggle('ok',x.id in s));document.getElementById('say').textContent=Object.keys(s).length+' / '+boyut+' seçildi'};
for(const r of document.querySelectorAll('input[type=radio]')){if(s[r.name]==r.value)r.checked=true;r.onchange=()=>{s[r.name]=+r.value;localStorage.setItem(K,JSON.stringify(s));boya()}}
document.getElementById('indir').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(s,null,1)],{type:'application/json'}));a.download='ses-secimi.json';a.click()};
boya();
</script>""")
open("secim/index.html", "w").write("\n".join(h)); print("sayfa:", len(kadro), "karakter")
