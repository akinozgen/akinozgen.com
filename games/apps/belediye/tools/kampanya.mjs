// Seçim beyannamesi testi: aday kaydından sonra en çok üç söz, canlı kampanya anketi, geri dönüp gelince seçim kalır;
// sandığa gidilince seçim gecesi (aday etiketiyle) ve açılış evrakı, sessiz kampanyada doğrudan düşük başlangıç.
// Ekran görüntüleri .cache/kampanya/ klasörüne yazılır. node tools/kampanya.mjs [çıktı klasörü] [adres]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { motor, sunucu } from "./lib/sayfa.mjs";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/kampanya/", import.meta.url));
const srv = process.argv[3] ? null : await sunucu(); // önce `pnpm build`: dist/ sunulur
const PAGE = process.argv[3] || srv.url;
mkdirSync(OUT, { recursive: true });
const E = await motor();
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  PORT = 9351;
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--mute-audio",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${OUT}/profile`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws,
  id = 0;
const pend = new Map(),
  errors = [];
const send = (m, p = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async e =>
  (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async name => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
};
const check = (ok, msg) => {
  if (!ok) errors.push("TEST: " + msg);
};
const screenNow = () =>
  ev(
    `["title","game","over","wall","help","pick","kampanya","secim"].find(x => !document.querySelector("#scr-" + x).hidden)`,
  );
const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const until = async (expr, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await sleep(150);
  }
  return false;
};
const saveNow = async () => JSON.parse((await ev(`localStorage.getItem("cb.save")`)) || "null");
// menüden aday kaydına, oradan beyannameye
const toKampanya = async (w, h, mobile) => {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: PAGE });
  await sleep(900);
  await ev(
    `localStorage.clear(); localStorage.setItem("cb.introSeen", "true"); localStorage.setItem("cb.avatar", '"baskan-21"'); location.reload()`,
  );
  await sleep(1600);
  await click("#btn-start");
  await until(`!document.querySelector("#scr-pick").hidden`);
  await click("#btn-go");
  await sleep(250);
};
try {
  let url;
  for (let t = 0; t < 50 && !url; t++) {
    try {
      url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
        x => x.type === "page",
      )?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await sleep(200);
  }
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id);
      pend.delete(d.id);
      d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
    }
    if (d.method === "Runtime.exceptionThrown")
      errors.push("İSTİSNA: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  // hareket azaltma: seçim gecesi üç adımda biter
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  // ── beyanname: altı söz, en çok üçü, anket motorla aynı
  for (const [w, h, mob] of [
    [390, 844, true],
    [1280, 800, false],
  ]) {
    await toKampanya(w, h, mob);
    check((await screenNow()) === "kampanya", `${w}: Kampanyaya başla beyannameyi açmadı`);
    const ids = JSON.parse(
      await ev(`JSON.stringify([...document.querySelectorAll("#bn-list .bn-v")].map(b => b.dataset.id))`),
    );
    check(
      ids.length === Math.min(6, E.VAATLER.length) && ids.every(i => E.VAAT[i]),
      `${w}: beyannamede altı söz yok (${ids})`,
    );
    check(new Set(ids).size === ids.length, `${w}: aynı söz iki kez`);
    check(
      (await ev(`document.querySelector("#bn-sans").textContent`)) === `%${E.KAMPANYA.taban}`,
      `${w}: sözsüz anket tabanda değil`,
    );
    const secim = ids.slice(0, Math.min(4, ids.length));
    for (const i of secim) await click(`#bn-list [data-id="${i}"]`);
    const on = JSON.parse(
      await ev(
        `JSON.stringify([...document.querySelectorAll("#bn-list .bn-v[aria-checked=true]")].map(b => b.dataset.id))`,
      ),
    );
    check(on.length === Math.min(E.VAAT_MAX, ids.length), `${w}: en çok üç söz kuralı işlemedi (${on})`);
    const sans = E.kampanyaSans(on);
    check((await ev(`document.querySelector("#bn-sans").textContent`)) === `%${sans}`, `${w}: anket %${sans} değil`);
    // sığma: yatay taşma yok, düğmeler ekranda
    const geo = JSON.parse(
      await ev(`JSON.stringify((() => {
      const W = innerWidth, over = [...document.querySelectorAll("#scr-kampanya *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > W + 1); }).length;
      const b = document.querySelector("#btn-sandik").getBoundingClientRect();
      return { over, btn: b.bottom <= innerHeight + 1 && b.top >= 0 };
    })())`),
    );
    check(geo.over === 0 && geo.btn, `${w}: beyanname taşıyor ya da düğme ekranda değil ${JSON.stringify(geo)}`);
    await shot(`beyanname-${w}`);
    // geri gidip gelince aynı sözler ve seçim
    await click("#btn-bn-back");
    await sleep(150);
    check((await screenNow()) === "pick", `${w}: Geri aday kaydına dönmedi`);
    await click("#btn-go");
    await sleep(150);
    const again = JSON.parse(
      await ev(
        `JSON.stringify([...document.querySelectorAll("#bn-list .bn-v")].map(b => b.dataset.id + (b.getAttribute("aria-checked") === "true" ? "*" : "")))`,
      ),
    );
    check(
      again.join() === ids.map(i => i + (on.includes(i) ? "*" : "")).join(),
      `${w}: geri dönünce beyanname değişti (${again})`,
    );
    // Escape de aday kaydına döner
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(150);
    check((await screenNow()) === "pick", `${w}: Escape aday kaydına dönmedi`);
  }

  // ── sandığa git: seçim gecesi, aday etiketi, açılış evrakı, başlangıç ve sözler
  for (let tur = 0; tur < 2; tur++) {
    await toKampanya(390, 844, true);
    const ids = JSON.parse(
      await ev(`JSON.stringify([...document.querySelectorAll("#bn-list .bn-v")].map(b => b.dataset.id))`),
    );
    const vz = ids.slice(0, Math.min(3, ids.length));
    for (const i of vz) await click(`#bn-list [data-id="${i}"]`);
    await click("#btn-sandik");
    check(await until(`!document.querySelector("#scr-secim").hidden`, 5000), "sandığa git seçim gecesini açmadı");
    check(
      await until(
        `[...document.querySelectorAll(".tv-lbl")].some(e => /Belediye başkan adayı/.test(e.textContent))`,
        8000,
      ),
      "seçim gecesinde oyuncu 'Belediye başkan adayı' değil",
    );
    check(
      !(await ev(`/yeniden aday/.test(document.querySelector("#scr-secim").textContent)`)),
      "ilk seçimde 'yeniden aday' yazıyor",
    );
    check(await until(`!document.querySelector("#btn-ec-go").hidden`, 90000), "seçim gecesi bitmedi");
    await shot(`secim-gecesi-${tur}`);
    const neden = await ev(`document.querySelector("#scr-secim").textContent`);
    check(/Kampanya anketi/.test(neden), "sonuçta kampanya anketi satırı yok");
    await click("#btn-ec-go");
    check(await until(`!document.querySelector("#scr-game").hidden`, 5000), "seçim gecesinden oyuna geçilmedi");
    await sleep(400);
    const konu = await ev(`document.querySelector("#card .doc-konu")?.textContent || ""`);
    const s = await saveNow();
    check(s && (s.acilis === "zafer" || s.acilis === "kilpayi"), `açılış türü yok (${s?.acilis})`);
    if (s) {
      check(
        JSON.stringify(s.m) === JSON.stringify(E.ACILIS[s.acilis].m),
        `${s.acilis}: göstergeler ayarla aynı değil ${JSON.stringify(s.m)}`,
      );
      check(JSON.stringify(s.vaatler) === JSON.stringify(vz), `sözler kayda geçmedi (${s.vaatler})`);
      check(s.cnt.vaat === vz.length, "vaat sayacı söz sayısı değil");
      check(
        vz.every(i => s.queue.some(q => q.id === E.VAAT[i].kart)),
        "sözlerin hesap evrakı takvimde yok",
      );
      check(
        new RegExp(s.acilis === "zafer" ? "Ezici zafer" : "Kıl payı").test(konu),
        `açılış evrakı yanlış: "${konu}"`,
      );
    }
    await shot(`acilis-${tur}`);
  }

  // ── sessiz kampanya: seçim gecesi yok, düşük başlar, söz yok
  await toKampanya(390, 844, true);
  await click(`#bn-list .bn-v`);
  await click("#btn-sessiz");
  await sleep(500);
  check((await screenNow()) === "game", "sessiz kampanya oyunu başlatmadı");
  const s = await saveNow();
  check(
    s?.acilis === "sessiz" && JSON.stringify(s.m) === JSON.stringify(E.ACILIS.sessiz.m),
    "sessiz başlangıç ayarla aynı değil",
  );
  check(!s?.vaatler && !s?.cnt.vaat, "sessiz kampanyada söz verilmiş");
  check(
    /Sessiz zafer/.test(await ev(`document.querySelector("#card .doc-konu")?.textContent || ""`)),
    "sessiz açılış evrakı yok",
  );
  await shot("sessiz");
  console.log("beyanname: altı söz, üç sınırı, anket, geri/Escape, sandık yolu (iki tur) ve sessiz kampanya denendi");
} catch (e) {
  errors.push("TEST: " + e.message);
} finally {
  console.log(errors.length ? errors.join("\n") : "hata yok");
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  srv?.kapat();
  setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
}
