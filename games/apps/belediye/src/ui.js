// ─── Arayüz ───────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LS = {
  get(k, d) { try { const v = localStorage.getItem("cb." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cb." + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem("cb." + k); } catch { } },
};
const rngOf = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const vibrate = ms => { try { navigator.vibrate?.(ms); } catch { } };

let S = null, busy = false, screen = "title", lastOver = null, wallFrom = "title";
// Derlemede web sürümü için true yapılır (service worker kaydı)
const STANDALONE = /*STANDALONE*/false;
// Vesikalıklar web-src/portraits/ altındaki resimlerdir; tek dosyalık kopyalarda derleyici hepsini PORTRAITS'e gömer.
const PORTRAITS = /*PORTRAITS*/null;
const MAYORS = Object.keys(BASKANLAR);
const photoSrc = id => PORTRAITS?.[id] || `portraits/${id}.webp`;
const photo = id => `<img src="${photoSrc(id)}" alt="" decoding="async" draggable="false">`;

// ─── Ses: hepsi WebAudio ile üretiliyor ───────────────────────────────────
const snd = (() => {
  let ctx = null, master = null, on = LS.get("sound", true);
  const ks = {};
  const init = () => {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination); } catch { ctx = null; }
  };
  const ready = () => on && ctx && ctx.state !== "closed";
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const noise = dur => { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; };
  const pluckBuf = f => {
    if (ks[f]) return ks[f];
    const sr = ctx.sampleRate, N = Math.round(sr / f), len = Math.floor(sr * 1.8), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (let i = 0, j = 0; i < len; i++, j = (j + 1) % N) { const a = ring[j]; d[i] = a; ring[j] = .4985 * (a + ring[(j + 1) % N]); }
    return (ks[f] = buf);
  };
  const pluck = (f, t, v = .5) => { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = pluckBuf(f); g.gain.value = v; s.connect(g).connect(master); s.start(t); };
  return {
    get on() { return on; },
    unlock() { if (on) { init(); ctx?.resume?.(); } },
    toggle() { on = !on; LS.set("sound", on); if (on) { init(); ctx?.resume?.(); } return on; },
    stamp() {
      if (!ready()) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + .14); env(g, t, .004, .9, .2); o.connect(g).connect(master); o.start(t); o.stop(t + .3);
      const n = noise(.09), f = ctx.createBiquadFilter(), g2 = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 1500; env(g2, t, .002, .55, .07); n.connect(f).connect(g2).connect(master); n.start(t);
    },
    paper() {
      if (!ready()) return; const t = ctx.currentTime + .02;
      const n = noise(.3), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.setValueAtTime(1800, t); f.frequency.linearRampToValueAtTime(4200, t + .22); f.Q.value = .8; env(g, t, .05, .16, .2); n.connect(f).connect(g).connect(master); n.start(t);
    },
    clink() {
      if (!ready()) return; const t = ctx.currentTime + .05;
      [2637, 3951, 5274].forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = fr; env(g, t + i * .004, .002, .12 / (i + 1), .5); o.connect(g).connect(master); o.start(t); o.stop(t + .7); });
    },
    // Hicaz dörtlüsü: Re, Mi♭, Fa♯, Sol
    hicaz() { if (!ready()) return; const t = ctx.currentTime + .1; [[440, 0], [392, .3], [369.99, .6], [311.13, .9], [369.99, 1.25], [311.13, 1.5], [293.66, 1.8]].forEach(([f, d]) => pluck(f, t + d, .45)); },
    win() { if (!ready()) return; const t = ctx.currentTime + .08; [[293.66, 0], [369.99, .12], [440, .24], [587.33, .38], [587.33, .52]].forEach(([f, d]) => pluck(f, t + d, .4)); },
  };
})();

// ─── Göstergeler ──────────────────────────────────────────────────────────
const GLYPH = {
  h: { box: [6.5, 34], det: "",
    d: "M20 6.5a5.2 5.2 0 1 1 0 10.4a5.2 5.2 0 1 1 0-10.4Z M10.5 34C10.5 24.5 14.6 19.5 20 19.5S29.5 24.5 29.5 34Z M8 11a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2Z M2.5 32C2.5 25 4.8 21 8 21c1.8 0 3.2 1 4.2 2.6C10.6 26 9.6 29 9.4 32Z M32 11a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2Z M37.5 32C37.5 25 35.2 21 32 21c-1.8 0-3.2 1-4.2 2.6C29.4 26 30.4 29 30.6 32Z" },
  k: { box: [7, 36], det: `<circle cx="20" cy="20" r="6.2"/><path d="M20 13.8v2.4M20 23.8v2.4M13.8 20h2.4M23.8 20h2.4M9 12v16"/>`,
    d: "M6 7H34a2 2 0 0 1 2 2V31a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z M8 33h5v3H8Z M27 33h5v3h-5Z" },
  e: { box: [5, 35], det: `<path d="M16.5 35V25h7v10M10 21h4v5h-4zM26 21h4v5h-4zM13.5 5l-1.8 7M20 5v7M26.5 5l1.8 7"/>`,
    d: "M8 5H32L36 12H4Z M4 12q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0Z M7 17H33V35H7Z" },
  a: { box: [3, 36], det: `<circle cx="20" cy="8.2" r="1.5"/>`,
    d: "M20 3L37 11H3Z M4 12H36V15.5H4Z M7 17H11V31H7Z M14.3 17H18.3V31H14.3Z M21.7 17H25.7V31H21.7Z M29 17H33V31H29Z M3 32H37V36H3Z" },
  // anket: sandık, içine oy pusulası giriyor
  p: { box: [3, 36], det: `<path d="M12 18h16M16.5 9.2l2.4 2.4 4.6-5"/>`,
    d: "M13 3H27V16H13Z M4 16H36V20H4Z M6 21H34V35a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z" },
};
const meterInner = (k, ad) => { const g = GLYPH[k]; return `
  <div class="mi"><svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="cp-${k}"><rect class="lvl" x="-2" y="20" width="44" height="44"/></clipPath></defs>
  <path class="ghost" d="${g.d}"/><path class="fill" d="${g.d}" clip-path="url(#cp-${k})"/><g class="det">${g.det}</g></svg><span class="fx" aria-hidden="true"></span></div>
  <div class="mv"><b class="num">50</b><span class="lbl">${ad}</span></div>
  <span class="pv" aria-hidden="true"></span>`; };
