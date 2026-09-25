// Ana menü testi: klavyeyle gezinme, bilgi kartı, ayarlar ve künye panelleri, aday kaydı, oyuna giriş.
// Ekran görüntüleri .cache/menu/ klasörüne yazılır. node tools/menu.mjs [çıktı klasörü] [adres]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { motor, sunucu } from "./lib/sayfa.mjs";

const OUT = process.argv[2] || fileURLToPath(new URL("../.cache/menu/", import.meta.url));
const srv = process.argv[3] ? null : await sunucu(); // önce `pnpm build`: dist/ sunulur
const PAGE = process.argv[3] || srv.url;
mkdirSync(OUT, { recursive: true });
const E = await motor(),
  { ADLAR } = E;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  PORT = 9347;
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
const key = k =>
  ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(k)},bubbles:true}))`);
const check = (ok, msg) => {
  if (!ok) errors.push("TEST: " + msg);
};
const screenNow = () =>
  ev(`["title","game","over","wall","help","pick","secim"].find(x => !document.querySelector("#scr-" + x).hidden)`);
const onItem = () => ev(`document.querySelector("#mn-list .mn-item.on")?.id || ""`);
// sahne katmanları dışında taşan ya da üst üste binen menü parçası var mı
const layout = () =>
  ev(`JSON.stringify((() => {
  const r = s => document.querySelector(s)?.getBoundingClientRect(), W = innerWidth, H = innerHeight, vis = s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; };
  const box = ["#mn-list", ".mn-logo", ".mn-foot"].concat(vis("#mn-board") ? ["#mn-board"] : []).concat(vis("#mn-info") ? ["#mn-info"] : []).map(s => [s, r(s)]);
  const out = box.filter(([, b]) => b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1).map(([s]) => s);
  const hit = []; for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) { const [a, A] = box[i], [b, B] = box[j]; if (A.left < B.right - 2 && B.left < A.right - 2 && A.top < B.bottom - 2 && B.top < A.bottom - 2) hit.push(a + "×" + b); }
  return { out, hit };
})())`);
const save = () => {
  const s = E.newGame();
  s.month = 26;
  s.m = { h: 62, k: 12, e: 50, a: 71 };
  E.draw(s, Math.random);
  return s;
};
const fresh = async (withSave, w, h, mobile) => {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: PAGE });
  await sleep(900);
  await ev(`localStorage.clear(); localStorage.setItem("cb.introSeen", "true"); localStorage.setItem("cb.avatar", '"baskan-05"');
    ${withSave ? `localStorage.setItem("cb.save", ${JSON.stringify(JSON.stringify(save()))});` : ""}
    localStorage.setItem("cb.best", JSON.stringify({ name: "Rekor Başkan", avatar: "baskan-02", months: 131, key: "sandik", term: 3 }));
    localStorage.setItem("cb.hall", JSON.stringify([{ gid: "a", name: "Rekor Başkan", avatar: "baskan-02", months: 131, key: "sandik", term: 3, at: 1 }, { gid: "b", name: "Terfi Başkan", avatar: "baskan-09", months: 70, key: "a100_mv", term: 2, at: 2 }]));
    location.reload()`);
  await sleep(1600);
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
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });

  for (const [w, h, mob] of [
    [390, 844, true],
    [360, 640, true],
    [1280, 800, false],
    [1920, 1080, false],
    [2560, 1080, false],
  ]) {
    await fresh(true, w, h, mob);
    check((await screenNow()) === "title", `${w}: menü açılmadı`);
    check((await onItem()) === "btn-resume", `${w}: kayıt varken ilk madde "Devam et" değil`);
    const L = JSON.parse(await layout());
    check(!L.out.length && !L.hit.length, `${w}×${h}: taşma ${L.out} · çakışma ${L.hit}`);
    const pic = JSON.parse(
      await ev(
        `JSON.stringify({ w: document.querySelector("#mn-img").naturalWidth, pal: document.querySelector("#mn-scene").dataset.pal, svg: document.querySelectorAll("#scr-title svg").length })`,
      ),
    );
    check(
      pic.w >= 1536 && ["aksam", "gece", "gun"].includes(pic.pal),
      `${w}: meydan resmi yüklenmedi ${JSON.stringify(pic)}`,
    );
    check(pic.svg <= 2, `${w}: menüde canlı SVG sahne kalmış (${pic.svg} svg)`); // yalnız logo bardağı ve ses simgesi
    await shot(`menu-${w}x${h}`);
  }
  // klavye: aşağı ok maddeyi değiştirir, bilgi kartı izler, sona gelince başa döner
  await fresh(true, 1280, 800, false);
  await key("ArrowDown");
  check(
    (await onItem()) === "btn-start" &&
      /Yeni dönem/.test(await ev(`document.querySelector("#mn-info h3")?.textContent`)),
    "↓ ile Yeni dönem seçilmedi",
  );
  for (let i = 0; i < 5; i++) await key("ArrowDown");
  check((await onItem()) === "btn-resume", "menü sona gelince başa dönmedi");
  await key("ArrowUp");
  check((await onItem()) === "btn-kunye", "↑ ile en alttaki madde seçilmedi");
  const saveCard = await ev(
    `(document.querySelector("#btn-resume").focus(), document.querySelector("#mn-info .mi-meters")?.children.length || 0)`,
  );
  check(saveCard === 5, `kayıt kartında 4 gösterge ve anket yok (${saveCard})`);
  await shot("menu-kart-kayit");
  await ev(`document.querySelector("#btn-wall").focus()`);
  check(
    (await ev(`document.querySelectorAll("#mn-info .mi-wall li").length`)) === 2,
    "bilgi kartında eski başkanlar listesi yok",
  );
  // ayarlar: ses düzeyi ve titreşim kalıcı, Escape paneli kapatır ve odağı geri verir
  await ev(`(b => { b.focus(); b.click(); })(document.querySelector("#btn-ayar"))`);
  await sleep(400);
  check(
    await ev(`!document.querySelector("#mn-ayar").hidden && document.querySelector("#mn-list").inert`),
    "ayarlar paneli açılmadı",
  );
  await shot("menu-ayarlar");
  await ev(
    `(() => { const r = document.querySelector("#ay-vol"); r.value = 30; r.dispatchEvent(new Event("input", { bubbles: true })); const t = document.querySelector("#ay-tit"); t.click(); })()`,
  );
  check(
    await ev(`localStorage.getItem("cb.volume") === "30" && localStorage.getItem("cb.vibrate") === "false"`),
    "ses düzeyi ya da titreşim kaydedilmedi",
  );
  // kayıtları sil: ilk basış yalnız uyarır
  await ev(`document.querySelector("#ay-sil").click()`);
  check(
    await ev(`!!localStorage.getItem("cb.save") && document.querySelector("#ay-sil").classList.contains("armed")`),
    "ilk basışta silindi ya da uyarmadı",
  );
  await key("Escape");
  await sleep(300);
  check(
    await ev(`document.querySelector("#mn-ayar").hidden && document.activeElement.id === "btn-ayar"`),
    "Escape paneli kapatmadı ya da odak geri gelmedi",
  );
  await ev(`(b => { b.focus(); b.click(); })(document.querySelector("#btn-kunye"))`);
  await sleep(400);
  check(/Sürüm|20\d\d/.test(await ev(`document.querySelector("#kn-ver").textContent`)), "künyede sürüm yok");
  await shot("menu-kunye");
  await key("Escape");
  await sleep(300);
  // aday kaydı: vesikalık seç, ad yaz, mazbatayı al → tanıtımsız oyun başlar
  await ev(`document.querySelector("#btn-start").click()`);
  await sleep(600);
  check((await screenNow()) === "pick", "Yeni dönem aday kaydını açmadı");
  check(/kapanır/.test(await ev(`document.querySelector("#pick-note").textContent`)), "kayıt varken uyarı yok");
  await key("ArrowRight");
  const ak = JSON.parse(
    await ev(
      `JSON.stringify({ ls: JSON.parse(localStorage.getItem("cb.avatar")), on: document.querySelector('#picks [aria-checked="true"]')?.dataset.id, img: document.querySelector("#avatar-img").src.includes("baskan-06") || document.querySelector("#avatar-img").src.startsWith("data:"), bio: document.querySelector("#ak-bio").textContent.length })`,
    ),
  );
  check(
    ak.ls === "baskan-06" && ak.on === "baskan-06" && ak.img && ak.bio > 20,
    `→ vesikalığı değiştirmedi ${JSON.stringify(ak)}`,
  );
  await shot("aday-1280");
  await ev(
    `(() => { const i = document.querySelector("#in-name"); i.value = "Test Başkan"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  await ev(`document.querySelector("#btn-go").click()`);
  await sleep(200);
  await ev(`document.querySelector("#btn-sessiz").click()`); // beyanname: sessiz kampanya
  await sleep(900);
  check(
    (await screenNow()) === "game" &&
      (await ev(`document.querySelector("#leader-name").textContent`)) === "Test Başkan",
    "mazbata oyunu başlatmadı ya da ad yanlış",
  );
  // oyundan menüye dönüş, Devam et oyuna geri götürür
  await ev(`document.querySelector("#btn-menu").click()`);
  await sleep(600);
  check((await screenNow()) === "title" && (await onItem()) === "btn-resume", "menüye dönüşte Devam et seçili değil");
  await ev(`document.querySelector("#btn-resume").click()`);
  await sleep(1600);
  check((await screenNow()) === "game", "Devam et oyuna dönmedi");
  // telefonda aday kaydı
  await fresh(false, 390, 844, true);
  check((await onItem()) === "btn-start", "kayıt yokken ilk madde Yeni dönem değil");
  await ev(`document.querySelector("#btn-start").click()`);
  await sleep(600);
  await shot("aday-390");
  check(
    await ev(
      `(() => { const b = document.querySelector("#btn-go").getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.top >= 0; })()`,
    ),
    "telefonda Mazbatayı al görünmüyor",
  );
  // ad zarı: vesikalığın cinsine uygun ad, art arda tekrar yok, klavyeyle de atılır.
  // Ad kendiliğinden değişmez: vesikalık değişince zarın adı da yazılan ad da kalır; zara basınca yeni vesikalığın cinsine
  // uygun ad gelir. Zar kutunun sağında, yazının üstüne binmez.
  const nm = () => ev(`document.querySelector("#in-name").value`);
  const lsName = () => ev(`JSON.parse(localStorage.getItem("cb.name") || '""')`);
  const cinsNow = async () => E.BASKANLAR[await ev(`JSON.parse(localStorage.getItem("cb.avatar"))`)].cins;
  const zar = () => ev(`document.querySelector("#btn-ad-zar").click()`);
  const pick = id => ev(`document.querySelector('#picks [data-id="${id}"]').click()`);
  const typeName = v =>
    ev(
      `(() => { const i = document.querySelector("#in-name"); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
    );
  const first = n => n.split(" ")[0],
    other = { k: "e", e: "k" },
    portrait = { k: "baskan-01", e: "baskan-05" };
  const zarGeo = () =>
    ev(`JSON.stringify((() => {
    const inp = document.querySelector("#in-name"), i = inp.getBoundingClientRect(), b = document.querySelector("#btn-ad-zar").getBoundingClientRect();
    return { inside: b.left >= i.left + i.width / 2 && b.right <= i.right + 1 && b.top >= i.top - 4 && b.bottom <= i.bottom + 4, clear: parseFloat(getComputedStyle(inp).paddingRight) >= b.width,
      fits: inp.scrollWidth <= inp.clientWidth + 1, font: parseFloat(getComputedStyle(inp).fontSize), w: Math.round(b.width) };
  })())`);
  check((await cinsNow()) === "e", "zar testi erkek vesikalıkla başlamalı (baskan-05)");
  const rolls = [];
  for (let i = 0; i < 12; i++) {
    await zar();
    rolls.push(await nm());
  }
  check(
    rolls.every(n => /^\S+ \S+$/u.test(n) && ADLAR.e.includes(first(n))),
    `zar erkek vesikalığa uygun ad vermedi: ${rolls.join(", ")}`,
  );
  check(
    rolls.every((n, i) => !i || n !== rolls[i - 1]),
    `zar art arda aynı adı verdi: ${rolls.join(", ")}`,
  );
  check((await lsName()) === rolls.at(-1), "zarın adı yazılan ad gibi saklanmadı");
  check(
    /Mazbataya/.test(await ev(`document.querySelector("#pick-note").textContent`)),
    "zardan sonra not güncellenmedi",
  );
  await ev(`document.querySelector("#btn-ad-zar").focus()`);
  const beforeKey = await nm();
  for (const type of ["keyDown", "keyUp"])
    await send("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      ...(type === "keyDown" ? { text: "\r" } : {}),
    });
  await sleep(100);
  check((await nm()) !== beforeKey && (await screenNow()) === "pick", "zar klavyeyle (Enter) atılmadı");
  await shot("aday-390-zar-odak");
  await ev(`document.activeElement.blur()`);
  for (const [w, h, mob] of [
    [390, 844, true],
    [1280, 800, false],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
    await sleep(300);
    // cins değişimi: ortak (iki cinse konan) ad çıkarsa değişmesi gerekmez, o yüzden önce ortak olmayan ad
    const c = await cinsNow();
    for (let i = 0; i < 30 && ADLAR[other[c]].includes(first(await nm())); i++) await zar();
    const before = await nm();
    await shot(`aday-${w}-zar`);
    const g = JSON.parse(await zarGeo());
    check(g.inside && g.clear, `${w}: zar ad kutusunun sağında değil ya da yazıya biniyor ${JSON.stringify(g)}`);
    await pick(portrait[other[c]]);
    await sleep(150);
    check(
      (await nm()) === before && (await lsName()) === before,
      `${w}: vesikalık değişince zarın adı kendiliğinden değişti (${before} → ${await nm()})`,
    );
    await zar();
    const after = await nm();
    check(
      after !== before && ADLAR[other[c]].includes(first(after)) && (await lsName()) === after,
      `${w}: zar yeni vesikalığın cinsine uygun ad vermedi (${before} → ${after})`,
    );
    // oyuncunun yazdığı ad vesikalık değişince de kalır
    await typeName("Ahmet Deneme");
    await pick(portrait[c]);
    await pick(portrait[other[c]]);
    await sleep(150);
    check(
      (await nm()) === "Ahmet Deneme" && (await lsName()) === "Ahmet Deneme",
      `${w}: yazılan ad vesikalık değişince değişti`,
    );
    // en uzun ad (24 harf) kutuya sığar, zar yine yerinde
    await typeName("Şerafettin Karakavaklıoğ");
    await sleep(100);
    const L = JSON.parse(await zarGeo());
    check(L.fits && L.inside && L.clear && L.font >= 11, `${w}: 24 harflik ad kutuya sığmadı ${JSON.stringify(L)}`);
    await shot(`aday-${w}-uzun`);
    await zar();
    // rastgele aday: başka bir hazır aday gelir, ad da onun adı olur (kutu boşalır, silik yazı adayın adı)
    const av0 = await ev(`JSON.parse(localStorage.getItem("cb.avatar"))`);
    await ev(`document.querySelector("#btn-zar").click()`);
    await sleep(150);
    const av1 = await ev(`JSON.parse(localStorage.getItem("cb.avatar"))`);
    const ph = await ev(`document.querySelector("#in-name").placeholder`);
    check(
      av1 !== av0 && (await nm()) === "" && (await lsName()) === "" && ph === E.BASKANLAR[av1].ad,
      `${w}: rastgele aday adı da değiştirmedi (${av0} → ${av1}, kutu "${await nm()}", silik "${ph}")`,
    );
  }
  console.log("menü: gezinme, paneller, ayarlar, aday kaydı, ad zarı ve oyuna giriş denendi");
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
