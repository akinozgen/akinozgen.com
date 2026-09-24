// Seçim gecesi testi: seçim ayında 5 adaylı bir yarış kurar, sayımı izler, sonucu motorla karşılaştırır.
// Sayım ortası ve sonuç ekranı .cache/election/ klasörüne yazılır. node tools/election.mjs [çıktı klasörü] [adres]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/election/", import.meta.url));
const PAGE = process.argv[3] || new URL("../dist/oyna.html", import.meta.url).href;
mkdirSync(OUT, { recursive: true });
const src = ["cards.js", "engine.js"].map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");
const E = new Function(src + "\nreturn { newGame, electionCard, materialize };")();
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", PORT = 9346;
const chrome = spawn(CHROME, ["--headless=new", "--mute-audio", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async name => { const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64")); };
const check = (ok, msg) => { if (!ok) errors.push("TEST: " + msg); };
let seed = 11; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const setup = () => {
  const s = E.newGame();
  Object.assign(s.m, { h: 52, k: 44, e: 33, a: 47 }); s.month = 59; s.fieldTerm = 1; s.cnt.tekir = 3; s.rel = { bekir: -2 };
  s.field = { term: 1, main: "nermin", extras: ["bekir", "burak", "tekir"] };
  s.cur = E.materialize(E.electionCard(s, rng), s, rng);
  return s;
};
const load = async s => {
  await send("Page.navigate", { url: PAGE }); await sleep(1200);
  await ev(`localStorage.clear(); localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(s))}); localStorage.setItem("cb.introSeen", "true"); location.reload()`); await sleep(1400);
  await ev(`document.querySelector("#btn-resume").click()`); await sleep(700);
};
const screenNow = () => ev(`["title","game","over","secim"].find(x => !document.querySelector("#scr-" + x).hidden)`);
try {
  let url; for (let t = 0; t < 50 && !url; t++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch { } if (!url) await sleep(200); }
  ws = new WebSocket(url); await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === "Runtime.exceptionThrown") errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)); });
  await send("Runtime.enable"); await send("Page.enable");
  for (const [w, h, mob] of [[390, 844, true], [1280, 800, false]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
    await load(setup());
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))`); await sleep(3200);
    check(await screenNow() === "secim", `${w}: seçim gecesi açılmadı`);
    const mid = await ev(`parseFloat(document.querySelector("#ec-open").textContent.slice(1).replace(",", "."))`);
    check(mid > 0 && mid < 100, `${w}: sayım ortada değil (${mid})`);
    await shot(`secim-orta-${w}`);
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))`); await sleep(900); // atla
    const fin = JSON.parse(await ev(`JSON.stringify({ res: JSON.parse(localStorage.getItem("cb.save")).pending.res, rows: [...document.querySelectorAll(".ec-row")].map(r => ({ id: r.dataset.id, pct: r.querySelector(".ec-pct b").textContent, won: r.classList.contains("won"), lead: r.classList.contains("lead") })), open: document.querySelector("#ec-open").textContent, go: !document.querySelector("#btn-ec-go").hidden, blocs: document.querySelectorAll(".ec-bloc").length, why: document.querySelectorAll("#ec-why li").length })`));
    check(fin.open === "%100,0", `${w}: sonuçta açılan sandık ${fin.open}`);
    for (const c of fin.res.cands) {
      const row = fin.rows.find(r => r.id === c.id);
      check(row && row.pct === "%" + c.pct.toFixed(1).replace(".", ","), `${w}: ${c.id} ekranda ${row?.pct}, motorda ${c.pct}`);
    }
    check(fin.rows.filter(r => r.won).map(r => r.id).join() === fin.res.winner, `${w}: mühür yanlış satırda`);
    check(fin.go && fin.blocs === 4 && fin.why >= 1, `${w}: döküm ya da Devam eksik`);
    await shot(`secim-son-${w}`);
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))`); await sleep(800);
    const after = await ev(`document.querySelector("#card .doc-konu")?.textContent || ""`);
    check(await screenNow() === "game" && /Seçim sonucu/.test(after), `${w}: Devam'dan sonra seçim sonucu kartı gelmedi (${after})`);
    console.log(w, fin.res.cands.map(c => `${c.id}:${c.pct}`).join(" "), "→", fin.res.winner);
  }
  // Seçim gecesinin ortasında sayfa kapanırsa "Kaldığım yerden" ekranı yeniden açar
  await load(setup());
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))`); await sleep(2500);
  await ev(`location.reload()`); await sleep(1400);
  await ev(`document.querySelector("#btn-resume").click()`); await sleep(900);
  check(await screenNow() === "secim", "kaldığım yerden seçim gecesini açmadı");
  console.log("kaldığım yerden:", await screenNow());
  // Erken seçim: esnaf tavan yapınca oyun bitmez, erken seçim gecesi açılır
  const s = E.newGame(); Object.assign(s.m, { h: 55, k: 50, e: 100, a: 50 }); s.month = 22; s.pending = { type: "erken" };
  s.cur = { id: "t", kind: "normal", who: "bekir", konu: "Deneme", text: "Deneme.", L: { t: "a", e: [0, 0, 0, 0], rel: {} }, R: { t: "b", e: [0, 0, 0, 0], rel: {} } };
  await send("Page.navigate", { url: PAGE }); await sleep(1200);
  await ev(`localStorage.clear(); localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(s))}); localStorage.setItem("cb.introSeen", "true"); location.reload()`); await sleep(1400);
  await ev(`document.querySelector("#btn-resume").click()`); await sleep(700);
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))`); await sleep(1500); // deneme kartı: erken seçim kartı gelir
  const early = await ev(`document.querySelector("#card .doc-konu")?.textContent || ""`);
  check(/Erken seçim/.test(early), `erken seçim kartı gelmedi (${early})`);
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))`); await sleep(1800);
  const title = await ev(`document.querySelector("#scr-secim h2").textContent`);
  check(await screenNow() === "secim" && /Erken/.test(title), `erken seçim gecesi açılmadı (${title})`);
  await shot("erken-secim");
  console.log("erken seçim:", title);
  // Prova kodu: oyunun ortasında klavyeden kod yazılınca seçim gecesi prova olarak açılır, oyun değişmez
  const mid = E.newGame(); mid.month = 10; mid.cur = E.materialize({ id: "t", who: "sevim", konu: "Prova öncesi", text: "Deneme.", L: { t: "Sol", e: [0, 0, 0, 0] }, R: { t: "Sağ", e: [0, 0, 0, 0] } }, mid, rng);
  await load(mid);
  const saveBefore = await ev(`localStorage.getItem("cb.save")`);
  for (const ch of "akparti") await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(ch)},bubbles:true}))`);
  await sleep(900);
  const pTitle = await ev(`document.querySelector("#scr-secim h2").textContent`);
  check(await screenNow() === "secim" && /prova/.test(pTitle), `prova açılmadı (${await screenNow()} · ${pTitle})`);
  await shot("prova");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))`); await sleep(700);
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))`); await sleep(700);
  const back = await ev(`document.querySelector("#card .doc-konu")?.textContent || ""`);
  check(await screenNow() === "game" && /Prova öncesi/.test(back), `provadan sonra aynı evraka dönülmedi (${back})`);
  check(await ev(`localStorage.getItem("cb.save")`) === saveBefore, "prova kaydı değiştirdi");
  // "a" tek başına basılınca yine sol seçeneği imzalar (kısa beklemeyle)
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}))`); await sleep(1400);
  const moved = JSON.parse(await ev(`localStorage.getItem("cb.save")`)).month;
  check(moved === 11, `"a" kısayolu çalışmadı (ay ${moved})`);
  console.log("prova:", pTitle, "· dönüş:", back, "· a kısayolu ay:", moved);
} catch (e) { errors.push("TEST: " + e.message); }
finally { console.log(errors.length ? errors.join("\n") : "hata yok"); try { ws?.close(); } catch { } chrome.kill(); setTimeout(() => process.exit(errors.length ? 1 : 0), 300); }