function buildMeters() {
  $("#meters").innerHTML = METERS.map(k => `<div class="meter" id="m-${k}" role="img" aria-label="${METER_AD[k]}">${meterInner(k, METER_AD[k])}</div>`).join("");
  $("#poll").innerHTML = meterInner("p", "Anket");
}
function tweenY(rect, to) {
  const from = rect._y ?? to, t0 = performance.now(), dur = reduced ? 1 : 700;
  cancelAnimationFrame(rect._raf);
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    rect._y = from + (to - from) * e; rect.setAttribute("y", rect._y.toFixed(2));
    if (p < 1) rect._raf = requestAnimationFrame(step);
  };
  rect._raf = requestAnimationFrame(step);
}
function tweenNum(el, to) {
  const from = el._v ?? to, t0 = performance.now(), dur = reduced ? 1 : 650;
  cancelAnimationFrame(el._raf);
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el._v = Math.round(from + (to - from) * e); el.textContent = el._v;
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
// Gösterge üstünde yükselip kaybolan "+8 / −12" fişi
function chip(k, v, tick) {
  if (!v) return;
  const box = $("#m-" + k + " .fx"), c = document.createElement("span");
  c.className = "chip " + (v > 0 ? "up" : "down") + (tick ? " tick" : "");
  c.textContent = (tick ? "↻ " : "") + (v > 0 ? "+" : "−") + Math.abs(v);
  box.appendChild(c);
  setTimeout(() => c.remove(), 1700);
}
// d: kararın etkisi · td: o ay işleyen kararların etkisi (biraz sonra gösterilir)
function setMeters(d, td) {
  METERS.forEach((k, i) => {
    const el = $("#m-" + k), v = S.m[k], g = GLYPH[k];
    tweenY(el.querySelector(".lvl"), g.box[0] + (1 - v / 100) * (g.box[1] - g.box[0]));
    tweenNum(el.querySelector(".num"), v);
    el.classList.toggle("danger", v <= 15 || (k !== "h" && v >= 85));
    el.classList.toggle("glory", k === "h" && v >= 85);
    el.setAttribute("aria-label", `${METER_AD[k]}: 100 üzerinden ${v}`);
    const tot = (d?.[i] || 0) + (td?.[i] || 0);
    if (tot) {
      el.classList.remove("up", "down"); void el.offsetWidth; el.classList.add(tot > 0 ? "up" : "down");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("up", "down"), 900);
    }
    if (d?.[i]) chip(k, d[i]);
    if (td?.[i]) setTimeout(() => chip(k, td[i], true), reduced ? 0 : 560);
  });
}
// Önizleme: ▲ artar ▼ azalır, ok sayısı büyüklük; renk: dengeye yaklaştırır / uzaklaştırır / tehlikeye sokar
function showHints(side) {
  METERS.forEach((k, i) => {
    const pv = $("#m-" + k + " .pv"), v = side && S?.cur ? S.cur[side].e[i] : 0;
    if (!v) { pv.className = "pv"; pv.textContent = ""; return; }
    const n = Math.abs(v) >= 15 ? 3 : Math.abs(v) >= 8 ? 2 : 1, cur = S.m[k], nv = cur + v;
    const closer = Math.abs(nv - 50) < Math.abs(cur - 50);
    const tone = k === "h" && v > 0 ? (cur < 35 ? "good" : "neutral")
      : nv <= 12 || nv >= 88 ? "bad" : closer && Math.abs(cur - 50) >= 15 ? "good" : !closer && (nv <= 25 || nv >= 75) ? "warn" : "neutral";
    pv.className = "pv on " + tone;
    pv.textContent = (v > 0 ? "▲" : "▼").repeat(n);
  });
  $("#ch-L").classList.toggle("hot", side === "L");
  $("#ch-R").classList.toggle("hot", side === "R");
}
const etkiKisa = e => METERS.map((k, i) => (e?.[i] ? `${METER_AD[k]} ${e[i] > 0 ? "+" : "−"}${Math.abs(e[i])}` : null)).filter(Boolean).join(", ");
// Yürürlükteki kararlar: sığarsa sabit durur, sığmazsa haber bandı gibi akar
function renderOngoing() {
  const box = $("#ongo"), list = $("#ongo-list"), items = S?.ongoing || [];
  box.classList.toggle("empty", !items.length); // şerit hep yerinde, evrak kaymaz
  const was = list.querySelector(".ongo-track")?.getAnimations?.()[0]?.currentTime ?? 0;
  const html = items.length ? items.map(o => {
    const per = etkiKisa(o.e);
    const after = o.done ? ` → ${etkiKisa(o.done)}` : o.doneCard ? " → sürpriz" : "";
    const tail = (o.left != null ? `${o.left} ay` : "süresiz") + after;
    return `<span class="pol${o.proj ? " proj" : ""}"><b>${esc(o.ad)}</b>${per ? `<i>${esc(per)}/ay</i>` : ""}<em>${esc(tail)}</em></span>`;
  }).join("") : `<span class="pol none">Her ay işleyen karar yok</span>`;
  list.innerHTML = `<div class="ongo-track">${html}</div>`;
  list.dataset.html = html;
  fitTicker(was);
}
function fitTicker(at = 0) {
  const list = $("#ongo-list"), track = list.querySelector(".ongo-track");
  if (!track) return;
  track.innerHTML = list.dataset.html;
  track.classList.remove("run"); list.classList.remove("moving");
  const w = track.scrollWidth;
  if (reduced || w <= list.clientWidth + 1) return;
  const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5;
  track.insertAdjacentHTML("beforeend", `<span class="tgap" aria-hidden="true"></span><span class="tcopy" aria-hidden="true">${list.dataset.html}</span>`);
  const dist = w + gap, pxPerSec = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.6;
  track.style.setProperty("--dist", dist + "px");
  track.style.setProperty("--dur", (dist / pxPerSec).toFixed(2) + "s");
  track.classList.add("run"); list.classList.add("moving");
  const anim = track.getAnimations?.()[0];
  if (anim && at) anim.currentTime = at % (dist / pxPerSec * 1000);
}
let fitT = 0;
addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(() => { if (screen === "game") fitTicker(); }, 150); });
// ─── Olay günlüğü: her karar bir kayıt, ardından gelen tepkiler altına eklenir ─
// Geniş ekranda sağda hep açık (toast yerine geçer), dar ekranda çekmecede; kayıt oyunla birlikte saklanır.
const LOG_MAX = 40, wideLog = matchMedia("(min-width: 1100px)");
let logUnread = 0;
function journalAdd(card, side, res, m) {
  if (!S || card.kind === "intro" || card.kind === "ending") return;
  (S.journal ||= []).push({ m, who: card.who, konu: card.konu, side, t: card[side].t, e: res.d, notes: [] });
  if (S.journal.length > LOG_MAX) S.journal.shift();
  renderLog(true);
}
function journalNote(html, cls) {
  const last = S?.journal?.at(-1);
  if (!last) return;
  last.notes.push({ html, cls });
  if (!S.over) LS.set("save", S);
  renderLog(true);
}
function renderLog(fresh) {
  const J = S?.journal || [];
  // her evrak bir ay: tarih kaydın köşesinde, başlık olarak yalnız yıllar
  let html = "", year = null;
  for (let i = J.length - 1; i >= 0; i--) {
    const j = J[i], P = PEOPLE[j.who], date = dateLabel(j.m), yr = date.split(" ").pop();
    if (yr !== year) { year = yr; html += `<li class="lg-m">${esc(yr)}</li>`; }
    const eff = METERS.map((k, n) => (j.e?.[n] ? `<span class="${j.e[n] > 0 ? "p" : "n"}">${METER_AD[k]} ${j.e[n] > 0 ? "+" : "−"}${Math.abs(j.e[n])}</span>` : "")).join("");
    html += `<li class="lg-e${fresh && i === J.length - 1 ? " new" : ""}">
      <div class="lg-d"><b>${esc(P?.ad || "")}</b><span>${esc(j.konu)}</span><time>${esc(date.replace(/ \d+$/, ""))}</time></div>
      <div class="lg-t"><i class="ink ${j.side}" aria-hidden="true"></i>“${esc(j.t)}”</div>
      ${eff ? `<div class="lg-x">${eff}</div>` : ""}${j.notes.map(n => `<div class="lg-n ${n.cls}">${n.html}</div>`).join("")}</li>`;
  }
  $("#log-list").innerHTML = html || `<li class="lg-empty">Masaya henüz evrak gelmedi. İmzaladığınız her karar ve ardından olanlar buraya yazılır.</li>`;
  if (fresh && !wideLog.matches && !$("#log").classList.contains("open")) logUnread++;
  const n = $("#log-n"); n.hidden = !logUnread; n.textContent = logUnread > 9 ? "9+" : logUnread;
}
function openLog(open) {
  const log = $("#log"), btn = $("#btn-log");
  if (open === log.classList.contains("open")) return;
  log.classList.toggle("open", open); $("#log-scrim").classList.toggle("on", open);
  btn.setAttribute("aria-expanded", String(open));
  if (open) { logUnread = 0; renderLog(false); $("#log-list").scrollTop = 0; $("#btn-log-x").focus(); }
  else if (!wideLog.matches) btn.focus();
}
function toast(html, cls = "") {
  journalNote(html, cls);
  if (wideLog.matches) return; // geniş ekranda günlük zaten görünüyor
  const box = $("#toasts"), t = document.createElement("div");
  t.className = "toast " + cls; t.innerHTML = html; box.appendChild(t);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => t.classList.add("out"), 2300);
  setTimeout(() => t.remove(), 2800);
}
// Bir gösterge tehlike bölgesine yeni girdiyse uyar
function dangerToast(before) {
  const risky = (k, v) => v <= 15 || (k !== "h" && v >= 85);
  const hot = METERS.filter(k => risky(k, S.m[k]) && !risky(k, before[k]));
  hot.forEach((k, i) => setTimeout(() => toast(`<b>Dikkat</b>${METER_AD[k]} ${S.m[k] <= 15 ? "dibe yaklaşıyor" : k === "e" ? "tavana dayanıyor, erken seçim kapıda" : "tavana dayanıyor"}<span class="tr n">${S.m[k]}</span>`, "warn"), 900 + i * 250));
  if (S.m.h >= 85 && before.h < 85) setTimeout(() => toast(`<b>Halk</b>sizi bağrına bastı; sandık kurulsa kazanırsınız<span class="tr p">${S.m.h}</span>`, "ev"), 900);
}
function reactions(c, res) {
  for (const [w, dv] of Object.entries(res.rel || {})) {
    const P = PEOPLE[w]; if (!P) continue;
    const pool = dv > 0 ? (P.pos || REACT.pos) : (P.neg || REACT.neg);
    const line = w === c.who ? `“${pickOne(pool)}”` : dv > 0 ? "bunu duydu, memnun kaldı." : "bunu duydu, kırıldı.";
    toast(`<b>${esc(P.ad)}</b>${esc(line)}<span class="tr ${dv > 0 ? "p" : "n"}">${dv > 0 ? "▲" : "▼"} ${esc(REL_AD[S.rel[w] || 0])}</span>`);
  }
  (res.events || []).forEach((ev, i) => {
    const sum = ev.e ? ev.e.reduce((a, v) => a + v, 0) : 0;
    setTimeout(() => toast(`<b>${esc(ev.ad)}</b>${esc(ev.msg)}${ev.e ? `<span class="tr ${sum < 0 ? "n" : "p"}">${esc(etkiKisa(ev.e))}${ev.syn ? "/ay" : ""}</span>` : ""}`, sum < 0 ? "warn" : "ev"), 650 + i * 300);
  });
}

