# Kliplerin yaşını ve cinsiyetini tahmin et (audeering wav2vec2-large-robust-24-ft-age-gender), klipler.json'a ekle
import json, numpy as np, torch, torch.nn as nn, librosa
from transformers import Wav2Vec2Processor
from transformers.models.wav2vec2.modeling_wav2vec2 import Wav2Vec2Model, Wav2Vec2PreTrainedModel
class Bas(nn.Module):
    def __init__(s, c, n):
        super().__init__(); s.dense = nn.Linear(c.hidden_size, c.hidden_size); s.dropout = nn.Dropout(c.final_dropout); s.out_proj = nn.Linear(c.hidden_size, n)
    def forward(s, x): return s.out_proj(s.dropout(torch.tanh(s.dense(s.dropout(x)))))
class YasCins(Wav2Vec2PreTrainedModel):
    def __init__(s, c):
        super().__init__(c); s.config = c; s.wav2vec2 = Wav2Vec2Model(c); s.age = Bas(c, 1); s.gender = Bas(c, 3); s.post_init()
    def forward(s, x):
        h = torch.mean(s.wav2vec2(x)[0], dim=1)
        return s.age(h), torch.softmax(s.gender(h), dim=1)
ad = "audeering/wav2vec2-large-robust-24-ft-age-gender"
proc = Wav2Vec2Processor.from_pretrained(ad); model = YasCins.from_pretrained(ad).to("cuda").eval()
ks = json.load(open("klipler.json"))
with torch.no_grad():
    for i, k in enumerate(ks):
        y, _ = librosa.load(k["yol"], sr=16000)
        x = proc(y, sampling_rate=16000, return_tensors="pt").input_values.to("cuda")
        a, g = model(x)
        k["yas"] = round(float(a[0, 0]) * 100, 1); k["kadin"], k["erkek"], k["cocuk"] = [round(float(v), 3) for v in g[0]]
        if i % 500 == 0: print(i, k["yas"], k["cins"], flush=True)
json.dump(ks, open("klipler.json", "w"), ensure_ascii=False)
print("bitti", len(ks))
