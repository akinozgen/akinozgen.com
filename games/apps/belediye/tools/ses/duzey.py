# İki geçişli ses düzeyi: önce ölç, sonra doğrusal düzelt (−16 LUFS, tepe −1.5 dB); istenirse atempo
import json, re, subprocess, sys
def duzey(giris, cikis, tempo=1.0):
    # ham çıktı çok kısık olabiliyor (kaynak klip kısıksa model de kısık konuşuyor): önce tepeyi −3 dB'ye kaldır
    r0 = subprocess.run(["ffmpeg", "-i", giris, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    tepe = float(re.findall(r"max_volume: (-?[\d.]+) dB", r0)[-1])
    af0 = (f"atempo={tempo}," if tempo != 1 else "") + f"volume={-3 - tepe:.1f}dB,"
    r = subprocess.run(["ffmpeg", "-i", giris, "-af", af0 + "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    o = json.loads(re.findall(r"\{[^{}]+\}", r)[-1])
    af = af0 + (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={o['input_i']}:measured_TP={o['input_tp']}:measured_LRA={o['input_lra']}"
                f":measured_thresh={o['input_thresh']}:offset={o['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", giris, "-af", af, "-ar", "24000", cikis], check=True)
if __name__ == "__main__":
    duzey(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0)