// ─── Evrak ────────────────────────────────────────────────────────────────
const SEAL = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="20" cy="20" r="13.2" fill="none" stroke="currentColor" stroke-width=".8"/><g fill="currentColor">${Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; return `<circle cx="${(20 + Math.cos(a) * 15.7).toFixed(2)}" cy="${(20 + Math.sin(a) * 15.7).toFixed(2)}" r=".75"/>`; }).join("")}</g><ellipse cx="20" cy="21" rx="7.4" ry="5.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M13.6 19.4c4.2 1.6 8.6 1.6 12.8 0M13 22.4c4.6 1.6 9.4 1.6 14 0M20 15.2v-2.4c1-1.3 2.4-1.5 3.6-1.1" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/></svg>`;
const CLIP = `<svg class="clip" viewBox="0 0 12 36" aria-hidden="true"><path d="M3 33V7a3.5 3.5 0 0 1 7 0v21a2.3 2.3 0 0 1-4.6 0V9" fill="none" stroke="#8d949c" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const SILHOUETTE = `<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="22" r="11" fill="currentColor"/><path d="M8 60c0-14 10-22 22-22s22 8 22 22z" fill="currentColor"/></svg>`;
const BIRIM = {
  fikret: "Özel Kalem Müdürlüğü", kemal: "Fen İşleri Müdürlüğü", sevim: "Mali Hizmetler Müdürlüğü", recep: "Zabıta Müdürlüğü",
  huseyin: "Destek Hizmetleri Müdürlüğü", tekir: "Kapı Önü", kaymakam: "Kaymakamlık Yazısı", vekil: "Ankara Hattı",
};
function signature(seed) {
  const r = rngOf(seed);
  let x = 6, d = `M${x} ${18 + r() * 10}`;
  for (let i = 0; i < 5; i++) { const nx = x + 9 + r() * 12; d += ` C${(x + r() * 14).toFixed(1)} ${(r() * 36).toFixed(1)} ${(nx - r() * 14).toFixed(1)} ${(r() * 36).toFixed(1)} ${nx.toFixed(1)} ${(8 + r() * 22).toFixed(1)}`; x = nx; }
  d += ` M3 ${(30 + r() * 3).toFixed(1)} Q${(x / 2).toFixed(1)} ${(35 + r() * 3).toFixed(1)} ${(x + 8).toFixed(1)} ${(25 + r() * 5).toFixed(1)}`;
  return `<svg class="sig" viewBox="0 0 ${(x + 12).toFixed(0)} 40" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--pen)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const relCls = r => (r >= 2 ? "hot" : r <= -2 ? "cold" : r > 0 ? "warm" : r < 0 ? "cool" : "");
function relHTML(r) {
  if (r == null) return "";
  const segs = [-3, -2, -1, 0, 1, 2, 3].map(x => `<i class="${x === r ? "on" : ""}"></i>`).join("");
  return `<div class="rel ${relCls(r)}"><span>Aranız</span><b>${REL_AD[r]}</b><span class="rd" aria-hidden="true">${segs}</span></div>`;
}
const moodOf = r => (r == null ? "" : r <= -2 ? "Kaşları çatık; bir ret daha kaldırmaz." : r >= 2 ? "Güler yüzlü; hayır deseniz de anlayış gösterir." : "");
function optNote(o) {
  const bits = [];
  if (o.pol) {
    // aylık etkisi olan karar hep görünür; bitişinde bir sonucu varsa "sonu var" diye telgraf çekilir
    const p = o.pol, per = etkiKisa(p.e);
    if (per) bits.push(`her ay ${per}${p.ay ? `, ${p.ay} ay` : ", süresiz"}`);
    if (p.done || p.doneCard) bits.push(per ? "sonu var" : `${p.ay} ay sürecek iş`);
  }
  if (o.cut) bits.push("uygulamayı kaldırır");
  if (o.next) bits.push("devamı gelecek");
  // vaat defteri: tutulmayan vaat sandıkta ödenir, tutulan geri alınır
  const cnt = x => (typeof x === "string" ? { [x]: 1 } : x || {});
  if (cnt(o.inc).vaat) bits.push("vaat verilir");
  if (cnt(o.dec).vaat) bits.push("vaat yerine gelir");
  return bits.join(" · ");
}
function renderCard(c) {
  const P = PEOPLE[c.who];
  const el = document.createElement("article");
  el.className = "card enter"; el.id = "card";
  el.setAttribute("aria-label", `${P.ad}: ${c.konu}`);
  const ivedi = c.kind === "ending" || c.kind === "secim" || c.konu === "ACİL";
  el.innerHTML = `
    <div class="doc-head"><div class="seal">${SEAL}</div>
      <div class="org"><b>T.C.</b>KARAKAVAK BELEDİYE BAŞKANLIĞI<small>${esc(BIRIM[c.who] || "Yazı İşleri · Gelen Evrak")}</small></div>
      ${ivedi ? `<div class="ivedi">İVEDİ</div>` : "<div></div>"}</div>
    <div class="doc-meta"><span>Sayı: ${esc(c.sayi)}</span><span>${esc(c.tarih)}</span></div>
    <div class="doc-konu"><b>Konu:</b> ${esc(c.konu)}</div>
    <div class="who"><div class="photo">${photo(c.who)}${CLIP}</div><div><div class="nm">${esc(P.ad)}</div><div class="un">${esc(P.unvan)}</div>${relHTML(c.rel)}</div></div>
    ${moodOf(c.rel) ? `<p class="mood">(${moodOf(c.rel)})</p>` : ""}
    <p class="body">${esc(c.text)}</p>
    <div class="sign"><span>Gereğini arz ederim.</span>${signature(c.seed)}</div>
    <div class="stamp L"><span>${esc(c.L.t)}</span></div>
    <div class="stamp R"><span>${esc(c.R.t)}</span></div>`;
  const old = $("#card");
  if (old) { if (window.interact) interact(old).unset(); old.remove(); }
  $("#stack").appendChild(el);
  el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
  bindDrag(el);
  $("#ch-L .t").textContent = c.L.t;
  $("#ch-R .t").textContent = c.R.t;
  $("#ch-L .n").textContent = optNote(c.L);
  $("#ch-R .n").textContent = optNote(c.R);
  $("#announce").textContent = `${P.ad}, ${P.unvan}: ${c.text}`;
}
function tilt(el, dx) {
  const w = el.offsetWidth || 360, p = Math.max(-1, Math.min(1, dx / (w * 0.3)));
  el.style.transform = `translateX(${dx}px) rotate(${dx * 0.045}deg)`;
  el.querySelector(".stamp.L").style.opacity = p < 0 ? Math.min(1, -p * 1.15) : 0;
  el.querySelector(".stamp.R").style.opacity = p > 0 ? Math.min(1, p * 1.15) : 0;
  showHints(p < -0.12 ? "L" : p > 0.12 ? "R" : null);
}
function untilt(el) {
  if (!el) return;
  el.style.transition = "transform .35s cubic-bezier(.3,1.3,.5,1)";
  el.style.transform = "";
  el.querySelectorAll(".stamp").forEach(s => { s.style.opacity = 0; });
  showHints(null);
}
// Evrak sürükleme: interact.js işaretçi farklarını, yön kilidini ve fiske hızını yönetir.
// Karar iki yoldan verilir: yeterince uzağa sürüklemek ya da kısa ama hızlı bir fiske.
function bindDrag(el) {
  if (!window.interact) return bindDragBasic(el);
  let dx = 0;
  interact(el).styleCursor(false).draggable({
    startAxis: "x", lockAxis: "x", // dikey hareketle sürükleme hiç başlamaz
    listeners: {
      start() { dx = 0; if (busy) return; el.classList.remove("enter"); el.classList.add("dragging"); el.style.transition = "none"; },
      move(e) { if (busy) return; dx += e.dx; tilt(el, dx); },
      end(e) {
        el.classList.remove("dragging");
        if (busy) return;
        const w = el.offsetWidth || 360;
        // Fiske: bırakmadan hemen önceki yatay hız (interact.js ölçer) yeterliyse kısa sürükleme de karar sayılır
        const pv = e.interaction?.prevEvent, vx = pv?.velocityX || 0, fresh = pv && e.timeStamp - pv.timeStamp < 160;
        const flick = Math.abs(dx) >= 20 && ((e.swipe && (e.swipe.left || e.swipe.right)) || (fresh && Math.abs(vx) >= 260 && Math.sign(vx) === Math.sign(dx)));
        if (flick) commit(dx < 0 ? "L" : "R", true);
        else if (Math.abs(dx) > Math.max(70, w * 0.26)) commit(dx < 0 ? "L" : "R", true);
        else untilt(el);
      },
    },
  });
}
// Kütüphane yüklenemezse (ör. çevrimdışı önizleme) basit işaretçi sürüklemesi
function bindDragBasic(el) {
  let st = null;
  el.addEventListener("pointerdown", e => {
    if (busy || e.button > 0) return;
    st = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, lock: null };
    try { el.setPointerCapture(e.pointerId); } catch { }
  });
  el.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.lock) {
      if (Math.hypot(dx, dy) < 10) return;
      st.lock = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
      if (st.lock === "x") { el.classList.remove("enter"); el.classList.add("dragging"); el.style.transition = "none"; }
    }
    if (st.lock === "x") { st.dx = dx; tilt(el, dx); }
  });
  const up = e => {
    if (!st || e.pointerId !== st.id) return;
    const { dx, lock } = st; st = null;
    if (lock !== "x") return;
    el.classList.remove("dragging");
    if (e.type === "pointerup" && Math.abs(dx) > Math.max(70, el.offsetWidth * 0.26)) commit(dx < 0 ? "L" : "R", true);
    else untilt(el);
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}
function setChoices(disabled) { $("#ch-L").disabled = disabled; $("#ch-R").disabled = disabled; }

async function commit(side, dragged) {
  if (busy || !S?.cur || screen !== "game") return;
  const el = $("#card"); if (!el) return;
  busy = true; setChoices(true); closeNote();
  const dir = side === "L" ? -1 : 1;
  if (!dragged) { el.classList.remove("enter"); el.style.transition = "transform .16s ease-out"; tilt(el, dir * 46); await wait(reduced ? 0 : 150); }
  const st = el.querySelector(".stamp." + side);
  st.style.opacity = ""; st.classList.add("slam");
  el.querySelector(".stamp." + (side === "L" ? "R" : "L")).style.opacity = 0;
  snd.stamp(); vibrate(14);
  const kind = S.cur.kind, card = S.cur, before = { ...S.m }, month = S.month;
  const res = choose(S, side);
  showHints(null); setMeters(res.d, res.td);
  journalAdd(card, side, res, month);
  reactions(card, res); renderOngoing(); updateHud();
  if (!res.dead) dangerToast(before);
  if (kind === "cay") snd.clink();
  if (kind === "sonuc") snd.win();
  if (!S.over) LS.set("save", S);
  await wait(reduced ? 140 : 400);
  el.style.transition = "transform .42s cubic-bezier(.5,0,.75,0), opacity .42s ease-in";
  el.style.transform = `translateX(${dir * 135}%) translateY(40px) rotate(${dir * 24}deg)`;
  el.style.opacity = "0";
  await wait(reduced ? 60 : 300);
  busy = false; setChoices(false);
  if (S.over) return gameOver();
  if (kind === "secim" && S.pending?.res) { await electionNight(S.pending.res); show("game"); }
  nextCard();
}
function nextCard() {
  renderCard(draw(S));
  updateHud(); snd.paper();
  LS.set("save", S);
}
// Üst bar: takvim, seçim geri sayımı, anket, dönem rozeti
function updateHud() {
  if (!S) return;
  const left = TERM - 1 - (S.month % TERM), last = S.term >= MAX_TERMS, near = left <= 12 && !last;
  const poll = Math.round(pollOf(S));
  $("#dateline").textContent = dateLabel(S.month);
  $("#countdown").textContent = last ? "Son dönem" : `Seçime ${left ? left + " ay" : "bu ay"}`;
  $("#countdown").classList.toggle("near", near);
  $("#termline").textContent = `${S.term}. dönem`;
  const pb = GLYPH.p.box;
  tweenY($("#poll .lvl"), pb[0] + (1 - poll / 100) * (pb[1] - pb[0]));
  tweenNum($("#poll .num"), poll);
  $("#poll").classList.toggle("warn", near && poll <= 50);
  const vaat = S.cnt?.vaat || 0, vc = vaatCost(S);
  $("#poll").setAttribute("aria-label", `Anket: yüzde ${poll}`);
  $("#poll").title = `Anket %${poll}` + (vaat ? ` · tutulmamış ${vaat} vaat sandıkta −${vc} puan` : "");
  $("#poll").classList.toggle("vaat", vaat > 0);
  $("#danis-n").textContent = S.danis;
  $("#btn-danis").classList.toggle("spent", S.danis <= 0);
  $("#btn-danis").title = S.danis > 0 ? `Fikret'e danışın (bu dönem ${S.danis} hak)` : "Bu dönemki danışma hakkınız bitti";
}

