// Oyundaki sentez sesleri WAV'a kaydeder: ui.js'teki snd nesnesi başsız Chrome'da OfflineAudioContext ile çalınır.
// Her ses tepe -1 dBFS'e eşitlenir, 44,1 kHz 16 bit mono. node tools/sesler.mjs [çıktı klasörü]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/sesler/", import.meta.url));
const TMP = fileURLToPath(new URL("../.cache/sesler-tmp/", import.meta.url)); // tarayıcı profili ve sayfa: çıktı klasörü temiz kalsın
mkdirSync(OUT, { recursive: true }); mkdirSync(TMP, { recursive: true });
const UI = readFileSync(new URL("../src/ui.js", import.meta.url), "utf8");
const a = UI.indexOf("const snd = (() => {"), b = UI.indexOf("\n})();", a);
if (a < 0 || b < 0) throw new Error("ui.js'te snd bulunamadı");
const SND = UI.slice(a, b + 6);
// [dosya, snd işlevi, süre (sn)]
const SESLER = [["01-muhur", "stamp", .45], ["02-evrak", "paper", .55], ["03-cay-kasik", "clink", 1], ["04-zafer", "win", 2.8],
  ["05-hicaz-oyun-sonu", "hicaz", 4], ["06-menu-tik", "tick", .2]];

const html = `<!doctype html><meta charset="utf-8"><script>
const LS = { get: (k, d) => ({ sound: true, volume: 50 })[k] ?? d, set() { } };
let SR = 44100, LEN = 1, CTX = null;
window.AudioContext = function () { CTX = new OfflineAudioContext(1, Math.ceil(SR * LEN), SR); CTX.resume = () => Promise.resolve(); return CTX; };
// 16 bit PCM WAV, tepe -1 dBFS
const wav = buf => {
  const d = buf.getChannelData(0), peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1, g = 0.891 / peak;
  const ab = new ArrayBuffer(44 + d.length * 2), v = new DataView(ab), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + d.length * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] * g)) * 32767, true);
  let bin = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode(...u.subarray(i, i + 32768));
  return { b64: btoa(bin), peak };
};
window.kaydet = async (fn, len) => {
  LEN = len;
  const snd = (() => { ${SND.replace("const snd = ", "return ")} })();
  snd.unlock(); snd[fn]();
  return wav(await CTX.startRendering());
};
</script>`;
writeFileSync(TMP + "/sesler.html", html);

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9367;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${TMP}/profile`, "--no-first-run", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: new URL("file:///" + TMP.replace(/\\/g, "/") + "/sesler.html").href }); await sleep(800);
  for (const [name, fn, len] of SESLER) {
    const r = await ev(`kaydet(${JSON.stringify(fn)}, ${len})`);
    const buf = Buffer.from(r.b64, "base64");
    writeFileSync(`${OUT}/${name}.wav`, buf);
    console.log(`${name}.wav · ${len} sn · ${(buf.length / 1024).toFixed(0)} KB · ham tepe ${r.peak.toFixed(2)}`);
  }
} catch (e) { errors.push(e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300); }
