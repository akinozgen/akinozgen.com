# Seslendirme öncesi metin: sayılar, yüzdeler, kesirler ve bazı kısaltmalar Türkçe okunuşa çevrilir (kelimeler ayrı)
import re
B = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
O = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
def uc(n):
    y, o, b = n // 100, n // 10 % 10, n % 10
    return " ".join(x for x in [("" if y == 1 else B[y]) + (" yüz" if y else ""), O[o], B[b]] if x).strip()
def sayi(n):
    if n == 0: return "sıfır"
    parca = []
    for deger, ad in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        if n >= deger:
            k = n // deger; n %= deger
            parca.append("bin" if (deger == 1000 and k == 1) else f"{uc(k) if k < 1000 else sayi(k)} {ad}")
    if n: parca.append(uc(n))
    return " ".join(parca)
def ondalik(s):  # "44,8" → kırk dört virgül sekiz
    t, k = s.split(",")
    return f"{sayi(int(t))} virgül {' '.join(sayi(int(c)) for c in k) if k.startswith('0') else sayi(int(k))}"
KISA = {"TL": "lira", "km": "kilometre", "AVM": "a ve em", "KJ": "ke je"}
def oku(t):
    t = re.sub(r"%\s?(\d+(?:,\d+)?)", lambda m: "yüzde " + (ondalik(m[1]) if "," in m[1] else sayi(int(m[1]))), t)
    t = re.sub(r"(\d{1,3}(?:\.\d{3})+)", lambda m: sayi(int(m[1].replace(".", ""))), t)   # 1.240
    t = re.sub(r"\b(\d{1,2})\.(\d{2})\b", lambda m: f"{sayi(int(m[1]))} {sayi(int(m[2]))}", t)       # 23.58 saat
    t = re.sub(r"(\d+),(\d+)", lambda m: ondalik(m[0]), t)
    t = re.sub(r"(\d+)'(\w+)", lambda m: sayi(int(m[1])) + m[2], t)                     # 2029'da → ...dokuzda
    t = re.sub(r"(\d+(?:\.\d{2})?)'(\w+)", lambda m: m[0], t)
    t = re.sub(r"\d+", lambda m: sayi(int(m[0])), t)
    t = re.sub(r"(\w)'(?=(da|de|ta|te|dan|den|tan|ten|a|e|ya|ye|ı|i|u|ü|yı|yi|yu|yü)\b)", r"\1", t)
    for k, v in KISA.items(): t = re.sub(rf"\b{k}\b", v, t)
    return t.replace("…", ".").replace("(", ", ").replace(")", ",").replace(" ,", ",")
if __name__ == "__main__":
    for s in ["1.240 bardak", "%40", "%44,8 ile", "2029'da", "23.58'de", "43 seçmen", "1 TL"]: print(s, "→", oku(s))