// ─── Fikret'e sor: kural tabanlı makam şefi ───────────────────────────────
function openNote(text) {
  let n = $("#note");
  if (!n) {
    n = document.createElement("div"); n.id = "note"; n.className = "note"; n.setAttribute("role", "status");
    n.addEventListener("click", closeNote); n.innerHTML = `<b>Fikret'in notu</b><span></span>`;
    $("#stack").appendChild(n);
  }
  n.querySelector("span").textContent = text;
}
function closeNote() { $("#note")?.remove(); }
const SOZ = { h: ["halk", "sevinir", "söylenir"], k: ["kasa", "rahatlar", "sarsılır"], e: ["esnaf", "memnun olur", "kızar"], a: ["Ankara", "göz kırpar", "kaş çatar"] };
const ASIRI = { h: "halk fazla şımarır", k: "kasa gereğinden fazla şişer", e: "esnaf fazla güçlenir", a: "Ankara fazla yakınlaşır" };
const miktar = a => (a >= 15 ? "çok " : a >= 8 ? "epey " : "biraz ");
const listTR = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " ve " + a[a.length - 1]);
function sozle(e, n = 2) {
  return listTR(METERS.map((k, i) => ({ k, v: e[i] })).filter(x => x.v).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, n)
    .map(({ k, v }) => `${SOZ[k][0]} ${miktar(Math.abs(v))}${SOZ[k][v > 0 ? 1 : 2]}`));
}
// Seçeneği, yürürlüğe girecek kararın bir yıllık etkisiyle birlikte tartar
function tart(s, o, nearE) {
  const e = o.e.slice();
  if (o.pol?.e) o.pol.e.forEach((v, i) => { e[i] += v * Math.min(o.pol.ay ?? 12, 12) * 0.5; });
  if (o.pol?.done) o.pol.done.forEach((v, i) => { e[i] += v * 0.6; });
  let r = Math.max(...METERS.map((k, i) => edgeRisk(k, s.m[k] + e[i])));
  if (METERS.some((k, i) => s.m[k] + o.e[i] <= 8 || (k !== "h" && s.m[k] + o.e[i] >= 92))) r += 40;
  if (nearE) r -= e[0] * 0.6;
  return r;
}
function fikretAdvice(s) {
  const c = s.cur, left = TERM - 1 - (s.month % TERM), nearE = left <= 12 && s.term < MAX_TERMS;
  if (c.kind === "secim") {
    const p = pollOf(s), f = c.early ? s.earlyField : s.field, n = f ? f.extras.length + 2 : 2;
    const split = n > 2 ? ` ${n} aday var, oylar bölünecek; birinci çıkmak yeter.` : " Teke tek yarış; yüzde elliyi geçen kazanır.";
    return p >= 55 ? `Anket iyi başkanım, %${Math.round(p)}.${split} Kasayı yormayalım, sessiz kalsak da olur.`
      : `Başkanım, anket %${Math.round(p)}.${split} Kıl payı işler bunlar; meydana çıkalım, her oy lazım.`;
  }
  const best = tart(s, c.L, nearE) <= tart(s, c.R, nearE) ? "L" : "R", b = c[best], o = c[best === "L" ? "R" : "L"];
  const opener = pickOne(["Başkanım, bence", "Benden söylemesi başkanım:", "Çayınızı koyarken bir şey diyeyim:", "Kulağınıza fısıldayayım başkanım:"]);
  let t = `${opener} “${b.t}” deyin; ${sozle(b.e) || "pek bir şey değişmez"}.`;
  const tehlike = METERS.filter((k, i) => s.m[k] + o.e[i] <= 12 || (k !== "h" && s.m[k] + o.e[i] >= 88));
  if (tehlike.length) t += ` “${o.t}” derseniz ${SOZ[tehlike[0]][0]} tehlikeye girer, Allah korusun.`;
  else {
    // Öbür seçeneğin uzaklaştırdığı göstergelerden uca en yakın düşeni
    const harm = METERS.map((k, i) => ({ k, v: o.e[i], f: edgeRisk(k, s.m[k] + o.e[i]), d: edgeRisk(k, s.m[k] + o.e[i]) - edgeRisk(k, s.m[k]) }))
      .filter(x => x.v && x.d > 0).sort((x, y) => y.f - x.f)[0];
    if (harm) t += ` Öbürü de olur ama ${harm.v > 0 && s.m[harm.k] >= 50 ? ASIRI[harm.k] : `${SOZ[harm.k][0]} ${miktar(Math.abs(harm.v))}${SOZ[harm.k][harm.v > 0 ? 1 : 2]}`}.`;
  }
  if (b.pol) {
    const per = b.pol.e || Z;
    t += b.pol.done || b.pol.doneCard ? " Yalnız iş uzun sürer, sabır ister." : per.some(v => v < 0) ? " Yalnız bu karar her ay cepten yer, unutmayın." : " Üstelik her ay bir getirisi olur.";
  } else if (b.next) t += " Bunun bir devamı olacak, bilesiniz.";
  const vaatOf = x => (typeof x === "string" ? x === "vaat" : !!x?.vaat);
  if (vaatOf(b.inc)) t += " Bu bir vaat ama; tutmazsak sandıkta hesabını sorarlar.";
  else if (vaatOf(b.dec)) t += " Hem verdiğimiz bir sözü de yerine getirmiş oluruz.";
  if (c.rel != null && c.rel <= -2) t += ` ${PEOPLE[c.who].ad} zaten dargın; fazla üstüne gitmeyin.`;
  else if (nearE && b.e[0] < 0) t += " Seçim yakın ama; halk bunu unutmaz.";
  return t;
}
function danis() {
  if (!S?.cur || busy || screen !== "game") return;
  if ($("#note")) return closeNote();
  if (["intro", "ending", "tekir", "sonuc", "cay"].includes(S.cur.kind)) { openNote("Bu evrakta akıl verecek bir şey yok başkanım, gönül rahatlığıyla imzalayın."); return; }
  if (S.danis <= 0) { openNote("Bu dönem üç kere akıl verdim başkanım; gerisi sizin sezginize kalmış."); return; }
  S.danis--; LS.set("save", S); updateHud();
  openNote(fikretAdvice(S)); snd.clink();
}

// ─── Oyun sonu: Karakavak Postası ─────────────────────────────────────────
const sumAbs = e => e.reduce((a, v) => a + Math.abs(v), 0);
function article(s, name) {
  const o = s.over, E = ENDINGS[o.key], kim = name ? `Başkan ${name}` : "başkan";
  const picks = s.log.slice().sort((a, b) => sumAbs(b.e) - sumAbs(a.e)).slice(0, 2).sort((a, b) => a.m - b.m);
  let haber = `Nisan 2029'da göreve başlayan ${kim}, ${durLabel(o.months)} süren dönemini ${dateLabel(o.months)} itibarıyla kapattı. Bu sürede makamdan ${s.signed} evrak geçti${s.cay ? `, ${s.cay} bardak çay içildi` : "; Fikret'in bir bardak çay getirmeye bile fırsatı olmadı"}.`;
  if (picks.length === 2) haber += `\nDönemin akıllarda kalan kararları arasında ${PEOPLE[picks[0].who].ad} dosyasındaki “${picks[0].t}” talimatı ile ${PEOPLE[picks[1].who].ad} ile görüşülen “${picks[1].konu.toLocaleLowerCase("tr")}” meselesinde verilen “${picks[1].t}” kararı öne çıkıyor.`;
  if (s.bitti?.length) haber += ` Dönemde ${listTR(s.bitti.slice(-3).map(x => x.toLocaleLowerCase("tr")))} tamamlandı.`;
  const dost = Object.entries(s.rel).filter(([, v]) => v >= 2).map(([w]) => PEOPLE[w].ad);
  const kus = Object.entries(s.rel).filter(([, v]) => v <= -2).map(([w]) => PEOPLE[w].ad);
  if (dost.length && kus.length) haber += `\nKulislerde başkanın en yakınları olarak ${listTR(dost.slice(0, 2))} anılırken ${listTR(kus.slice(0, 2))} ile arasının açık olduğu biliniyor.`;
  else if (dost.length) haber += `\nBaşkanın zor günlerde yanından ayrılmayanlar arasında ${listTR(dost.slice(0, 3))} vardı.`;
  else if (kus.length) haber += `\n${listTR(kus.slice(0, 2))} ise başkanın kapısını son aylarda hiç çalmadı.`;
  haber += ` Makam şefi Fikret gazetemize kısa bir açıklama yaptı: “${pickOne(QUOTES)}”`;
  const el = s.lastElection;
  const spot = o.key === "sandik" && el && el.cands[0].id !== "you"
    ? `${PEOPLE[el.cands[0].id].ad} ${pctTR(el.cands[0].pct)} ile Karakavak'ın yeni belediye başkanı oldu; ${el.cands.length} adaylı yarışta başkan ${pctTR(el.you)} ile ${el.cands.findIndex(c => c.id === "you") + 1}. sırada kaldı.`
    : E.spot;
  return { manset: E.manset, spot, haber, kulis: pickOne(KULIS) };
}
function renderPaper(lo) {
  const { s, art } = lo, o = s.over, E = ENDINGS[o.key], P = PEOPLE[E.who];
  const issue = 1200 + o.months * 4 + (s.signed % 7);
  $("#paper").innerHTML = `
    <header class="mast">
      <div class="mast-top"><span>Kuruluş 1961</span><span>Sayı ${issue}</span><span>Fiyatı 10 TL</span></div>
      <div class="mast-name">KARAKAVAK POSTASI</div>
      <div class="mast-sub">Haftalık siyasi, kültürel ve kavun gazetesi · ${dateLabel(o.months)}</div>
    </header>
    <div class="np-main">
      <div class="np-lead">
        <div class="kicker">SON DAKİKA</div>
        <h2 class="headline">${esc(art.manset)}</h2>
        <div class="np-grid">
          <figure class="np-photo"><div class="ht">${photo(E.who)}</div><figcaption>${esc(P.ad)} (${esc(P.unvan)}) olayları gazetemize anlattı.</figcaption></figure>
          <p class="spot">${esc(art.spot)}</p><div class="haber">${art.haber.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</div>
        </div>
      </div>
      <div class="np-side">
        <aside class="kulis"><b>KULİS</b>${esc(art.kulis)}</aside>
        <div class="np-stats">
          <div><b>${esc(durLabel(o.months))}</b><span>görev süresi</span></div>
          <div><b>${s.signed}</b><span>imzalı evrak</span></div>
          <div><b>${s.cay}</b><span>bardak çay</span></div>
          <div><b>${o.term}.</b><span>dönem</span></div>
        </div>
        <div class="np-by">Karakavak Postası Haber Merkezi</div>
      </div>
    </div>`;
}
function dropPaper() { const p = $("#paper"); p.classList.remove("fresh"); void p.offsetWidth; p.classList.add("fresh"); }
function gameOver() {
  const o = S.over, name = playerName();
  LS.del("save");
  const art = article(S, name);
  const rec = { gid: S.gid, name, avatar: playerAvatar(), months: o.months, key: o.key, term: o.term, headline: art.manset, at: Date.now() };
  const best = LS.get("best", null);
  if (!best || o.months > best.months) LS.set("best", rec);
  hallAdd(rec);
  lastOver = { s: S, rec, art };
  renderPaper(lastOver);
  show("over"); dropPaper();
  $("#scr-over").scrollTop = 0;
  snd.hicaz();
}

// ─── Seçim gecesi: sonuç baştan belli (engine.js tally), ekran sandık sandık açar ─
const EC_RENK = { you: "#e2bd5a", nermin: "#e8715a", vekil: "#6f9be6", cengiz: "#c09a70", kaan: "#a78cf0", bekir: "#5cc08a",
  muhtar: "#e0a860", tuncay: "#a9b2bf", burak: "#ef7fb4", albay: "#a3b86a", tekir: "#f5a94a" };
// mahalle: blok karışımı [halk, esnaf, parti tabanı, kararsız], sandık sayısı. Açılış sırası köylerden merkeze, en son traktörlü köy.
const MAHALLE = [
  ["Kavun Ovası", [.7, .1, .1, .1], 4], ["Çarşı", [.3, .55, .05, .1], 3], ["Sanayi", [.45, .4, .05, .1], 2],
  ["Lojmanlar", [.3, .05, .55, .1], 2], ["Merkez", [.5, .15, .2, .15], 4], ["Kavaklı", [.8, .05, .05, .1], 3],
  ["Öğrenci yurdu", [.3, .02, .03, .65], 2], ["Yukarıkavak", [.75, .05, .15, .05], 1],
];
const candName = id => (id === "you" ? playerName() : PEOPLE[id].ad);
const candLabel = id => (id === "you" ? "Belediye Başkanı, yeniden aday" : ADAYLAR[id].etiket);
const candPic = id => photoSrc(id === "you" ? playerAvatar() : id);
const pctTR = v => "%" + v.toFixed(1).replace(".", ",");
// Sandıklar mahallenin seçmen karışımından üretilir; her adayın toplamı kesin sonuca eşitlenir (ekran gerçeği gösterir, yalnız sırasını dramatize eder)
function ballotBoxes(res, rng) {
  const boxes = [];
  MAHALLE.forEach(([, mix, k], mi) => {
    for (let j = 0; j < k; j++) {
      const size = 380 + Math.floor(rng() * 320);
      boxes.push({ mi, v: res.cands.map((c, i) => size * Math.max(0.002, mix.reduce((a, m, b) => a + m * res.blocs[b].pay[i] / 100, 0)) * (0.8 + rng() * 0.4)) });
    }
  });
  const total = boxes.reduce((a, b) => a + b.v.reduce((x, y) => x + y, 0), 0);
  res.cands.forEach((c, i) => { const col = boxes.reduce((a, b) => a + b.v[i], 0); boxes.forEach(b => { b.v[i] *= (c.pct / 100) * total / col; }); });
  return boxes;
}
// Spikerin mahalle mahalle söyledikleri (yarışanlara göre)
function anchorLine(mi, ids) {
  const has = id => ids.includes(id);
  return [
    "Yayın yasağı kalktı! İlk sandıklar Kavun Ovası köylerinden geliyor; tutanaklar kavun kasasında.",
    has("bekir") ? "Çarşı sandıkları açılıyor: burası Hacı Bekir'in kalesi, kepenkler kapalı, herkes ekran başında."
      : "Çarşıda esnaf sandık başında nöbette. Fikret bütün müşahitlere çay dağıtıyor, 'nöbetçi müşahit' diyor.",
    "Sanayi sandığında itiraz: 'Zarftan bakkal fişi çıktı.' İtiraz reddedildi, çay kabul edildi.",
    has("vekil") ? "Lojman sandıkları Suat Bey'e yakın. Kendisi 'talimat henüz gelmedi' diyerek yorum yapmıyor."
      : "Lojmanlarda memurlar sandığa mesai saatinde gitmiş; öğle arası üç saat sürmüş.",
    "Merkez mahalleler açılıyor. Uzmanımız stüdyoda: 'Kesin konuşmak için erken, yine de konuşacağım.'",
    has("muhtar") ? "Kavaklı'da Muhtar Rıza oyları kendisi sayıyor, parmak hesabıyla. Üç kere saydı, üçü de başka çıktı."
      : "Kavaklı sandıkları geldi. Muhtar hepsini tek tek imzaladı, bir tanesine de kaşe yerine tespih bastı.",
    has("burak") ? "Burak %1 açılmışken canlı yayın açıp 'KAZANDIK' diye bağırdı. İzleyici sayısı: 12, biri kendisi."
      : "Yurt sandığından oy pusulası yerine ders notu çıktı; kurul geçersiz saydı, öğrenci itiraz etti.",
    "Sandıkların %99,8'i açıldı. Son sandık Yukarıkavak'tan traktörle yolda; traktör çamura saplandı, muhtar sandığı omzunda getiriyor.",
  ][mi];
}
function electionNight(res) {
  return new Promise(done => {
    const r = rngOf(res.month * 131 + res.term * 7 + 3), boxes = ballotBoxes(res, r), N = boxes.length;
    // ekranda sabit sıra (sonucu ele vermesin): önce siz, sonra ilan sırası
    const ids = ["you", ...(res.order || res.cands.map(c => c.id).filter(id => id !== "you").sort())].filter(id => res.cands.some(c => c.id === id));
    $("#scr-secim .ec-top h2").textContent = res.early ? "Karakavak Erken Seçim Gecesi" : "Karakavak Seçim Gecesi";
    const idx = id => res.cands.findIndex(c => c.id === id);
    const fast = LS.get("ecSeen", false), speed = fast ? 0.6 : 1;
    const cum = res.cands.map(() => 0), tileCum = MAHALLE.map(() => res.cands.map(() => 0));
    let opened = 0, leader = null, finished = false, timer = 0;
    const say = t => { $("#ec-say").textContent = t; };
    const anchor = t => { $("#ec-anchor").textContent = t; };
    $("#ec-date").textContent = `${dateLabel(res.month)} · ${res.cands.length} aday`;
    $("#ec-turnout").textContent = `Katılım %${70 + Math.floor(r() * 16)}`;
    $("#ec-list").innerHTML = ids.map(id => `<li class="ec-row${id === "you" ? " you" : ""}" data-id="${id}" style="--c:${EC_RENK[id] || "#aaa"}">
      <img src="${candPic(id)}" alt="" draggable="false">
      <div class="ec-nm"><b>${esc(candName(id))}<span class="ec-lead">▲ önde</span></b><span>${esc(candLabel(id))}</span></div>
      <div class="ec-pct"><b>%0</b><span>0 oy</span></div><div class="ec-bar"><i></i></div></li>`).join("");
    $("#ec-map").innerHTML = MAHALLE.map(([ad]) => `<div class="ec-tile"><span>${esc(ad)}</span><b></b></div>`).join("");
    $("#ec-after").hidden = true; $("#btn-ec-go").hidden = true; $("#btn-ec-skip").hidden = false;
    show("secim"); $("#scr-secim").scrollTop = 0;
    const paint = () => {
      const tot = cum.reduce((a, v) => a + v, 0) || 1, all = boxes.reduce((a, b) => a + b.v.reduce((x, y) => x + y, 0), 0);
      const frac = finished ? 100 : Math.min(opened === N - 1 ? 99.8 : 99.7, 100 * boxes.slice(0, opened).reduce((a, b) => a + b.v.reduce((x, y) => x + y, 0), 0) / all);
      $("#ec-open").textContent = pctTR(frac); $("#ec-prog").style.width = frac + "%";
      let lead = null, best = -1;
      for (const id of ids) {
        const i = idx(id), p = opened ? 100 * cum[i] / tot : 0, row = $(`.ec-row[data-id="${id}"]`);
        row.querySelector(".ec-pct b").textContent = pctTR(p);
        row.querySelector(".ec-pct span").textContent = `${Math.round(cum[i]).toLocaleString("tr")} oy`;
        row.querySelector(".ec-bar i").style.width = p + "%";
        if (cum[i] > best) { best = cum[i]; lead = id; }
      }
      document.querySelectorAll(".ec-row").forEach(el => el.classList.toggle("lead", opened > 0 && el.dataset.id === lead));
      MAHALLE.forEach((_, m) => {
        const t = tileCum[m], s = t.reduce((a, v) => a + v, 0), el = $("#ec-map").children[m];
        if (!s) return;
        const w = res.cands[t.indexOf(Math.max(...t))].id;
        el.classList.add("on"); el.style.setProperty("--c", EC_RENK[w] || "#aaa"); el.querySelector("b").textContent = candName(w);
      });
      if (opened > 1 && lead !== leader) { anchor(`Liderlik el değiştirdi: ${candName(lead)} öne geçti!`); say(`${candName(lead)} öne geçti.`); }
      leader = lead;
    };
    const open = k => {
      const b = boxes[k]; b.v.forEach((v, i) => { cum[i] += v; tileCum[b.mi][i] += v; });
      opened = k + 1;
      if (k === 0 || boxes[k - 1].mi !== b.mi) anchor(anchorLine(b.mi, ids));
      if (ids.includes("tekir") && k === Math.floor(N / 2)) anchor("Geçersiz oyların yarısına kedi resmi çizilmiş. Miyav Hareketi genel merkezinde mama dağıtılıyor.");
      paint();
      const pr = Math.round(100 * opened / N);
      if ([25, 50, 75].some(x => pr >= x && Math.round(100 * (opened - 1) / N) < x)) say(`Sandıkların yüzde ${pr}'i açıldı, ${candName(leader)} önde.`);
    };
    const finish = () => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      for (let k = opened; k < N; k++) open(k); // sandık toplamları kesin sonuca eşit, son hâl birebir tutar
      paint();
      const w = res.cands[0], row = $(`.ec-row[data-id="${w.id}"]`);
      row.classList.add("won");
      const n = res.cands.length;
      const line = w.id === "tekir" ? "Karakavak'ın ilk tüylü başkanı: Tekir! İlk icraatı masadaki bardağı yere itmek oldu."
        : res.win ? `${candName("you")} ${pctTR(res.you)} ile yeniden seçildi! ${n} adaylı yarışta fark ${String(res.margin).replace(".", ",")} puan.`
        : `${candName(w.id)} ${pctTR(w.pct)} ile Karakavak'ın yeni belediye başkanı. Siz ${pctTR(res.you)} aldınız.`;
      anchor(line); say(line);
      if (res.win) snd.win(); else snd.paper();
      renderElectionAfter(res, ids);
      $("#btn-ec-skip").hidden = true; const go = $("#btn-ec-go"); go.hidden = false; go.focus({ preventScroll: true });
      LS.set("ecSeen", true);
      journalNote(`<b>Seçim</b>${esc(line)}`, res.win ? "ev" : "warn");
    };
    // zamanlama: hızlı başlar, sona doğru yavaşlar; son sandıkta traktör beklemesi. Hareket azaltmada üç adım.
    const steps = reduced ? [Math.round(N * 0.3), Math.round(N * 0.7), N - 1] : null;
    const next = () => {
      if (finished) return;
      if (opened >= N - 1) { anchor(anchorLine(MAHALLE.length - 1, ids)); paint(); timer = setTimeout(finish, (reduced ? 600 : 1500) * speed); return; }
      if (steps) { const to = steps.find(x => x > opened) ?? N - 1; while (opened < to) open(opened); timer = setTimeout(next, 700); return; }
      open(opened);
      timer = setTimeout(next, (170 + 420 * Math.pow(opened / (N - 1), 1.6)) * speed);
    };
    anchor(anchorLine(0, ids)); paint();
    timer = setTimeout(next, (reduced ? 300 : 1100) * speed);
    $("#btn-ec-skip").onclick = finish;
    $("#btn-ec-go").onclick = () => { $("#btn-ec-go").onclick = null; done(); };
  });
}
// Sonuçtan sonra: seçmen grubu dökümü ve "Neden?" satırları
function renderElectionAfter(res, ids) {
  const seg = (b, id) => { const i = res.cands.findIndex(c => c.id === id); return `<i style="--c:${EC_RENK[id]};width:${b.pay[i]}%" title="${esc(candName(id))} ${b.pay[i]}%"></i>`; };
  const yi = res.cands.findIndex(c => c.id === "you");
  $("#ec-blocs").innerHTML = res.blocs.map(b => `<div class="ec-bloc"><span>${esc(b.ad)}<small>seçmenin %${Math.round(b.w * 100)}'i</small></span>
      <div class="ec-stack">${ids.map(id => seg(b, id)).join("")}</div><em>${pctTR(b.pay[yi])}</em></div>`).join("")
    + `<div class="ec-legend">${ids.map(id => `<span style="--c:${EC_RENK[id]}">${esc(candName(id))}</span>`).join("")}</div>`;
  const why = [`Teke tek ankette %${String(res.p0).replace(".", ",")} idiniz.`];
  for (const x of res.steal || []) if (x.v >= 1) why.push(`${PEOPLE[x.id].ad} sizden yaklaşık ${String(x.v).replace(".", ",")} puan aldı.`);
  if (res.win && res.you < 50) why.push("Oylar bölündü; yüzde elliyi bulmadan birinci çıktınız.");
  if (res.vaat) why.push(`Tutulmamış vaatler sandıkta ${res.vaat} puan götürdü.`);
  if (res.rel >= 1) why.push(`Dostlarınızın desteği +${String(res.rel).replace(".", ",")} puan getirdi.`);
  else if (res.rel <= -1) why.push(`Aranızın bozuk olduğu kanaat önderleri ${String(res.rel).replace(".", ",")} puana mal oldu.`);
  if (res.fatigue) why.push(`${res.term}. dönem yorgunluğu: −${String(res.fatigue).replace(".", ",")} puan.`);
  $("#ec-why").innerHTML = why.map(t => `<li>${esc(t)}</li>`).join("");
  $("#ec-after").hidden = false;
}

// ─── Eski Belediye Başkanlarımız (bu tarayıcıdaki dönemler) ───────────────
const HALL_MAX = 24;
function hallAdd(rec) {
  const h = LS.get("hall", []).filter(r => r && r.gid !== rec.gid);
  h.push(rec);
  h.sort((a, b) => b.months - a.months || b.at - a.at);
  LS.set("hall", h.slice(0, HALL_MAX));
}
function frameEl(r, rank, fresh) {
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const f = mk("div", "frame" + (fresh ? " me" : "")), gilt = mk("div", "gilt"), mat = mk("div", "mat"), pic = mk("div", "pic");
  // eski kayıtlarda seçilmiş vesikalık yok, yalnız rastgele bir tohum (face) var
  const face = mk("img"); face.alt = ""; face.src = photoSrc(BASKANLAR[r.avatar] ? r.avatar : MAYORS[(Number(r.face) || 1) % MAYORS.length]);
  pic.appendChild(face);
  mat.appendChild(pic); gilt.appendChild(mat); f.appendChild(gilt);
  const cap = mk("div", "cap");
  cap.appendChild(mk("b", null, r.name || "İsimsiz başkan"));
  cap.appendChild(mk("span", null, `${rank}. sıra · Nisan 2029 – ${dateLabel(r.months)}`));
  cap.appendChild(mk("span", null, `${durLabel(r.months)} · ${ENDINGS[r.key].kisa}`));
  if (r.headline) cap.appendChild(mk("em", null, `“${r.headline}”`));
  f.appendChild(cap);
  return f;
}
function renderWall() {
  const box = $("#frames"), msg = $("#wall-msg");
  const rows = LS.get("hall", []).filter(r => r && ENDINGS[r.key] && Number.isFinite(r.months));
  box.textContent = "";
  rows.forEach((r, i) => box.appendChild(frameEl(r, i + 1, lastOver && r.gid === lastOver.rec.gid)));
  msg.hidden = false;
  msg.textContent = rows.length ? "Bu tarayıcıda görev yapmış başkanlar, en uzun görev süresine göre. Kayıtlar yalnızca bu cihazda durur." : "Duvar henüz boş. İlk portre sizinki olsun başkanım.";
}
function openWall() { wallFrom = screen === "wall" ? wallFrom : screen; show("wall"); $("#scr-wall").scrollTop = 0; renderWall(); }

// ─── Akış ─────────────────────────────────────────────────────────────────
// Başkanın vesikalığı başlıkta seçilir; ad kutusu boşsa vesikalığın adı kullanılır
function customName() { return (LS.get("name", "") || "").trim().slice(0, 24); }
function playerAvatar() {
  let a = LS.get("avatar", null);
  if (!BASKANLAR[a]) { a = pickOne(MAYORS); LS.set("avatar", a); }
  return a;
}
function playerName() { return customName() || BASKANLAR[playerAvatar()].ad; }
function paintAvatar() {
  const a = playerAvatar();
  $("#avatar-img").src = $("#hud-img").src = photoSrc(a);
  $("#in-name").placeholder = BASKANLAR[a].ad;
  $("#leader-name").textContent = playerName();
}
function openPick() {
  const box = $("#picks"), cur = playerAvatar(), own = customName();
  box.textContent = "";
  for (const id of MAYORS) {
    const B = BASKANLAR[id], mk = (tag, txt) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; return e; };
    const b = mk("button"), im = mk("img"), tx = mk("span");
    b.type = "button"; b.className = "pick"; b.setAttribute("aria-pressed", String(id === cur));
    im.src = photoSrc(id); im.alt = ""; im.draggable = false;
    tx.className = "pk"; tx.append(mk("b", B.ad), mk("i", B.lakap), mk("small", B.bio));
    b.append(im, tx);
    b.addEventListener("click", () => { LS.set("avatar", id); showTitle(); $("#btn-avatar").focus(); });
    box.appendChild(b);
  }
  $("#pick-note").textContent = own ? `Adınız “${own}” olarak kalır, yalnız vesikalık değişir.` : "Adını beğenmezseniz başlıktaki kutuya kendi adınızı yazın.";
  show("pick"); $("#scr-pick").scrollTop = 0;
}
function show(name) {
  screen = name;
  for (const s of ["title", "game", "over", "wall", "help", "pick", "secim"]) $("#scr-" + s).hidden = s !== name;
}
function showTitle() {
  closeNote();
  const best = LS.get("best", null), sv = LS.get("save", null);
  $("#best").textContent = best && ENDINGS[best.key] ? `Rekorunuz: ${durLabel(best.months)} · ${ENDINGS[best.key].kisa}` : "";
  $("#btn-resume").hidden = !(sv && sv.v === 2 && !sv.over && sv.cur);
  $("#in-name").value = customName();
  paintAvatar();
  show("title");
}
function enterGame() {
  show("game"); $("#toasts").textContent = ""; paintAvatar(); setMeters(); renderOngoing();
  S.journal ||= []; logUnread = 0; openLog(false); renderLog(false);
}
function startNew() {
  snd.unlock();
  const intro = !LS.get("introSeen", false);
  LS.set("introSeen", true);
  S = newGame({ intro });
  enterGame(); nextCard();
}
function resume() {
  snd.unlock();
  const s = LS.get("save", null);
  if (!s || s.v !== 2 || s.over || !s.cur) return startNew();
  S = s; enterGame(); updateHud();
  // seçim evrakı imzalanmış ama sonuç ekranı kapanmadan çıkılmışsa: seçim gecesi yeniden gösterilir
  if (S.pending?.type === "sonuc" && S.pending.res && S.cur?.kind === "secim") { electionNight(S.pending.res).then(() => { show("game"); nextCard(); }); return; }
  renderCard(S.cur);
}

function wire() {
  buildMeters();
  $("#btn-start").addEventListener("click", startNew);
  $("#btn-resume").addEventListener("click", resume);
  $("#btn-wall").addEventListener("click", openWall);
  $("#btn-help").addEventListener("click", () => { show("help"); $("#scr-help").scrollTop = 0; });
  $("#btn-help-back").addEventListener("click", showTitle);
  $("#btn-wall2").addEventListener("click", openWall);
  $("#btn-back").addEventListener("click", () => (wallFrom === "over" && lastOver ? show("over") : showTitle()));
  $("#btn-again").addEventListener("click", startNew);
  $("#btn-menu").addEventListener("click", showTitle);
  $("#btn-danis").addEventListener("click", danis);
  $("#btn-log").addEventListener("click", () => openLog(!$("#log").classList.contains("open")));
  $("#btn-log-x").addEventListener("click", () => openLog(false));
  $("#log-scrim").addEventListener("click", () => openLog(false));
  wideLog.addEventListener("change", () => { openLog(false); logUnread = 0; if (S) renderLog(false); });
  $("#in-name").addEventListener("input", e => LS.set("name", e.target.value.slice(0, 24)));
  $("#btn-avatar").addEventListener("click", openPick);
  $("#btn-pick-back").addEventListener("click", () => { showTitle(); $("#btn-avatar").focus(); });
  const mute = $("#btn-mute");
  const paintMute = () => { mute.setAttribute("aria-pressed", String(!snd.on)); mute.setAttribute("aria-label", snd.on ? "Sesi kapat" : "Sesi aç"); $("#mute-wave").style.opacity = snd.on ? 1 : .15; };
  mute.addEventListener("click", () => { snd.toggle(); paintMute(); });
  paintMute();
  for (const side of ["L", "R"]) {
    const b = $("#ch-" + side), dir = side === "L" ? -1 : 1;
    const peek = () => { const el = $("#card"); if (busy || !el || screen !== "game") return; el.classList.remove("enter"); el.style.transition = "transform .2s ease-out"; tilt(el, dir * 22); el.querySelector(".stamp." + side).style.opacity = .35; };
    const unpeek = () => { if (!busy) untilt($("#card")); };
    b.addEventListener("click", () => commit(side));
    b.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") peek(); });
    b.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") unpeek(); });
    b.addEventListener("focus", () => { if (b.matches(":focus-visible")) peek(); });
    b.addEventListener("blur", unpeek);
  }
  addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.matches?.("input, textarea")) return;
    if (screen === "wall" && e.key === "Escape") return $("#btn-back").click();
    if (screen === "help" && e.key === "Escape") return showTitle();
    if (screen === "pick" && e.key === "Escape") return $("#btn-pick-back").click();
    if (screen === "secim" && ["Enter", " ", "Escape"].includes(e.key)) { e.preventDefault(); return ($("#btn-ec-go").hidden ? $("#btn-ec-skip") : $("#btn-ec-go")).click(); }
    if (screen !== "game") return;
    const k = e.key.toLocaleLowerCase("tr");
    // çekmece açıkken masa kilitli: yalnız kapatma tuşları
    if ($("#log").classList.contains("open")) { if (e.key === "Escape" || k === "g") openLog(false); return; }
    if (k === "g" && !wideLog.matches) return openLog(true);
    if (e.key === "ArrowLeft" || k === "a") { e.preventDefault(); commit("L"); }
    else if (e.key === "ArrowRight" || k === "d") { e.preventDefault(); commit("R"); }
    else if (k === "f") danis();
    else if (e.key === "Escape") closeNote();
  });
}

wire();
showTitle();
// Evrak açılırken vesikalık beklemesin
setTimeout(() => { for (const id of Object.keys(PEOPLE)) new Image().src = photoSrc(id); }, 1500);
// Web sürümünde çevrimdışı çalışmak için (dosyadan açılınca kayıt denenmez)
if (STANDALONE && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
}
