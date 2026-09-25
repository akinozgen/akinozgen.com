// ─── Arayüz ───────────────────────────────────────────────────────────────
import interact from "interactjs";
import { ADAYLAR, BASKANLAR, ENDINGS, KULIS, PEOPLE, QUOTES, REACT, VAATLER } from "./cards.ts";
import {
  MAX_TERMS,
  METERS,
  METER_AD,
  REL_AD,
  TERM,
  VAAT,
  VAAT_MAX,
  Z,
  acilisSecimi,
  calOf,
  choose,
  dateLabel,
  draw,
  durLabel,
  defterOf,
  edgeRisk,
  kampanyaSans,
  mirasOf,
  newGame,
  pollOf,
  shuffle,
  vaatCost,
} from "./engine.ts";
import type { TvCtx } from "./broadcast.ts";
import type { Acilis, ChooseOut, Cur, Effect, Meter, Meters, Rng, Side, State, Tally } from "./types.ts";

// sayfadaki öğeler hep var: bulunamazsa hata, boş dönmez
const $ = <T extends Element = HTMLElement>(q: string) => document.querySelector(q) as T;
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ESC[c]);
const pickOne = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("cb." + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem("cb." + k, JSON.stringify(v));
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem("cb." + k);
    } catch {}
  },
};
const rngOf =
  (seed: number): Rng =>
  () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
// dokunmadan (klavyeyle) oynayanda tarayıcı titreşimi engeller ve konsola hata yazar; hiç çağırmayalım
const vibrate = (ms: number) => {
  try {
    if (LS.get("vibrate", true) && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms);
  } catch {}
};

// animasyonların öğe üstünde tuttuğu ara değerler
type Anim = Element & { _y?: number; _v?: number; _raf?: number; _t?: number };
interface LastOver {
  s: State;
  rec: HallRec;
  art: Article;
}
interface HallRec {
  gid: string;
  name: string;
  avatar: string;
  months: number;
  key: string;
  term: number;
  headline: string;
  at: number;
}
interface Article {
  manset: string;
  spot: string;
  haber: string;
  kulis: string;
}
// oyun sırasında çağrılan yerler için: masada oyun yokken çağrılırsa bu bir hatadır
const st = (): State => {
  if (!S) throw new Error("oyun açık değil");
  return S;
};
let S: State | null = null,
  busy = false,
  screen = "title",
  lastOver: LastOver | null = null,
  wallFrom = "title";
// Derlemede web sürümü için true yapılır (service worker kaydı)
const STANDALONE = import.meta.env.PROD; // derlenmiş sürüm: çevrimdışı önbellek (service worker) kaydolur
// Vesikalıklar public/portraits/ altındaki resimlerdir (derlemede olduğu gibi kopyalanır)
const MAYORS = Object.keys(BASKANLAR);
const photoSrc = (id: string) => `portraits/${id}.webp`;
const photo = (id: string) => `<img src="${photoSrc(id)}" alt="" decoding="async" draggable="false">`;

// ─── Ses: hepsi WebAudio ile üretiliyor ───────────────────────────────────
const snd = (() => {
  let ctx: AudioContext | null = null,
    master: GainNode | null = null,
    on = LS.get("sound", true),
    vol = LS.get("volume", 50);
  const ks: Record<number, AudioBuffer> = {};
  const init = () => {
    if (ctx) return;
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    try {
      ctx = new AC!();
      master = ctx.createGain();
      master.gain.value = vol / 100;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  };
  const ready = () => (on && ctx && master && ctx.state !== "closed" ? { c: ctx, out: master } : null);
  const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const noise = (c: AudioContext, dur: number) => {
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = b;
    return s;
  };
  const pluckBuf = (c: AudioContext, f: number) => {
    if (ks[f]) return ks[f];
    const sr = c.sampleRate,
      N = Math.round(sr / f),
      len = Math.floor(sr * 1.8),
      buf = c.createBuffer(1, len, sr),
      d = buf.getChannelData(0),
      ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (let i = 0, j = 0; i < len; i++, j = (j + 1) % N) {
      const a = ring[j];
      d[i] = a;
      ring[j] = 0.4985 * (a + ring[(j + 1) % N]);
    }
    return (ks[f] = buf);
  };
  const pluck = (c: AudioContext, out: GainNode, f: number, t: number, v = 0.5) => {
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = pluckBuf(c, f);
    g.gain.value = v;
    s.connect(g).connect(out);
    s.start(t);
  };
  return {
    get on() {
      return on;
    },
    unlock() {
      if (on) {
        init();
        ctx?.resume?.();
      }
    },
    toggle() {
      on = !on;
      LS.set("sound", on);
      if (on) {
        init();
        ctx?.resume?.();
      }
      return on;
    },
    get vol() {
      return vol;
    },
    volume(v: number) {
      vol = Math.max(0, Math.min(100, Math.round(v)));
      LS.set("volume", vol);
      if (master) master.gain.value = vol / 100;
    },
    // menüde madde değişince kısa, yumuşak bir tık
    tick() {
      const r = ready();
      if (!r) return;
      const { c, out } = r,
        t = c.currentTime;
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(950, t + 0.035);
      env(g, t, 0.002, 0.07, 0.045);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.09);
    },
    stamp() {
      const r = ready();
      if (!r) return;
      const { c, out } = r,
        t = c.currentTime;
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
      env(g, t, 0.004, 0.9, 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
      const n = noise(c, 0.09),
        f = c.createBiquadFilter(),
        g2 = c.createGain();
      f.type = "lowpass";
      f.frequency.value = 1500;
      env(g2, t, 0.002, 0.55, 0.07);
      n.connect(f).connect(g2).connect(out);
      n.start(t);
    },
    paper() {
      const r = ready();
      if (!r) return;
      const { c, out } = r,
        t = c.currentTime + 0.02;
      const n = noise(c, 0.3),
        f = c.createBiquadFilter(),
        g = c.createGain();
      f.type = "bandpass";
      f.frequency.setValueAtTime(1800, t);
      f.frequency.linearRampToValueAtTime(4200, t + 0.22);
      f.Q.value = 0.8;
      env(g, t, 0.05, 0.16, 0.2);
      n.connect(f).connect(g).connect(out);
      n.start(t);
    },
    clink() {
      const r = ready();
      if (!r) return;
      const { c, out } = r,
        t = c.currentTime + 0.05;
      [2637, 3951, 5274].forEach((fr, i) => {
        const o = c.createOscillator(),
          g = c.createGain();
        o.frequency.value = fr;
        env(g, t + i * 0.004, 0.002, 0.12 / (i + 1), 0.5);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.7);
      });
    },
    // Hicaz dörtlüsü: Re, Mi♭, Fa♯, Sol
    hicaz() {
      const r = ready();
      if (!r) return;
      const t = r.c.currentTime + 0.1;
      [
        [440, 0],
        [392, 0.3],
        [369.99, 0.6],
        [311.13, 0.9],
        [369.99, 1.25],
        [311.13, 1.5],
        [293.66, 1.8],
      ].forEach(([f, d]) => pluck(r.c, r.out, f, t + d, 0.45));
    },
    win() {
      const r = ready();
      if (!r) return;
      const t = r.c.currentTime + 0.08;
      [
        [293.66, 0],
        [369.99, 0.12],
        [440, 0.24],
        [587.33, 0.38],
        [587.33, 0.52],
      ].forEach(([f, d]) => pluck(r.c, r.out, f, t + d, 0.4));
    },
  };
})();

// ─── Göstergeler ──────────────────────────────────────────────────────────
const GLYPH: Record<string, { box: number[]; det: string; d: string }> = {
  h: {
    box: [6.5, 34],
    det: "",
    d: "M20 6.5a5.2 5.2 0 1 1 0 10.4a5.2 5.2 0 1 1 0-10.4Z M10.5 34C10.5 24.5 14.6 19.5 20 19.5S29.5 24.5 29.5 34Z M8 11a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2Z M2.5 32C2.5 25 4.8 21 8 21c1.8 0 3.2 1 4.2 2.6C10.6 26 9.6 29 9.4 32Z M32 11a3.6 3.6 0 1 1 0 7.2a3.6 3.6 0 1 1 0-7.2Z M37.5 32C37.5 25 35.2 21 32 21c-1.8 0-3.2 1-4.2 2.6C29.4 26 30.4 29 30.6 32Z",
  },
  k: {
    box: [7, 36],
    det: `<circle cx="20" cy="20" r="6.2"/><path d="M20 13.8v2.4M20 23.8v2.4M13.8 20h2.4M23.8 20h2.4M9 12v16"/>`,
    d: "M6 7H34a2 2 0 0 1 2 2V31a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z M8 33h5v3H8Z M27 33h5v3h-5Z",
  },
  e: {
    box: [5, 35],
    det: `<path d="M16.5 35V25h7v10M10 21h4v5h-4zM26 21h4v5h-4zM13.5 5l-1.8 7M20 5v7M26.5 5l1.8 7"/>`,
    d: "M8 5H32L36 12H4Z M4 12q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0q2 4.2 4 0Z M7 17H33V35H7Z",
  },
  a: {
    box: [3, 36],
    det: `<circle cx="20" cy="8.2" r="1.5"/>`,
    d: "M20 3L37 11H3Z M4 12H36V15.5H4Z M7 17H11V31H7Z M14.3 17H18.3V31H14.3Z M21.7 17H25.7V31H21.7Z M29 17H33V31H29Z M3 32H37V36H3Z",
  },
  // anket: sandık, içine oy pusulası giriyor
  p: {
    box: [3, 36],
    det: `<path d="M12 18h16M16.5 9.2l2.4 2.4 4.6-5"/>`,
    d: "M13 3H27V16H13Z M4 16H36V20H4Z M6 21H34V35a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z",
  },
};
const meterInner = (k: string, ad: string) => {
  const g = GLYPH[k];
  return `
  <div class="mi"><svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="cp-${k}"><rect class="lvl" x="-2" y="20" width="44" height="44"/></clipPath></defs>
  <path class="ghost" d="${g.d}"/><path class="fill" d="${g.d}" clip-path="url(#cp-${k})"/><g class="det">${g.det}</g></svg><span class="fx" aria-hidden="true"></span></div>
  <div class="mv"><b class="num">50</b><span class="lbl">${ad}</span></div>
  <span class="pv" aria-hidden="true"></span>`;
};
function buildMeters() {
  $("#meters").innerHTML = METERS.map(
    k => `<div class="meter" id="m-${k}" role="img" aria-label="${METER_AD[k]}">${meterInner(k, METER_AD[k])}</div>`,
  ).join("");
  $("#poll").innerHTML = meterInner("p", "Anket");
}
function tweenY(el: Element, to: number) {
  const rect = el as Anim;
  const from = rect._y ?? to,
    t0 = performance.now(),
    dur = reduced ? 1 : 700;
  cancelAnimationFrame(rect._raf ?? 0);
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / dur),
      e = 1 - Math.pow(1 - p, 3);
    const y = from + (to - from) * e;
    rect._y = y;
    rect.setAttribute("y", y.toFixed(2));
    if (p < 1) rect._raf = requestAnimationFrame(step);
  };
  rect._raf = requestAnimationFrame(step);
}
function tweenNum(node: Element, to: number) {
  const el = node as Anim;
  const from = el._v ?? to,
    t0 = performance.now(),
    dur = reduced ? 1 : 650;
  cancelAnimationFrame(el._raf ?? 0);
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / dur),
      e = 1 - Math.pow(1 - p, 3);
    el._v = Math.round(from + (to - from) * e);
    el.textContent = String(el._v);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
// Gösterge üstünde yükselip kaybolan "+8 / −12" fişi
function chip(k: string, v: number, tick = false) {
  if (!v) return;
  const box = $("#m-" + k + " .fx"),
    c = document.createElement("span");
  c.className = "chip " + (v > 0 ? "up" : "down") + (tick ? " tick" : "");
  c.textContent = (tick ? "↻ " : "") + (v > 0 ? "+" : "−") + Math.abs(v);
  box.appendChild(c);
  window.setTimeout(() => c.remove(), 1700);
}
// d: kararın etkisi · td: o ay işleyen kararların etkisi (biraz sonra gösterilir)
function setMeters(d?: Effect | null, td?: Effect | null) {
  const st = S!;
  METERS.forEach((k, i) => {
    const el = $<HTMLElement & Anim>("#m-" + k),
      v = st.m[k],
      g = GLYPH[k];
    tweenY(el.querySelector(".lvl")!, g.box[0] + (1 - v / 100) * (g.box[1] - g.box[0]));
    tweenNum(el.querySelector(".num")!, v);
    el.classList.toggle("danger", v <= 15 || (k !== "h" && v >= 85));
    el.classList.toggle("glory", k === "h" && v >= 85);
    el.setAttribute("aria-label", `${METER_AD[k]}: 100 üzerinden ${v}`);
    const tot = (d?.[i] || 0) + (td?.[i] || 0);
    if (tot) {
      el.classList.remove("up", "down");
      void el.offsetWidth;
      el.classList.add(tot > 0 ? "up" : "down");
      window.clearTimeout(el._t);
      el._t = window.setTimeout(() => el.classList.remove("up", "down"), 900);
    }
    if (d?.[i]) chip(k, d[i]);
    if (td?.[i]) window.setTimeout(() => chip(k, td[i], true), reduced ? 0 : 560);
  });
}
// Önizleme: ▲ artar ▼ azalır, ok sayısı büyüklük; renk: dengeye yaklaştırır / uzaklaştırır / tehlikeye sokar
function showHints(side: "L" | "R" | null) {
  METERS.forEach((k, i) => {
    const pv = $("#m-" + k + " .pv"),
      v = side && S?.cur ? S.cur[side].e[i] : 0;
    if (!v || !S) {
      pv.className = "pv";
      pv.textContent = "";
      return;
    }
    const n = Math.abs(v) >= 15 ? 3 : Math.abs(v) >= 8 ? 2 : 1,
      cur = S.m[k],
      nv = cur + v;
    const closer = Math.abs(nv - 50) < Math.abs(cur - 50);
    const tone =
      k === "h" && v > 0
        ? cur < 35
          ? "good"
          : "neutral"
        : nv <= 12 || nv >= 88
          ? "bad"
          : closer && Math.abs(cur - 50) >= 15
            ? "good"
            : !closer && (nv <= 25 || nv >= 75)
              ? "warn"
              : "neutral";
    pv.className = "pv on " + tone;
    pv.textContent = (v > 0 ? "▲" : "▼").repeat(n);
  });
  $("#ch-L").classList.toggle("hot", side === "L");
  $("#ch-R").classList.toggle("hot", side === "R");
}
const etkiKisa = (e: Effect | null | undefined) =>
  METERS.map((k, i) => (e?.[i] ? `${METER_AD[k]} ${e[i] > 0 ? "+" : "−"}${Math.abs(e[i])}` : null))
    .filter(Boolean)
    .join(", ");
// Yürürlükteki kararlar: sığarsa sabit durur, sığmazsa haber bandı gibi akar
function renderOngoing() {
  const box = $("#ongo"),
    list = $("#ongo-list"),
    items = S?.ongoing || [];
  box.classList.toggle("empty", !items.length); // şerit hep yerinde, evrak kaymaz
  const was = Number(list.querySelector(".ongo-track")?.getAnimations?.()[0]?.currentTime ?? 0);
  const html = items.length
    ? items
        .map(o => {
          const per = etkiKisa(o.e);
          const after = o.done ? ` → ${etkiKisa(o.done)}` : o.doneCard ? " → sürpriz" : "";
          const tail = (o.left != null ? `${o.left} ay` : "süresiz") + after;
          return `<span class="pol${o.proj ? " proj" : ""}"><b>${esc(o.ad)}</b>${per ? `<i>${esc(per)}/ay</i>` : ""}<em>${esc(tail)}</em></span>`;
        })
        .join("")
    : `<span class="pol none">Her ay işleyen karar yok</span>`;
  list.innerHTML = `<div class="ongo-track">${html}</div>`;
  list.dataset.html = html;
  fitTicker(was);
}
function fitTicker(at = 0) {
  const list = $("#ongo-list"),
    track = list.querySelector<HTMLElement>(".ongo-track");
  if (!track) return;
  track.innerHTML = list.dataset.html ?? "";
  track.classList.remove("run");
  list.classList.remove("moving");
  const w = track.scrollWidth;
  if (reduced || w <= list.clientWidth + 1) return;
  const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5;
  track.insertAdjacentHTML(
    "beforeend",
    `<span class="tgap" aria-hidden="true"></span><span class="tcopy" aria-hidden="true">${list.dataset.html}</span>`,
  );
  const dist = w + gap,
    pxPerSec = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.6;
  track.style.setProperty("--dist", dist + "px");
  track.style.setProperty("--dur", (dist / pxPerSec).toFixed(2) + "s");
  track.classList.add("run");
  list.classList.add("moving");
  const anim = track.getAnimations?.()[0];
  if (anim && at) anim.currentTime = at % ((dist / pxPerSec) * 1000);
}
let fitT = 0;
addEventListener("resize", () => {
  window.clearTimeout(fitT);
  fitT = window.setTimeout(() => {
    if (screen === "game") fitTicker();
  }, 150);
});
// ─── Olay günlüğü: her karar bir kayıt, ardından gelen tepkiler altına eklenir ─
// Geniş ekranda sağda hep açık (toast yerine geçer), dar ekranda çekmecede; kayıt oyunla birlikte saklanır.
const LOG_MAX = 40,
  wideLog = matchMedia("(min-width: 1100px)");
let logUnread = 0;
function journalAdd(card: Cur, side: "L" | "R", res: ChooseOut, m: number) {
  if (!S || card.kind === "intro" || card.kind === "ending" || card.kind === "acilis") return;
  (S.journal ||= []).push({ m, who: card.who, konu: card.konu, side, t: card[side].t, e: res.d, notes: [] });
  if (S.journal.length > LOG_MAX) S.journal.shift();
  renderLog(true);
}
function journalNote(html: string, cls?: string) {
  const last = S?.journal?.at(-1);
  if (!S || !last) return;
  last.notes.push({ html, cls });
  if (!S.over) LS.set("save", S);
  renderLog(true);
}
function renderLog(fresh: boolean) {
  const J = S?.journal || [];
  // her evrak bir ay: tarih kaydın köşesinde, başlık olarak yalnız yıllar
  let html = "",
    year: string | undefined;
  for (let i = J.length - 1; i >= 0; i--) {
    const j = J[i],
      P = PEOPLE[j.who],
      date = dateLabel(j.m),
      yr = date.split(" ").pop();
    if (yr !== year) {
      year = yr;
      html += `<li class="lg-m">${esc(yr)}</li>`;
    }
    const eff = METERS.map((k, n) =>
      j.e?.[n]
        ? `<span class="${j.e[n] > 0 ? "p" : "n"}">${METER_AD[k]} ${j.e[n] > 0 ? "+" : "−"}${Math.abs(j.e[n])}</span>`
        : "",
    ).join("");
    html += `<li class="lg-e${fresh && i === J.length - 1 ? " new" : ""}">
      <div class="lg-d"><b>${esc(P?.ad || "")}</b><span>${esc(j.konu)}</span><time>${esc(date.replace(/ \d+$/, ""))}</time></div>
      <div class="lg-t"><i class="ink ${j.side}" aria-hidden="true"></i>“${esc(j.t)}”</div>
      ${eff ? `<div class="lg-x">${eff}</div>` : ""}${j.notes.map(n => `<div class="lg-n ${n.cls}">${n.html}</div>`).join("")}</li>`;
  }
  $("#log-list").innerHTML =
    html ||
    `<li class="lg-empty">Masaya henüz evrak gelmedi. İmzaladığınız her karar ve ardından olanlar buraya yazılır.</li>`;
  if (fresh && !wideLog.matches && !$("#log").classList.contains("open")) logUnread++;
  const n = $("#log-n");
  n.hidden = !logUnread;
  n.textContent = logUnread > 9 ? "9+" : String(logUnread);
}
function openLog(open: boolean) {
  const log = $("#log"),
    btn = $("#btn-log");
  if (open === log.classList.contains("open")) return;
  log.classList.toggle("open", open);
  $("#log-scrim").classList.toggle("on", open);
  btn.setAttribute("aria-expanded", String(open));
  if (open) {
    logUnread = 0;
    renderLog(false);
    $("#log-list").scrollTop = 0;
    $("#btn-log-x").focus();
  } else if (!wideLog.matches) btn.focus();
}
function toast(html: string, cls = "") {
  journalNote(html, cls);
  if (wideLog.matches) return; // geniş ekranda günlük zaten görünüyor
  const box = $("#toasts"),
    t = document.createElement("div");
  t.className = "toast " + cls;
  t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 2) box.firstElementChild?.remove();
  window.setTimeout(() => t.classList.add("out"), 2300);
  window.setTimeout(() => t.remove(), 2800);
}
// Bir gösterge tehlike bölgesine yeni girdiyse uyar
function dangerToast(before: Meters) {
  const risky = (k: Meter, v: number) => v <= 15 || (k !== "h" && v >= 85);
  const m = st().m;
  const hot = METERS.filter(k => risky(k, m[k]) && !risky(k, before[k]));
  hot.forEach((k, i) =>
    window.setTimeout(
      () =>
        toast(
          `<b>Dikkat</b>${METER_AD[k]} ${m[k] <= 15 ? "dibe yaklaşıyor" : k === "e" ? "tavana dayanıyor, erken seçim kapıda" : k === "a" ? "tavana dayanıyor, sizi yukarı çağıracaklar" : "tavana dayanıyor"}<span class="tr n">${m[k]}</span>`,
          "warn",
        ),
      900 + i * 250,
    ),
  );
  if (m.h >= 85 && before.h < 85)
    window.setTimeout(
      () => toast(`<b>Halk</b>sizi bağrına bastı; sandık kurulsa kazanırsınız<span class="tr p">${m.h}</span>`, "ev"),
      900,
    );
}
function reactions(c: Cur, res: ChooseOut, side: "L" | "R") {
  // hafıza notu: bu karar unutulmayacak (gecikmeli sonucun ilk işareti)
  const nt = c[side].not;
  if (nt) toast(`<b>Not</b>${esc(nt)}`, "ev");
  for (const [w, dv] of Object.entries(res.rel || {})) {
    const P = PEOPLE[w];
    if (!P) continue;
    const pool = dv > 0 ? P.pos || REACT.pos : P.neg || REACT.neg;
    const line = w === c.who ? `“${pickOne(pool)}”` : dv > 0 ? "bunu duydu, memnun kaldı." : "bunu duydu, kırıldı.";
    toast(
      `<b>${esc(P.ad)}</b>${esc(line)}<span class="tr ${dv > 0 ? "p" : "n"}">${dv > 0 ? "▲" : "▼"} ${esc(REL_AD[st().rel[w] || 0])}</span>`,
    );
  }
  (res.events || []).forEach((ev, i) => {
    const sum = ev.e ? ev.e.reduce((a, v) => a + v, 0) : 0;
    window.setTimeout(
      () =>
        toast(
          `<b>${esc(ev.ad)}</b>${esc(ev.msg)}${ev.e ? `<span class="tr ${sum < 0 ? "n" : "p"}">${esc(etkiKisa(ev.e))}${ev.syn ? "/ay" : ""}</span>` : ""}`,
          sum < 0 ? "warn" : "ev",
        ),
      650 + i * 300,
    );
  });
}

// ─── Evrak ────────────────────────────────────────────────────────────────
const SEAL = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="20" cy="20" r="13.2" fill="none" stroke="currentColor" stroke-width=".8"/><g fill="currentColor">${Array.from(
  { length: 28 },
  (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return `<circle cx="${(20 + Math.cos(a) * 15.7).toFixed(2)}" cy="${(20 + Math.sin(a) * 15.7).toFixed(2)}" r=".75"/>`;
  },
).join(
  "",
)}</g><ellipse cx="20" cy="21" rx="7.4" ry="5.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M13.6 19.4c4.2 1.6 8.6 1.6 12.8 0M13 22.4c4.6 1.6 9.4 1.6 14 0M20 15.2v-2.4c1-1.3 2.4-1.5 3.6-1.1" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/></svg>`;
const CLIP = `<svg class="clip" viewBox="0 0 12 36" aria-hidden="true"><path d="M3 33V7a3.5 3.5 0 0 1 7 0v21a2.3 2.3 0 0 1-4.6 0V9" fill="none" stroke="#8d949c" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const BIRIM: Record<string, string> = {
  fikret: "Özel Kalem Müdürlüğü",
  kemal: "Fen İşleri Müdürlüğü",
  sevim: "Mali Hizmetler Müdürlüğü",
  recep: "Zabıta Müdürlüğü",
  huseyin: "Destek Hizmetleri Müdürlüğü",
  tekir: "Kapı Önü",
  kaymakam: "Kaymakamlık Yazısı",
  vekil: "Ankara Hattı",
};
function signature(seed: number) {
  const r = rngOf(seed);
  let x = 6,
    d = `M${x} ${18 + r() * 10}`;
  for (let i = 0; i < 5; i++) {
    const nx = x + 9 + r() * 12;
    d += ` C${(x + r() * 14).toFixed(1)} ${(r() * 36).toFixed(1)} ${(nx - r() * 14).toFixed(1)} ${(r() * 36).toFixed(1)} ${nx.toFixed(1)} ${(8 + r() * 22).toFixed(1)}`;
    x = nx;
  }
  d += ` M3 ${(30 + r() * 3).toFixed(1)} Q${(x / 2).toFixed(1)} ${(35 + r() * 3).toFixed(1)} ${(x + 8).toFixed(1)} ${(25 + r() * 5).toFixed(1)}`;
  return `<svg class="sig" viewBox="0 0 ${(x + 12).toFixed(0)} 40" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--pen)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const relCls = (r: number) => (r >= 2 ? "hot" : r <= -2 ? "cold" : r > 0 ? "warm" : r < 0 ? "cool" : "");
function relHTML(r: number | null) {
  if (r == null) return "";
  const segs = [-3, -2, -1, 0, 1, 2, 3].map(x => `<i class="${x === r ? "on" : ""}"></i>`).join("");
  return `<div class="rel ${relCls(r)}"><span>Aranız</span><b>${REL_AD[r]}</b><span class="rd" aria-hidden="true">${segs}</span></div>`;
}
const moodOf = (r: number | null) =>
  r == null
    ? ""
    : r <= -2
      ? "Kaşları çatık; bir ret daha kaldırmaz."
      : r >= 2
        ? "Güler yüzlü; hayır deseniz de anlayış gösterir."
        : "";
function optNote(o: Side) {
  const bits: string[] = [];
  if (o.pol) {
    // aylık etkisi olan karar hep görünür; bitişinde bir sonucu varsa "sonu var" diye telgraf çekilir
    const p = o.pol,
      per = etkiKisa(p.e);
    if (per) bits.push(`her ay ${per}${p.ay ? `, ${p.ay} ay` : ", süresiz"}`);
    if (p.done || p.doneCard) bits.push(per ? "sonu var" : `${p.ay} ay sürecek iş`);
    if (p.yan?.length) bits.push("yan etkisi olabilir");
  }
  if (o.son && S?.cur?.kind !== "davet") bits.push("oyun biter");
  if (o.cut) bits.push("uygulamayı kaldırır");
  if (o.next) bits.push("devamı gelecek");
  // vaat defteri: tutulmayan vaat sandıkta ödenir, tutulan geri alınır
  const cnt = (x: Side["inc"]): Record<string, number> => (typeof x === "string" ? { [x]: 1 } : x || {});
  if (cnt(o.inc).vaat) bits.push("vaat verilir");
  if (cnt(o.dec).vaat) bits.push("vaat yerine gelir");
  // sandık defteri
  if (o.anket) bits.push(o.anket.puan < 0 ? "skandal olur" : "sandıkta anılır");
  return bits.join(" · ");
}
function renderCard(c: Cur) {
  const P = PEOPLE[c.who];
  const el = document.createElement("article");
  el.className = "card enter";
  el.id = "card";
  el.setAttribute("aria-label", `${P.ad}: ${c.konu}`);
  const ivedi = c.kind === "ending" || c.kind === "secim" || c.kind === "davet" || c.konu === "ACİL";
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
  const old = document.querySelector<HTMLElement>("#card");
  if (old) {
    interact(old).unset();
    old.remove();
  }
  $("#stack").appendChild(el);
  el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
  bindDrag(el);
  $("#ch-L .t").textContent = c.L.t;
  $("#ch-R .t").textContent = c.R.t;
  $("#ch-L .n").textContent = optNote(c.L);
  $("#ch-R .n").textContent = optNote(c.R);
  $("#announce").textContent = `${P.ad}, ${P.unvan}: ${c.text}`;
}
function tilt(el: HTMLElement, dx: number) {
  const w = el.offsetWidth || 360,
    p = Math.max(-1, Math.min(1, dx / (w * 0.3)));
  el.style.transform = `translateX(${dx}px) rotate(${dx * 0.045}deg)`;
  el.querySelector<HTMLElement>(".stamp.L")!.style.opacity = String(p < 0 ? Math.min(1, -p * 1.15) : 0);
  el.querySelector<HTMLElement>(".stamp.R")!.style.opacity = String(p > 0 ? Math.min(1, p * 1.15) : 0);
  showHints(p < -0.12 ? "L" : p > 0.12 ? "R" : null);
}
function untilt(el: HTMLElement | null) {
  if (!el) return;
  el.style.transition = "transform .35s cubic-bezier(.3,1.3,.5,1)";
  el.style.transform = "";
  el.querySelectorAll<HTMLElement>(".stamp").forEach(x => {
    x.style.opacity = "0";
  });
  showHints(null);
}
// Evrak sürükleme: interact.js işaretçi farklarını, yön kilidini ve fiske hızını yönetir.
// Karar iki yoldan verilir: yeterince uzağa sürüklemek ya da kısa ama hızlı bir fiske.
function bindDrag(el: HTMLElement) {
  let dx = 0;
  interact(el)
    .styleCursor(false)
    .draggable({
      startAxis: "x",
      lockAxis: "x", // dikey hareketle sürükleme hiç başlamaz
      listeners: {
        start() {
          dx = 0;
          if (busy) return;
          el.classList.remove("enter");
          el.classList.add("dragging");
          el.style.transition = "none";
        },
        move(e) {
          if (busy) return;
          dx += e.dx;
          tilt(el, dx);
        },
        end(e) {
          el.classList.remove("dragging");
          if (busy) return;
          const w = el.offsetWidth || 360;
          // Fiske: bırakmadan hemen önceki yatay hız (interact.js ölçer) yeterliyse kısa sürükleme de karar sayılır
          const pv = e.interaction?.prevEvent,
            vx = pv?.velocityX || 0,
            fresh = pv && e.timeStamp - pv.timeStamp < 160;
          const flick =
            Math.abs(dx) >= 20 &&
            ((e.swipe && (e.swipe.left || e.swipe.right)) ||
              (fresh && Math.abs(vx) >= 260 && Math.sign(vx) === Math.sign(dx)));
          if (flick) commit(dx < 0 ? "L" : "R", true);
          else if (Math.abs(dx) > Math.max(70, w * 0.26)) commit(dx < 0 ? "L" : "R", true);
          else untilt(el);
        },
      },
    });
}
function setChoices(disabled: boolean) {
  $<HTMLButtonElement>("#ch-L").disabled = disabled;
  $<HTMLButtonElement>("#ch-R").disabled = disabled;
}

async function commit(side: "L" | "R", dragged = false) {
  if (busy || !S?.cur || screen !== "game") return;
  const el = document.querySelector<HTMLElement>("#card");
  if (!el) return;
  const s = S,
    card = S.cur; // await'ler boyunca aynı oyun
  busy = true;
  setChoices(true);
  closeNote();
  const dir = side === "L" ? -1 : 1;
  if (!dragged) {
    el.classList.remove("enter");
    el.style.transition = "transform .16s ease-out";
    tilt(el, dir * 46);
    await wait(reduced ? 0 : 150);
  }
  const stamp = el.querySelector<HTMLElement>(".stamp." + side)!;
  stamp.style.opacity = "";
  stamp.classList.add("slam");
  el.querySelector<HTMLElement>(".stamp." + (side === "L" ? "R" : "L"))!.style.opacity = "0";
  snd.stamp();
  vibrate(14);
  const kind = card.kind,
    before = { ...s.m },
    month = s.month;
  const res = choose(s, side);
  showHints(null);
  setMeters(res.d, res.td);
  journalAdd(card, side, res, month);
  reactions(card, res, side);
  renderOngoing();
  updateHud();
  if (!res.dead) dangerToast(before);
  if (kind === "cay") snd.clink();
  if (kind === "sonuc") snd.win();
  if (!s.over) LS.set("save", s);
  await wait(reduced ? 140 : 400);
  el.style.transition = "transform .42s cubic-bezier(.5,0,.75,0), opacity .42s ease-in";
  el.style.transform = `translateX(${dir * 135}%) translateY(40px) rotate(${dir * 24}deg)`;
  el.style.opacity = "0";
  await wait(reduced ? 60 : 300);
  busy = false;
  setChoices(false);
  if (s.over) return gameOver();
  if (kind === "secim" && s.pending?.type === "sonuc" && s.pending.res) {
    await electionNight(s.pending.res);
    show("game");
  }
  nextCard();
}
function nextCard() {
  const s = st(),
    c = draw(s);
  renderCard(c);
  if (c.kind === "secim" || s.month % TERM >= TERM - 10) tvYukle();
  updateHud();
  snd.paper();
  LS.set("save", s);
}
// Üst bar: takvim, seçim geri sayımı, anket, dönem rozeti
function updateHud() {
  if (!S) return;
  const left = TERM - 1 - (S.month % TERM),
    last = S.term >= MAX_TERMS,
    near = left <= 12 && !last;
  const poll = Math.round(pollOf(S));
  $("#dateline").textContent = dateLabel(S.month);
  $("#countdown").textContent = last ? "Son dönem" : `Seçime ${left ? left + " ay" : "bu ay"}`;
  $("#countdown").classList.toggle("near", near);
  $("#termline").textContent = `${S.term}. dönem`;
  const pb = GLYPH.p.box;
  tweenY($("#poll .lvl"), pb[0] + (1 - poll / 100) * (pb[1] - pb[0]));
  tweenNum($("#poll .num"), poll);
  $("#poll").classList.toggle("warn", near && poll <= 50);
  const vaat = S.cnt?.vaat || 0,
    vc = vaatCost(S),
    df = defterOf(S);
  $("#poll").setAttribute("aria-label", `Anket: yüzde ${poll}`);
  $("#poll").title =
    `Anket %${poll}` +
    (vaat ? ` · tutulmamış ${vaat} vaat sandıkta −${vc} puan` : "") +
    (df ? ` · sandık defteri ${df > 0 ? "+" : "−"}${Math.abs(Math.round(df * 10) / 10)} puan` : "");
  $("#poll").classList.toggle("vaat", vaat > 0);
  $("#danis-n").textContent = String(S.danis);
  $("#btn-danis").classList.toggle("spent", S.danis <= 0);
  $("#btn-danis").title =
    S.danis > 0 ? `Fikret'e danışın (bu dönem ${S.danis} hak)` : "Bu dönemki danışma hakkınız bitti";
}

// ─── Fikret'e sor: kural tabanlı makam şefi ───────────────────────────────
function openNote(text: string) {
  let n = document.querySelector<HTMLElement>("#note");
  if (!n) {
    n = document.createElement("div");
    n.id = "note";
    n.className = "note";
    n.setAttribute("role", "status");
    n.addEventListener("click", closeNote);
    n.innerHTML = `<b>Fikret'in notu</b><span></span>`;
    $("#stack").appendChild(n);
  }
  n.querySelector("span")!.textContent = text;
}
function closeNote() {
  $("#note")?.remove();
}
const SOZ: Record<Meter, string[]> = {
  h: ["halk", "sevinir", "söylenir"],
  k: ["kasa", "rahatlar", "sarsılır"],
  e: ["esnaf", "memnun olur", "kızar"],
  a: ["Ankara", "göz kırpar", "kaş çatar"],
};
const ASIRI: Record<Meter, string> = {
  h: "halk fazla şımarır",
  k: "kasa gereğinden fazla şişer",
  e: "esnaf fazla güçlenir",
  a: "Ankara fazla yakınlaşır",
};
const miktar = (a: number) => (a >= 15 ? "çok " : a >= 8 ? "epey " : "biraz ");
const listTR = (a: string[]) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " ve " + a[a.length - 1]);
function sozle(e: Effect, n = 2) {
  return listTR(
    METERS.map((k, i) => ({ k, v: e[i] }))
      .filter(x => x.v)
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
      .slice(0, n)
      .map(({ k, v }) => `${SOZ[k][0]} ${miktar(Math.abs(v))}${SOZ[k][v > 0 ? 1 : 2]}`),
  );
}
// Seçeneği, yürürlüğe girecek kararın bir yıllık etkisiyle birlikte tartar
function tart(s: State, o: Side, nearE: boolean) {
  const e = o.e.slice(),
    pol = o.pol;
  if (pol?.e)
    pol.e.forEach((v, i) => {
      e[i] += v * Math.min(pol.ay ?? 12, 12) * 0.5;
    });
  if (pol?.done)
    pol.done.forEach((v, i) => {
      e[i] += v * 0.6;
    });
  let r = Math.max(...METERS.map((k, i) => edgeRisk(k, s.m[k] + e[i])));
  if (METERS.some((k, i) => s.m[k] + o.e[i] <= 8 || (k !== "h" && s.m[k] + o.e[i] >= 92))) r += 40;
  if (nearE) r -= e[0] * 0.6;
  return r;
}
// Ankara'dan davet: hesap değil gönül işi; Fikret teklifin kademesine göre konuşur
const DAVET_OGUT = [
  "Başkanım, gidin derim; böyle kapı her gün açılmaz. Ama reddederseniz Ankara biraz küser, halk da sizi bağrına basar. Gitmezseniz çayınızı ben demlerim.",
  "Milletvekilliği büyük iş başkanım. Yalnız Suat Bey'in yüzüne bir bakın; reddederseniz ömür boyu size borçlu kalır, o borç da bir gün ödenek olur.",
  "Başkanım, bu sefer bakan yardımcılığı. Bir daha hayır derseniz Ankara denetçi gönderir, bilesiniz. Ama gönlünüz Karakavak'taysa ben de buradayım.",
];
function fikretAdvice(s: State) {
  const c = s.cur!,
    left = TERM - 1 - (s.month % TERM),
    nearE = left <= 12 && s.term < MAX_TERMS;
  if (c.kind === "davet") return DAVET_OGUT[Math.min(s.cnt.ankara_ret || 0, DAVET_OGUT.length - 1)];
  if (c.kind === "secim") {
    const p = pollOf(s),
      f = c.early ? s.earlyField : s.field,
      n = f ? f.extras.length + 2 : 2;
    const split =
      n > 2 ? ` ${n} aday var, oylar bölünecek; birinci çıkmak yeter.` : " Teke tek yarış; yüzde elliyi geçen kazanır.";
    return p >= 55
      ? `Anket iyi başkanım, %${Math.round(p)}.${split} Kasayı yormayalım, sessiz kalsak da olur.`
      : `Başkanım, anket %${Math.round(p)}.${split} Kıl payı işler bunlar; meydana çıkalım, her oy lazım.`;
  }
  const best = tart(s, c.L, nearE) <= tart(s, c.R, nearE) ? "L" : "R",
    b = c[best],
    o = c[best === "L" ? "R" : "L"];
  const opener = pickOne([
    "Başkanım, bence",
    "Benden söylemesi başkanım:",
    "Çayınızı koyarken bir şey diyeyim:",
    "Kulağınıza fısıldayayım başkanım:",
  ]);
  let t = `${opener} “${b.t}” deyin; ${sozle(b.e) || "pek bir şey değişmez"}.`;
  const tehlike = METERS.filter((k, i) => s.m[k] + o.e[i] <= 12 || (k !== "h" && s.m[k] + o.e[i] >= 88));
  if (tehlike.length) t += ` “${o.t}” derseniz ${SOZ[tehlike[0]][0]} tehlikeye girer, Allah korusun.`;
  else {
    // Öbür seçeneğin uzaklaştırdığı göstergelerden uca en yakın düşeni
    const harm = METERS.map((k, i) => ({
      k,
      v: o.e[i],
      f: edgeRisk(k, s.m[k] + o.e[i]),
      d: edgeRisk(k, s.m[k] + o.e[i]) - edgeRisk(k, s.m[k]),
    }))
      .filter(x => x.v && x.d > 0)
      .sort((x, y) => y.f - x.f)[0];
    if (harm)
      t += ` Öbürü de olur ama ${harm.v > 0 && s.m[harm.k] >= 50 ? ASIRI[harm.k] : `${SOZ[harm.k][0]} ${miktar(Math.abs(harm.v))}${SOZ[harm.k][harm.v > 0 ? 1 : 2]}`}.`;
  }
  if (b.pol) {
    const per = b.pol.e || Z;
    t +=
      b.pol.done || b.pol.doneCard
        ? " Yalnız iş uzun sürer, sabır ister."
        : per.some(v => v < 0)
          ? " Yalnız bu karar her ay cepten yer, unutmayın."
          : " Üstelik her ay bir getirisi olur.";
  } else if (b.next) t += " Bunun bir devamı olacak, bilesiniz.";
  const vaatOf = (x: Side["inc"]) => (typeof x === "string" ? x === "vaat" : !!x?.vaat);
  if (vaatOf(b.inc)) t += " Bu bir vaat ama; tutmazsak sandıkta hesabını sorarlar.";
  else if (vaatOf(b.dec)) t += " Hem verdiğimiz bir sözü de yerine getirmiş oluruz.";
  if (c.rel != null && c.rel <= -2) t += ` ${PEOPLE[c.who].ad} zaten dargın; fazla üstüne gitmeyin.`;
  else if (nearE && b.e[0] < 0) t += " Seçim yakın ama; halk bunu unutmaz.";
  return t;
}
function danis() {
  if (!S?.cur || busy || screen !== "game") return;
  if ($("#note")) return closeNote();
  if (["intro", "ending", "tekir", "sonuc", "cay", "acilis"].includes(S.cur.kind)) {
    openNote("Bu evrakta akıl verecek bir şey yok başkanım, gönül rahatlığıyla imzalayın.");
    return;
  }
  if (S.danis <= 0) {
    openNote("Bu dönem üç kere akıl verdim başkanım; gerisi sizin sezginize kalmış.");
    return;
  }
  S.danis--;
  LS.set("save", S);
  updateHud();
  openNote(fikretAdvice(S));
  snd.clink();
}

// ─── Oyun sonu: Karakavak Postası ─────────────────────────────────────────
const sumAbs = (e: Effect) => e.reduce((a, v) => a + Math.abs(v), 0);
function article(s: State, name: string): Article {
  const o = s.over!,
    E = ENDINGS[o.key],
    kim = name ? `Başkan ${name}` : "başkan";
  const picks = s.log
    .slice()
    .sort((a, b) => sumAbs(b.e) - sumAbs(a.e))
    .slice(0, 2)
    .sort((a, b) => a.m - b.m);
  let haber = `Nisan 2029'da göreve başlayan ${kim}, ${durLabel(o.months)} süren dönemini ${dateLabel(o.months)} itibarıyla kapattı. Bu sürede makamdan ${s.signed} evrak geçti${s.cay ? `, ${s.cay} bardak çay içildi` : "; Fikret'in bir bardak çay getirmeye bile fırsatı olmadı"}.`;
  if (picks.length === 2)
    haber += `\nDönemin akıllarda kalan kararları arasında ${PEOPLE[picks[0].who].ad} dosyasındaki “${picks[0].t}” talimatı ile ${PEOPLE[picks[1].who].ad} ile görüşülen “${picks[1].konu.toLocaleLowerCase("tr")}” meselesinde verilen “${picks[1].t}” kararı öne çıkıyor.`;
  if (s.bitti?.length) haber += ` Dönemde ${listTR(s.bitti.slice(-3).map(x => x.toLocaleLowerCase("tr")))} tamamlandı.`;
  const dost = Object.entries(s.rel)
    .filter(([, v]) => v >= 2)
    .map(([w]) => PEOPLE[w].ad);
  const kus = Object.entries(s.rel)
    .filter(([, v]) => v <= -2)
    .map(([w]) => PEOPLE[w].ad);
  if (dost.length && kus.length)
    haber += `\nKulislerde başkanın en yakınları olarak ${listTR(dost.slice(0, 2))} anılırken ${listTR(kus.slice(0, 2))} ile arasının açık olduğu biliniyor.`;
  else if (dost.length)
    haber += `\nBaşkanın zor günlerde yanından ayrılmayanlar arasında ${listTR(dost.slice(0, 3))} vardı.`;
  else if (kus.length) haber += `\n${listTR(kus.slice(0, 2))} ise başkanın kapısını son aylarda hiç çalmadı.`;
  const kara = (s.defter || []).filter(k => k.puan < 0).sort((a, b) => a.puan - b.puan)[0];
  if (kara) haber += ` Dönemin en çok konuşulan dosyası “${kara.ad}” oldu.`;
  const miras = mirasOf(s);
  if (miras.length) haber += "\n" + miras.join(" ");
  haber += ` Makam şefi Fikret gazetemize kısa bir açıklama yaptı: “${pickOne(QUOTES)}”`;
  const el = s.lastElection;
  const spot =
    o.key === "sandik" && el && el.cands[0].id !== "you"
      ? `${PEOPLE[el.cands[0].id].ad} ${pctTR(el.cands[0].pct)} ile Karakavak'ın yeni belediye başkanı oldu; ${el.cands.length} adaylı yarışta başkan ${pctTR(el.you)} ile ${el.cands.findIndex(c => c.id === "you") + 1}. sırada kaldı.`
      : E.spot;
  return { manset: E.manset, spot, haber, kulis: pickOne(KULIS) };
}
function renderPaper(lo: LastOver) {
  const { s, art } = lo,
    o = s.over!,
    E = ENDINGS[o.key],
    P = PEOPLE[E.who];
  const issue = 1200 + o.months * 4 + (s.signed % 7);
  $("#paper").innerHTML = `
    <header class="mast">
      <div class="mast-top"><span>Kuruluş 1961</span><span>Sayı ${issue}</span><span>Fiyatı 10 TL</span></div>
      <div class="mast-name">KARAKAVAK POSTASI</div>
      <div class="mast-sub">Haftalık siyasi, kültürel ve kavun gazetesi · ${dateLabel(o.months)}</div>
    </header>
    <div class="np-main">
      <div class="np-lead">
        <div class="kicker">${E.win ? "MÜJDE" : "SON DAKİKA"}</div>
        <h2 class="headline">${esc(art.manset)}</h2>
        <div class="np-grid">
          <figure class="np-photo"><div class="ht">${photo(E.who)}</div><figcaption>${esc(P.ad)} (${esc(P.unvan)}) olayları gazetemize anlattı.</figcaption></figure>
          <p class="spot">${esc(art.spot)}</p><div class="haber">${art.haber
            .split(/\n+/)
            .map(p => `<p>${esc(p)}</p>`)
            .join("")}</div>
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
function dropPaper() {
  const p = $("#paper");
  p.classList.remove("fresh");
  void p.offsetWidth;
  p.classList.add("fresh");
}
function gameOver() {
  const s = st(),
    o = s.over!,
    name = playerName();
  LS.del("save");
  const art = article(s, name);
  const rec: HallRec = {
    gid: s.gid,
    name,
    avatar: playerAvatar(),
    months: o.months,
    key: o.key,
    term: o.term,
    headline: art.manset,
    at: Date.now(),
  };
  const best = LS.get<HallRec | null>("best", null);
  if (!best || o.months > best.months) LS.set("best", rec);
  hallAdd(rec);
  sonlarAdd(o.key);
  lastOver = { s, rec, art };
  renderPaper(lastOver);
  show("over");
  dropPaper();
  $("#scr-over").scrollTop = 0;
  if (ENDINGS[o.key].win) snd.win();
  else snd.hicaz(); // terfi yenilgi gibi çalınmaz
}

// ─── Seçim gecesi: KARAKAVAK TV canlı yayını. Sonuç baştan belli (engine.ts tally), ekran sandık sandık açar.
// Yazılar broadcast.ts'ten (KJ, kayan yazı, kur, "Neden?"), spiker anchor.ts'ten; yerleşim secim.css'teki sözleşmede.
const EC_RENK: Record<string, string> = {
  you: "#e2bd5a",
  nermin: "#e8715a",
  vekil: "#6f9be6",
  cengiz: "#c09a70",
  kaan: "#a78cf0",
  bekir: "#5cc08a",
  muhtar: "#e0a860",
  tuncay: "#a9b2bf",
  burak: "#ef7fb4",
  albay: "#a3b86a",
  tekir: "#f5a94a",
};
// mahalle: blok karışımı [halk, esnaf, parti tabanı, kararsız], sandık sayısı, sandık büyüklüğü çarpanı.
// Açılış sırası köylerden merkeze; en son traktörlü Yukarıkavak'ın tek küçük sandığı (o gelmeden sayım %99'u geçer).
const MAHALLE: [string, number[], number, number?][] = [
  ["Kavun Ovası", [0.7, 0.1, 0.1, 0.1], 4],
  ["Çarşı", [0.3, 0.55, 0.05, 0.1], 3],
  ["Sanayi", [0.45, 0.4, 0.05, 0.1], 2],
  ["Lojmanlar", [0.3, 0.05, 0.55, 0.1], 2],
  ["Merkez", [0.5, 0.15, 0.2, 0.15], 4],
  ["Kavaklı", [0.8, 0.05, 0.05, 0.1], 3],
  ["Öğrenci yurdu", [0.3, 0.02, 0.03, 0.65], 2],
  ["Yukarıkavak", [0.75, 0.05, 0.15, 0.05], 1, 0.12],
];
const candName = (id: string) => (id === "you" ? playerName() : PEOPLE[id].ad);
// ilk: göreve başlamadan önceki seçim (açılış); oyuncu henüz başkan değil
const candLabel = (id: string, ilk = false) =>
  id === "you" ? (ilk ? "Belediye başkan adayı" : "Belediye Başkanı, yeniden aday") : ADAYLAR[id].etiket;
const candPic = (id: string) => photoSrc(id === "you" ? playerAvatar() : id);
const pctTR = (v: number) => "%" + v.toFixed(1).replace(".", ",");
const pct2 = (v: number) => v.toFixed(2).replace(".", ",");
const oyTR = (v: number) => Math.round(v).toLocaleString("tr");
// Sandıklar mahallenin seçmen karışımından üretilir; her adayın toplamı kesin sonuca eşitlenir (ekran gerçeği gösterir, yalnız sırasını dramatize eder)
function ballotBoxes(res: Tally, rng: Rng) {
  const boxes: { mi: number; v: number[] }[] = [];
  MAHALLE.forEach(([, mix, k, olcek = 1], mi) => {
    for (let j = 0; j < k; j++) {
      const size = (380 + Math.floor(rng() * 320)) * olcek;
      boxes.push({
        mi,
        v: res.cands.map(
          (_c, i) =>
            size *
            Math.max(
              0.002,
              mix.reduce((a, m, b) => a + (m * res.blocs[b].pay[i]) / 100, 0),
            ) *
            (0.8 + rng() * 0.4),
        ),
      });
    }
  });
  const total = boxes.reduce((a, b) => a + b.v.reduce((x, y) => x + y, 0), 0);
  res.cands.forEach((c, i) => {
    const col = boxes.reduce((a, b) => a + b.v[i], 0);
    boxes.forEach(b => {
      b.v[i] *= ((c.pct / 100) * total) / col;
    });
  });
  return boxes;
}
let tvStop: (() => void) | null = null; // açık yayının zamanlayıcılarını ve spikeri durdurur
// Seçim gecesi ayrı parçada (secim.ts): seçim yaklaşınca önceden, en geç yayın açılırken yüklenir
let tvP: Promise<typeof import("./secim.ts")> | null = null;
// lider değişimi ve mahalle haberinin KJ bağlamına eklediği
type KjExtra = { prev?: string | null; lead?: string | null; mahalle?: string };
const tvYukle = () => (tvP ||= import("./secim.ts"));
async function electionNight(res: Tally): Promise<void> {
  const tv = await tvYukle(),
    { fx, kj, ticker, tvName, tvNumEk, tvShort, studio, studioSVG } = tv;
  tvStop?.();
  return new Promise<void>(done => {
    const r = rngOf(res.month * 131 + res.term * 7 + 3),
      boxes = ballotBoxes(res, r),
      N = boxes.length;
    const name = playerName(),
      speed = LS.get("ecSeen", false) ? 0.6 : 1;
    const ids = res.cands.map(c => c.id),
      idx: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, i]));
    // sayım başlamadan sıra: önce siz, sonra ilan sırası (sonucu ele vermesin); oy geldikçe kartlar oya göre dizilir
    const start = ["you", ...(res.order || ids.filter(id => id !== "you").sort())].filter(id => id in idx);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0),
      all = sum(boxes.map(b => sum(b.v)));
    const mahTot = MAHALLE.map((_, m) => sum(boxes.filter(b => b.mi === m).map(b => sum(b.v))));
    const cum = ids.map(() => 0),
      disp = ids.map(() => 0),
      mahCum = MAHALLE.map(() => ids.map(() => 0));
    const seen = new Set<string>(),
      T = new Set<number>();
    let opened = 0,
      leader: string | null = null,
      finished = false,
      raf = 0,
      rollT = 0,
      mahNow = 0,
      fxi = Math.floor(r() * 12);
    let kjAt = -1e9,
      kjWant: { phase: string; prio: number; extra: KjExtra } | null = null,
      kjT = 0;
    const later = (f: () => void, ms: number) => {
      const t = window.setTimeout(() => {
        T.delete(t);
        f();
      }, ms);
      T.add(t);
      return t;
    };
    const halt = () => {
      for (const t of T) window.clearTimeout(t);
      T.clear();
      cancelAnimationFrame(raf);
      raf = 0;
      kjT = 0;
      kjWant = null;
    };
    const say = (t: string) => {
      $("#ec-say").textContent = t;
    };

    // stüdyo: spiker SVG'si sahneye takılır; kendi alt bandı kırpılır (yayının kayan yazısı yeter)
    const stage = $("#tv-stage");
    stage.innerHTML = studioSVG();
    const svg = stage.querySelector("svg")!;
    svg.setAttribute("viewBox", "0 0 1600 851");
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const spk = studio(stage); // spiker
    tvStop = () => {
      halt();
      spk.stop();
      tvStop = null;
    };

    const rows: Record<string, { li: HTMLLIElement; pct: HTMLElement; votes: HTMLElement }> = {};
    $("#tv-cands").replaceChildren(
      ...start.map(id => {
        const li = document.createElement("li");
        li.className = "tv-cand" + (id === "you" ? " you" : "");
        li.dataset.id = id;
        li.style.setProperty("--c", EC_RENK[id] || "#aaa");
        li.innerHTML =
          `<div class="tv-pic"><img src="${candPic(id)}" alt="" draggable="false"></div><div class="tv-body"><span class="tv-lbl">${esc(candLabel(id, res.ilk))}</span>` +
          `<span class="tv-nm"><b class="tv-name">${esc(tvName(id, name))}</b></span><b class="tv-pct">%0,00</b><span class="tv-votes">0</span></div>`;
        rows[id] = {
          li,
          pct: li.querySelector<HTMLElement>(".tv-pct")!,
          votes: li.querySelector<HTMLElement>(".tv-votes")!,
        };
        return li;
      }),
    );
    // sıra değişince kartlar yerlerine kayar (FLIP)
    const reorder = (order: string[]) => {
      const list = $("#tv-cands"),
        kids = [...list.children] as HTMLElement[];
      if (order.every((id, i) => kids[i] === rows[id].li)) return;
      const y0 = reduced ? null : new Map(kids.map(el => [el, el.getBoundingClientRect().top]));
      list.append(...order.map(id => rows[id].li));
      if (y0)
        for (const el of kids) {
          const d = y0.get(el)! - el.getBoundingClientRect().top;
          if (Math.abs(d) > 1)
            el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], {
              duration: 480,
              easing: "cubic-bezier(.3,1.25,.5,1)",
            });
        }
    };
    const paint = () => {
      const tot = sum(disp),
        frac = finished ? 100 : Math.min(99.9, (100 * tot) / all);
      $("#tv-open").textContent = "%" + frac.toFixed(1).replace(".", ",");
      $("#tv-prog").style.width = frac + "%";
      const order = tot
        ? [...start].sort((a, b) => disp[idx[b]] - disp[idx[a]] || start.indexOf(a) - start.indexOf(b))
        : start;
      for (const id of start) {
        const p = tot ? (100 * disp[idx[id]]) / tot : 0,
          o = rows[id];
        o.li.style.setProperty("--p", p.toFixed(2));
        o.pct.textContent = "%" + pct2(p);
        o.votes.textContent = oyTR(disp[idx[id]]);
        o.li.classList.toggle("lead", tot > 0 && id === order[0]);
      }
      $("#tv-diff").textContent = tot ? oyTR(Math.round(disp[idx[order[0]]]) - Math.round(disp[idx[order[1]]])) : "0";
      reorder(order);
    };
    // sayılar sandık gelince bir anda değil, yayındaki gibi yuvarlanarak artar
    const roll = (now: number) => {
      const a = rollT ? 1 - Math.exp(-(now - rollT) / 120) : 0.2;
      let moving = false;
      cum.forEach((v, i) => {
        const d = v - disp[i];
        if (Math.abs(d) < 0.5) disp[i] = v;
        else {
          disp[i] += d * a;
          moving = true;
        }
      });
      paint();
      rollT = moving ? now : 0;
      raf = moving ? requestAnimationFrame(roll) : 0;
    };
    const kick = () => {
      if (reduced) {
        cum.forEach((v, i) => {
          disp[i] = v;
        });
        paint();
      } else if (!raf) raf = requestAnimationFrame(roll);
    };

    // mahalle kutuları: sayımda açılmakta olan ve önceki iki mahalle, sonuçta hepsi üçer üçer döner
    const box = (m: number) => {
      const t = mahCum[m],
        s = sum(t),
        ad = MAHALLE[m][0];
      const acik = finished || s >= mahTot[m] - 0.5 ? 100 : (100 * s) / mahTot[m];
      const top = s
        ? ids
            .map((id, i): [string, number] => [id, (100 * t[i]) / s])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
        : [];
      const c = top.length ? EC_RENK[top[0][0]] : "#3d4c6e";
      return (
        `<div class="tv-box" style="--c:${c}"><span class="tv-box-ad">${esc(ad)}</span><span class="tv-box-open">Açılan %${acik.toFixed(1).replace(".", ",")}</span>` +
        (top.length
          ? top
              .map(
                ([id, p]) =>
                  `<p class="tv-box-row${id === "you" ? " you" : ""}" style="--c:${EC_RENK[id] || "#aaa"}"><b>${esc(tvShort(id, name))}</b><span>${pct2(p)}</span></p>`,
              )
              .join("")
          : `<p class="tv-box-row" style="--c:${c}"><b>Sayım bekleniyor</b><span></span></p>`) +
        "</div>"
      );
    };
    const strip = (list: number[]) => {
      $("#tv-strip").innerHTML = list.map(box).join("");
    };
    const near = (m: number) => (m < 2 ? [0, 1, 2] : [m - 2, m - 1, m]);

    // alt bant: her KJ en az HOLD kalır; bekleyen haberlerden önceliklisi, eşitse en yenisi gelir
    const HOLD = 2600 * speed;
    const ctxOf = (extra: KjExtra = {}): TvCtx => {
      const tot = sum(cum);
      return {
        res,
        playerName: name,
        pct: tot ? Object.fromEntries(ids.map((id, i) => [id, (100 * cum[i]) / tot])) : {},
        leader,
        opened: finished ? 1 : tot / all,
        mahalle: MAHALLE[mahNow][0],
        early: !!res.early,
        flags: S?.flags || {},
        seen,
        ...extra,
      };
    };
    const showKJ = (phase: string, extra: KjExtra = {}) => {
      if (phase === "lider" && extra.lead !== leader) phase = "sayim"; // öne geçen yeniden geriye düştüyse haber bayatladı
      const o = kj(phase, ctxOf(extra), r);
      $("#tv-kj-title").textContent = o.title;
      $("#tv-kj-sub").textContent = o.sub;
      kjAt = performance.now();
      spk.say(Math.min(4200, 900 + (o.title.length + o.sub.length) * 30));
    };
    const kjPush = (phase: string, prio: number, extra: KjExtra = {}, now = false) => {
      if (now) {
        window.clearTimeout(kjT);
        kjT = 0;
        kjWant = null;
        showKJ(phase, extra);
        return;
      }
      if (kjWant && kjWant.prio > prio) return;
      kjWant = { phase, prio, extra };
      if (!kjT)
        kjT = later(
          () => {
            kjT = 0;
            const w = kjWant;
            kjWant = null;
            if (w && !finished) showKJ(w.phase, w.extra);
          },
          Math.max(0, kjAt + HOLD - performance.now()),
        );
    };
    const setTicker = () => {
      const tr = $("#tv-ticker");
      tr.innerHTML = [...new Set(ticker(ctxOf(), r))].map(t => `<span>${esc(t)}</span>`).join("");
      tr.style.animation = "none";
      void tr.offsetWidth;
      tr.style.animation = "";
      tr.style.setProperty("--tv-tick-s", Math.max(30, tr.scrollWidth / 95).toFixed(1) + "s"); // ~95 px/sn, ekran genişliğinden bağımsız hız
    };
    const fxShow = () => {
      const f = fx(fxi++, r);
      $("#tv-fx").innerHTML =
        `<b>${esc(f.ad)}</b> ${esc(f.deger)} <i class="${f.yon === "▲" ? "up" : "down"}">${f.yon}</i>`;
      later(fxShow, 4200);
    };
    // şok geçince spiker yarış başa başsa heyecanlı, değilse sakin
    const calm = () => {
      if (finished) return;
      const li = leader ? idx[leader] : -1,
        tot = sum(cum),
        l = li >= 0 ? cum[li] : 0,
        s2 = Math.max(...cum.filter((_, i) => i !== li));
      spk.mood(tot && (l - s2) / tot < 0.02 ? "excited" : "neutral");
    };

    const open = (k: number) => {
      const b = boxes[k],
        before = sum(cum);
      b.v.forEach((v, i) => {
        cum[i] += v;
        mahCum[b.mi][i] += v;
      });
      opened = k + 1;
      mahNow = b.mi;
      const prev = leader;
      leader = ids[cum.indexOf(Math.max(...cum))];
      if (finished) return;
      strip(near(b.mi));
      kick();
      const x = [25, 50, 75].find(p => before / all < p / 100 && sum(cum) / all >= p / 100);
      if (opened > 2 && prev && leader !== prev) {
        kjPush("lider", 2, { prev, lead: leader });
        spk.mood("shocked");
        spk.react("lean");
        spk.setWall(`${tvShort(leader, name)} öne geçti`);
        later(calm, 2600);
        say(`${tvName(leader, name)} öne geçti.`);
      } else if (x) {
        kjPush("sayim", 1);
        spk.react("point");
        spk.setWall(`Sandıkların %${x}${tvNumEk(x)} açıldı`);
        say(`Sandıkların yüzde ${x}${tvNumEk(x)} açıldı, ${tvName(leader, name)} önde.`);
      } else if (k === 0 || boxes[k - 1].mi !== b.mi) {
        kjPush("mahalle", 1, { mahalle: MAHALLE[b.mi][0] });
        spk.react("papers");
        spk.setWall(`${MAHALLE[b.mi][0]} sandıkları`);
      }
      if (ids.includes("tekir") && k === Math.floor(N / 2)) spk.react("cat");
    };
    const finish = () => {
      if (finished) return;
      halt();
      finished = true;
      for (let k = opened; k < N; k++) open(k); // sandık toplamları kesin sonuca eşit, son hâl birebir tutar
      cum.forEach((v, i) => {
        disp[i] = v;
      });
      paint();
      const w = res.cands[0],
        tekirWon = w.id === "tekir";
      rows[w.id].li.classList.add("won");
      $("#tv-live").textContent = "Kesin sonuç";
      $(".tv-kj-tab").textContent = "Seçim sonucu";
      spk.mood(tekirWon ? "smug" : res.win ? "happy" : "sad");
      spk.setWall(tekirWon ? "Tekir başkan!" : `Kazanan: ${tvShort(w.id, name)}`);
      showKJ("sonuc");
      setTicker();
      fxShow();
      // sonuçtan sonra yayın akar: KJ'ler döner, mahalleler üçer üçer geçer, biraz sonra döküm paneli açılır
      let pg = 0;
      const pages = () => {
        strip([0, 1, 2].map(j => (pg + j) % MAHALLE.length));
        pg = (pg + 3) % MAHALLE.length;
        later(pages, 5000);
      };
      pages();
      for (let j = 1; j <= 3; j++) later(() => showKJ("sonuc"), j * 6500);
      later(
        () => {
          $("#tv-info").hidden = false;
        },
        reduced ? 800 : 3800 * speed,
      );
      const n = res.cands.length;
      const line = tekirWon
        ? "Karakavak'ın ilk tüylü başkanı: Tekir! İlk icraatı masadaki bardağı yere itmek oldu."
        : res.win
          ? `${candName("you")} ${pctTR(res.you)} ile yeniden seçildi! ${n} adaylı yarışta fark ${String(res.margin).replace(".", ",")} puan.`
          : `${candName(w.id)} ${pctTR(w.pct)} ile Karakavak'ın yeni belediye başkanı. Siz ${pctTR(res.you)} aldınız.`;
      say(line);
      if (res.win) snd.win();
      else snd.paper();
      renderElectionAfter(res, tv);
      $("#btn-ec-skip").hidden = true;
      const go = $<HTMLButtonElement>("#btn-ec-go");
      go.hidden = false;
      go.focus({ preventScroll: true });
      LS.set("ecSeen", true);
      journalNote(`<b>Seçim</b>${esc(line)}`, res.win ? "ev" : "warn");
    };
    // zamanlama: hızlı başlar, sona doğru yavaşlar; son sandıkta traktör beklemesi. Hareket azaltmada üç adım.
    const steps = reduced ? [Math.round(N * 0.3), Math.round(N * 0.7), N - 1] : null;
    const next = () => {
      if (finished) return;
      if (opened >= N - 1) {
        kjPush("son", 3, {}, true);
        spk.react("lights");
        spk.setWall("Son sandık yolda");
        later(finish, (reduced ? 1200 : 3400) * speed);
        return;
      }
      if (steps) {
        const to = steps.find(x => x > opened) ?? N - 1;
        while (opened < to) open(opened);
        later(next, 1600);
        return;
      }
      open(opened);
      later(next, (520 + 760 * Math.pow(opened / (N - 1), 1.6)) * speed);
    };

    $("#scr-secim").setAttribute("aria-label", res.early ? "Erken seçim gecesi" : "Seçim gecesi");
    $("#tv-date").textContent = `${res.early ? "Erken seçim · " : ""}${dateLabel(res.month)} · ${ids.length} aday`;
    $("#tv-live").textContent = "Canlı";
    $(".tv-kj-tab").textContent = "Son dakika";
    $("#tv-info").hidden = true;
    $("#btn-ec-go").hidden = true;
    $("#btn-ec-skip").hidden = false;
    strip(near(0));
    paint();
    show("secim");
    $("#scr-secim").scrollTop = 0;
    spk.year(calOf(res.month).year);
    spk.mood("excited");
    spk.setWall(res.early ? "Erken seçim gecesi" : "Sandıklar açılıyor");
    showKJ("acilis");
    setTicker();
    fxShow();
    later(next, (reduced ? 600 : 2400) * speed);
    $("#btn-ec-skip").onclick = finish;
    $("#btn-ec-go").onclick = () => {
      $("#btn-ec-go").onclick = null;
      tvStop?.();
      done();
    };
  });
}

// Sonuçtan sonra: seçmen grubu dökümü (kazanandan başlayarak) ve "Neden?" satırları
function renderElectionAfter(res: Tally, { tvName, tvNumEk, whyLines }: typeof import("./secim.ts")) {
  const name = playerName(),
    yi = res.cands.findIndex(c => c.id === "you"),
    sayi = (v: number) => String(v).replace(".", ",");
  $("#tv-blocs").innerHTML =
    res.blocs
      .map(b => {
        const w = Math.round(b.w * 100);
        return (
          `<div class="tv-bloc"><span class="tv-bloc-ad">${esc(b.ad)}<small>seçmenin %${w}${tvNumEk(w)}</small></span><div class="tv-stack">` +
          res.cands
            .map(
              (c, i) =>
                `<i style="--c:${EC_RENK[c.id] || "#aaa"};width:${b.pay[i]}%" title="${esc(tvName(c.id, name))} %${sayi(b.pay[i])}"><b>${Math.round(b.pay[i])}</b></i>`,
            )
            .join("") +
          `</div><em>${pctTR(b.pay[yi])}</em></div>`
        );
      })
      .join("") +
    `<div class="tv-legend">${res.cands.map(c => `<span style="--c:${EC_RENK[c.id] || "#aaa"}">${esc(tvName(c.id, name))}</span>`).join("")}</div>`;
  $("#tv-why").innerHTML = whyLines(res, name)
    .map(t => `<li>${esc(t)}</li>`)
    .join("");
}

// ─── Eski Belediye Başkanlarımız (bu tarayıcıdaki dönemler) ───────────────
const HALL_MAX = 24;
function hallAdd(rec: HallRec) {
  const h = LS.get<HallRec[]>("hall", []).filter(r => r && r.gid !== rec.gid);
  h.push(rec);
  h.sort((a, b) => b.months - a.months || b.at - a.at);
  LS.set("hall", h.slice(0, HALL_MAX));
}
// eski kayıtlarda seçilmiş vesikalık yok, yalnız rastgele bir tohum (face) var
function frameEl(r: HallRec & { face?: number }, rank: number, fresh: boolean) {
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, txt?: string | null) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const f = mk("div", "frame" + (fresh ? " me" : "")),
    gilt = mk("div", "gilt"),
    mat = mk("div", "mat"),
    pic = mk("div", "pic");
  // eski kayıtlarda seçilmiş vesikalık yok, yalnız rastgele bir tohum (face) var
  const face = mk("img");
  face.alt = "";
  face.src = photoSrc(BASKANLAR[r.avatar] ? r.avatar : MAYORS[(Number(r.face) || 1) % MAYORS.length]);
  pic.appendChild(face);
  mat.appendChild(pic);
  gilt.appendChild(mat);
  f.appendChild(gilt);
  const cap = mk("div", "cap");
  cap.appendChild(mk("b", null, r.name || "İsimsiz başkan"));
  cap.appendChild(mk("span", null, `${rank}. sıra · Nisan 2029 – ${dateLabel(r.months)}`));
  cap.appendChild(mk("span", null, `${durLabel(r.months)} · ${ENDINGS[r.key].kisa}`));
  if (r.headline) cap.appendChild(mk("em", null, `“${r.headline}”`));
  f.appendChild(cap);
  return f;
}
// Sonlar defteri: bu tarayıcıda görülen sonlar (eski kayıtlar duvardaki portrelerden tamamlanır)
function sonlarSeen() {
  const hall = LS.get<HallRec[]>("hall", []).map(r => r?.key);
  return [...new Set([...LS.get<string[]>("sonlar", []), ...hall])].filter(k => k && ENDINGS[k]);
}
function sonlarAdd(key: string) {
  const s = sonlarSeen();
  if (!s.includes(key)) LS.set("sonlar", [...s, key]);
}
function renderSonlar() {
  const seen = new Set(sonlarSeen()),
    keys = Object.keys(ENDINGS);
  $("#sonlar-n").textContent = `${seen.size}/${keys.length}`;
  $("#sonlar-list").innerHTML = keys
    .map(k =>
      seen.has(k)
        ? `<li class="${ENDINGS[k].win ? "win" : ""}">${esc(ENDINGS[k].kisa)}</li>`
        : `<li class="yok" aria-label="Henüz görülmedi">? ? ?</li>`,
    )
    .join("");
}
function renderWall() {
  renderSonlar();
  const box = $("#frames"),
    msg = $("#wall-msg");
  const rows = LS.get<HallRec[]>("hall", []).filter(r => r && ENDINGS[r.key] && Number.isFinite(r.months));
  box.textContent = "";
  rows.forEach((r, i) => box.appendChild(frameEl(r, i + 1, !!lastOver && r.gid === lastOver.rec.gid)));
  msg.hidden = false;
  msg.textContent = rows.length
    ? "Bu tarayıcıda görev yapmış başkanlar, en uzun görev süresine göre. Kayıtlar yalnızca bu cihazda durur."
    : "Duvar henüz boş. İlk portre sizinki olsun başkanım.";
}
function openWall() {
  wallFrom = screen === "wall" ? wallFrom : screen;
  show("wall");
  $("#scr-wall").scrollTop = 0;
  renderWall();
}

// ─── Akış ─────────────────────────────────────────────────────────────────
// Başkanın vesikalığı aday kaydında seçilir; ad kutusu boşsa vesikalığın adı kullanılır
function customName() {
  return (LS.get("name", "") || "").trim().slice(0, 24);
}
function playerAvatar() {
  let a = LS.get<string | null>("avatar", null);
  if (!a || !BASKANLAR[a]) {
    a = pickOne(MAYORS);
    LS.set("avatar", a);
  }
  return a;
}
function playerName() {
  return customName() || BASKANLAR[playerAvatar()].ad;
}
function paintAvatar() {
  const a = playerAvatar();
  $<HTMLImageElement>("#avatar-img").src = $<HTMLImageElement>("#hud-img").src = photoSrc(a);
  $<HTMLInputElement>("#in-name").placeholder = BASKANLAR[a].ad;
  $("#leader-name").textContent = playerName();
}
// ─── Aday kaydı: yeni dönemden önce vesikalık ve ad ───────────────────────
function savedGame() {
  const sv = LS.get<State | null>("save", null);
  return sv && sv.v === 2 && !sv.over && sv.cur ? sv : null;
}
function openPick() {
  const box = $("#picks"),
    cur = playerAvatar();
  box.textContent = "";
  MAYORS.forEach((id, i) => {
    const b = document.createElement("button"),
      im = document.createElement("img");
    b.type = "button";
    b.className = "pick";
    b.dataset.id = id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", BASKANLAR[id].ad);
    b.style.setProperty("--r", `${((i * 37) % 7) - 3}deg`);
    im.src = photoSrc(id);
    im.alt = "";
    im.draggable = false;
    b.append(im);
    b.addEventListener("click", () => pickAvatar(id));
    box.appendChild(b);
  });
  $<HTMLInputElement>("#in-name").value = customName();
  adYukle(); // ad havuzu arkadan insin: zar ilk basışta beklemesin
  pickAvatar(cur, false);
  show("pick");
  $("#scr-pick").scrollTop = 0;
  box.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
}
function pickAvatar(id: string, sound = true) {
  LS.set("avatar", id);
  for (const b of [...$("#picks").children] as HTMLElement[]) {
    const on = b.dataset.id === id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  // ad kendiliğinden değişmez: zarın verdiği ad da yazılan ad gibi oyuncunundur, zar yalnız basınca atılır
  const B = BASKANLAR[id];
  const own = customName(),
    note = $("#pick-note"),
    sv = savedGame();
  paintAvatar();
  nameFit();
  $("#ak-lakap").textContent = `“${B.lakap}”`;
  $("#ak-bio").textContent = B.bio;
  note.classList.toggle("warn", !!sv);
  note.textContent = sv
    ? "Kayıtlı bir döneminiz var; mazbatayı alırsanız o dönem kapanır."
    : own
      ? `Mazbataya “${own}” yazılacak; vesikalık ${B.ad}'ın.`
      : "Ad kutusu boş kalırsa vesikalığın adıyla aday olursunuz.";
  if (sound) snd.tick();
}
// Ad zarı: seçili vesikalığın cinsine uygun ad soyad (adlar.ts). Yazılan ad gibi saklanır, vesikalık değişince de kalır.
let zarSon: string[] = []; // son atılan adlar: art arda aynısı, yakın atışlarda aynı ad ya da soyad gelmesin
let AD: typeof import("./adlar.ts") | null = null; // ad havuzu ayrı parçada (adlar.ts), aday kaydı açılınca yüklenir
const adYukle = () => import("./adlar.ts").then(m => (AD = m));
function adZar() {
  if (!AD) {
    adYukle().then(adZar);
    return;
  }
  // kutudaki ad da son atış sayılır: sayfa yenilense de zar aynı adı geri vermez
  const inp = $<HTMLInputElement>("#in-name"),
    b = $("#btn-ad-zar");
  const ad = AD.rastgeleAd(BASKANLAR[playerAvatar()].cins, Math.random, [...zarSon, inp.value.trim()].filter(Boolean));
  zarSon = [...zarSon, ad].slice(-8);
  inp.value = ad;
  LS.set("name", ad);
  nameFit();
  b.classList.remove("roll");
  void b.offsetWidth;
  b.classList.add("roll");
}
// uzun ad kutuya sığsın: yazı boyu harf sayısıyla küçülür (CSS --n)
function nameFit() {
  const i = $<HTMLInputElement>("#in-name");
  i.style.setProperty("--n", String(Math.max(15, (i.value || i.placeholder).length)));
}
// ızgarada ok tuşları seçimi taşır (radyo düğmesi gibi); satır boyu ekrandaki sütun sayısından
function pickMove(e: KeyboardEvent) {
  const list = [...$("#picks").children] as HTMLElement[],
    i = list.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return false;
  const cols = list.filter(b => b.offsetTop === list[0].offsetTop).length || 1;
  const d = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[e.key];
  if (!d) return false;
  e.preventDefault();
  const n = list[Math.max(0, Math.min(list.length - 1, i + d))];
  pickAvatar(n.dataset.id!);
  n.focus();
  return true;
}

// ─── Ana menü: canlı meydan üstünde logo, menü, ilan panosu ve bilgi kartı ──
const SURUM = __SURUM__; // vite.config.js: derleme günü ve kaynağın kısa özeti
const YENILIK: [string, string][] = [
  ["Seçim gecesi canlı yayında", "KARAKAVAK TV sandıkları mahalle mahalle açıyor."],
  ["Ankara'dan davet", "Ankara tavan yapınca sizi yukarı çağırır; hayır diyebilirsiniz."],
  ["Aday kaydı", "Vesikalığınızı seçin, adınızı yazın, mazbatayı alın."],
];
let mnBusy = false,
  panelFrom: HTMLElement | null = null;
// Meydan sahnesi: tek resim (tools/meydan.js'in karesi ChatGPT ile oyuncak diyoramaya çevrildi). Canlı SVG tarayıcıyı yoruyordu.
// Palet yerel saate göre: 21-5 gece, 6-16 gündüz, 17-20 akşamüstü.
// Işıkların, buharın ve yıldızların resimdeki yeri (1536×1024 piksel); üç resimde bina biraz farklı duruyor.
// mk: makam penceresi (giriş geçişi buraya yaklaşır) · l1-l3: sokak lambaları · stm: semaver
type Nokta = [number, number];
const MD_NOKTA: Record<string, Record<string, Nokta>> = {
  aksam: { mk: [765, 328], l1: [347, 290], l2: [1180, 297], l3: [1488, 600], stm: [1043, 480] },
  gece: { mk: [752, 330], l1: [352, 295], l2: [1144, 297], l3: [1480, 565], stm: [1043, 492] },
  gun: { mk: [771, 294], l1: [357, 252], l2: [1165, 268], l3: [1470, 565], stm: [1050, 468] },
};
// resimde boyanmış yıldızlar: gece üstlerinde küçük parıltılar
const MD_YILDIZ: Record<string, Nokta[]> = {
  gece: [
    [460, 72],
    [935, 83],
    [1162, 131],
    [1437, 91],
    [668, 160],
    [1300, 40],
  ],
};
const mdYuzde = ([x, y]: Nokta) => [`${(x / 15.36).toFixed(2)}%`, `${(y / 10.24).toFixed(2)}%`];
// ?saat=23 gibi bir adres paleti önizletir
const mdPal = (h = +(new URLSearchParams(location.search).get("saat") ?? new Date().getHours())) =>
  h >= 21 || h < 6 ? "gece" : h < 17 ? "gun" : "aksam";
function sceneOn(on: boolean) {
  if (!on) return;
  const sc = $("#mn-scene"),
    p = mdPal();
  sc.classList.remove("in", "px"); // yumuşatma fare kıpırdayınca geri gelir
  if (sc.dataset.pal === p) return;
  sc.dataset.pal = p;
  $<HTMLImageElement>("#mn-img").src = `meydan/meydan-${p}.webp`;
  const N = MD_NOKTA[p],
    pic = $("#mn-pic");
  for (const el of pic.querySelectorAll<HTMLElement>("[data-k]")) {
    const [x, y] = mdYuzde(N[el.dataset.k!]);
    el.style.setProperty("--x", x);
    el.style.setProperty("--y", y);
  }
  const [wx, wy] = mdYuzde(N.mk);
  pic.style.setProperty("--wx", wx);
  pic.style.setProperty("--wy", wy);
  $("#mf-stars").innerHTML = (MD_YILDIZ[p] || [])
    .map(
      ([x, y], i) =>
        `<i style="--x:${(x / 15.36).toFixed(2)}%;--y:${(y / 10.24).toFixed(2)}%;--d:${(-i * 0.7).toFixed(1)}s"></i>`,
    )
    .join("");
}
async function sceneEnter() {
  $("#mn-scene").classList.add("in");
  await wait(reduced ? 200 : 900);
}
const mnItems = () => [...document.querySelectorAll<HTMLElement>("#mn-list .mn-item")].filter(b => !b.hidden);
function mnOn(b: HTMLElement | undefined, sound = true) {
  if (!b || b.classList.contains("on")) return;
  for (const x of mnItems()) x.classList.toggle("on", x === b);
  renderInfo(b.dataset.info ?? "");
  if (sound) snd.tick();
}
function renderInfo(kind: string) {
  const H = (h: string, body: string) => `<h3>${esc(h)}</h3>${body}`,
    sv = savedGame();
  let html = "";
  if (kind === "devam" && sv) {
    const left = TERM - 1 - (sv.month % TERM),
      poll = Math.round(pollOf(sv));
    const risk = (k: Meter, v: number) => v <= 15 || (k !== "h" && v >= 85);
    const cells =
      METERS.map(
        k =>
          `<div class="${risk(k, sv.m[k]) ? "risk" : ""}">${METER_AD[k]}<b>${sv.m[k]}</b><i style="--v:${sv.m[k]}%"></i></div>`,
      ).join("") + `<div>Anket<b>%${poll}</b><i style="--v:${poll}%;--c:var(--good)"></i></div>`;
    html = H(
      "Kaldığınız yer",
      `<div class="mi-save"><img src="${photoSrc(playerAvatar())}" alt=""><b>${esc(playerName())}</b>
      <span>${esc(dateLabel(sv.month))} · ${sv.term}. dönem${sv.term >= MAX_TERMS ? " · son dönem" : ` · seçime ${left} ay`}</span><div class="mi-meters">${cells}</div></div>`,
    );
  } else if (kind === "yeni") {
    html = H(
      "Yeni dönem",
      `<p>Koltuk boş başkanım. Vesikalığınızı seçin, adınızı yazın, mazbatayı alın.</p>${sv ? `<p class="warn">Kayıtlı döneminiz kapanır.</p>` : ""}`,
    );
  } else if (kind === "duvar") {
    const rows = LS.get<HallRec[]>("hall", [])
      .filter(r => r && ENDINGS[r.key] && Number.isFinite(r.months))
      .slice(0, 3);
    html = H(
      "Eski başkanlarımız",
      rows.length
        ? `<ul class="mi-wall">${rows.map(r => `<li><img src="${photoSrc(BASKANLAR[r.avatar] ? r.avatar : MAYORS[0])}" alt=""><div><b>${esc(r.name || "Başkan")}</b><span>${esc(durLabel(r.months))} · ${esc(ENDINGS[r.key].kisa)}</span></div></li>`).join("")}</ul>`
        : "<p>Duvar henüz boş. İlk portre sizinki olsun.</p>",
    );
  } else if (kind === "nasil") {
    html = H(
      "Nasıl oynanır",
      "<p>Evrak gelir; sağa ya da sola kaydırırsınız. Halk, kasa, esnaf ve Ankara dengede dursun. Beş yılda bir sandık kurulur.</p>",
    );
  } else if (kind === "ayar") {
    html = H("Ayarlar", "<p>Ses, titreşim, seçim gecesinin hızı ve kayıtlar.</p>");
  } else if (kind === "kunye") {
    html = H("Künye", "<p>Emeği geçenler, yazı karakterleri, lisanslar. Bir de kurgu uyarısı.</p>");
  }
  $("#mn-info").innerHTML = html;
}
// keep: alt ekrandan (genelge, duvar, aday kaydı) dönülünce o madde seçili kalır; oyundan dönülünce ilk madde
function refreshMenu(keep = false) {
  const best = LS.get<HallRec | null>("best", null),
    sv = savedGame();
  $("#best").textContent =
    best && ENDINGS[best.key] ? `Rekor: ${durLabel(best.months)} · ${ENDINGS[best.key].kisa}` : "";
  $("#btn-resume").hidden = !sv;
  $("#mn-resume-sub").textContent = sv ? `${dateLabel(sv.month)} · ${sv.term}. dönem · ${playerName()}` : "";
  $("#mn-ver").textContent = `Sürüm ${SURUM}`;
  $("#kn-ver").textContent = SURUM;
  $("#mn-board").innerHTML =
    `<h3>İlan panosu</h3><p class="bd-sub">Belediyeden duyurular</p><ul>${YENILIK.map(([h, t]) => `<li><b>${esc(h)}</b>${esc(t)}</li>`).join("")}</ul>`;
  const cur = keep ? document.querySelector<HTMLElement>("#mn-list .mn-item.on") : null,
    first = cur && !cur.hidden ? cur : mnItems()[0];
  for (const x of mnItems()) x.classList.remove("on");
  mnOn(first, false);
  return first;
}
function openPanel(id: string) {
  panelFrom = document.activeElement as HTMLElement | null;
  $(".mn").classList.add("panel-open");
  for (const q of ["#mn-list", "#mn-info", "#mn-board"]) $(q).inert = true;
  const p = $("#mn-" + id);
  p.hidden = false;
  if (id === "ayar") paintAyar();
  p.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
}
function closePanel() {
  const p = document.querySelector<HTMLElement>(".mn-panel:not([hidden])");
  if (!p) return false;
  p.hidden = true;
  $(".mn").classList.remove("panel-open");
  for (const q of ["#mn-list", "#mn-info", "#mn-board"]) $(q).inert = false;
  panelFrom?.focus({ preventScroll: true });
  return true;
}
function paintAyar() {
  $<HTMLInputElement>("#ay-ses").checked = snd.on;
  $<HTMLInputElement>("#ay-vol").value = String(snd.vol);
  $("#ay-vol-o").textContent = String(snd.vol);
  $<HTMLInputElement>("#ay-tit").checked = LS.get("vibrate", true);
  $<HTMLInputElement>("#ay-hizli").checked = LS.get("ecSeen", false);
  $("#ay-intro").textContent = LS.get("introSeen", false) ? "Yeniden göster" : "Gösterilecek";
  const sil = $("#ay-sil");
  sil.classList.remove("armed");
  sil.textContent = "Hepsini sil";
}
function show(name: string) {
  screen = name;
  for (const s of ["title", "game", "over", "wall", "help", "pick", "kampanya", "secim"])
    $("#scr-" + s).hidden = s !== name;
  sceneOn(name === "title");
}
function showTitle() {
  closeNote();
  closePanel();
  paintAvatar();
  const first = refreshMenu(["help", "wall", "pick"].includes(screen));
  show("title");
  first?.focus({ preventScroll: true });
}
// menüden oyuna: meydan sahnesi makam penceresine yaklaşır, sonra masa açılır
async function menuEnter(go: () => void) {
  if (mnBusy) return;
  mnBusy = true;
  if (screen === "title") await sceneEnter();
  mnBusy = false;
  go();
}
function enterGame() {
  show("game");
  $("#toasts").textContent = "";
  paintAvatar();
  setMeters();
  renderOngoing();
  st().journal ||= [];
  logUnread = 0;
  openLog(false);
  renderLog(false);
}
// Yeni dönem: aday kaydından sonra seçim beyannamesi. Sessiz kampanya doğrudan (düşük) başlatır;
// sandığa giden seçim gecesini izler, sonra rahat zafer (yüksek) ya da kıl payı (daha düşük) başlar.
function startNew(acilis: Acilis = "sessiz", vaatler: string[] = [], secim?: Tally) {
  snd.unlock();
  const intro = !LS.get("introSeen", false);
  LS.set("introSeen", true);
  S = newGame({ intro, acilis, vaatler, secim });
  beyanname = [];
  secili = [];
  enterGame();
  nextCard();
}
let beyanname: string[] = [], // bu kampanyada önerilen altı söz (geri dönüp gelince aynı kalsın)
  secili: string[] = [];
function openKampanya() {
  if (!beyanname.length)
    beyanname = shuffle(
      VAATLER.map(v => v.id),
      Math.random,
    ).slice(0, 6);
  const a = playerAvatar(),
    list = $("#bn-list");
  $<HTMLImageElement>("#bn-img").src = photoSrc(a);
  $("#bn-ad").textContent = playerName();
  $("#bn-lakap").textContent = "Belediye başkan adayı";
  list.textContent = "";
  for (const id of beyanname) {
    const v = VAAT[id],
      li = document.createElement("li"),
      b = document.createElement("button");
    b.type = "button";
    b.className = "bn-v";
    b.dataset.id = id;
    b.setAttribute("role", "checkbox");
    b.innerHTML = `<span class="bn-kutu" aria-hidden="true"></span><b>${esc(v.ad)}</b><span class="bn-guc">+${v.guc} puan</span><span class="bn-soz">${esc(v.soz)}</span>`;
    b.addEventListener("click", () => toggleVaat(id));
    li.append(b);
    list.append(li);
  }
  paintKampanya();
  show("kampanya");
  $("#scr-kampanya").scrollTop = 0;
  list.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
}
function toggleVaat(id: string) {
  const on = secili.includes(id);
  if (!on && secili.length >= VAAT_MAX) return; // en çok üç söz: kalanlar soluk durur
  secili = on ? secili.filter(x => x !== id) : [...secili, id];
  snd.tick();
  paintKampanya();
}
function paintKampanya() {
  const dolu = secili.length >= VAAT_MAX,
    sans = kampanyaSans(secili);
  for (const b of $("#bn-list").querySelectorAll<HTMLElement>(".bn-v")) {
    const on = secili.includes(b.dataset.id!);
    b.setAttribute("aria-checked", String(on));
    b.setAttribute("aria-disabled", String(!on && dolu));
  }
  $("#bn-sans").textContent = `%${sans}`;
  $("#bn-bar").style.setProperty("--w", sans + "%");
  $("#bn-not").textContent = secili.length
    ? `${secili.length === 1 ? "Bir söz" : secili.length === 2 ? "İki söz" : "Üç söz"}: rahat kazanma şansı %${sans}. Gerisi kıl payı.${dolu ? " Daha fazla söz verilmez, bu kadarının hesabı bile uzun." : ""}`
    : `Söz vermeden sandığa giderseniz rahat kazanma şansı %${sans}. Gerisi kıl payı.`;
}
async function sandigaGit() {
  const vz = secili.slice(),
    { acilis, res } = acilisSecimi(vz);
  snd.unlock();
  const intro = !LS.get("introSeen", false);
  LS.set("introSeen", true);
  S = newGame({ intro, acilis, vaatler: vz, secim: res });
  beyanname = [];
  secili = [];
  await electionNight(res);
  enterGame();
  nextCard();
}
function resume() {
  snd.unlock();
  const s = LS.get<State | null>("save", null);
  if (!s || s.v !== 2 || s.over || !s.cur) return startNew();
  S = s;
  enterGame();
  updateHud();
  // seçim evrakı imzalanmış ama sonuç ekranı kapanmadan çıkılmışsa: seçim gecesi yeniden gösterilir
  if (s.pending?.type === "sonuc" && s.pending.res && s.cur.kind === "secim") {
    electionNight(s.pending.res).then(() => {
      show("game");
      nextCard();
    });
    return;
  }
  renderCard(s.cur);
}

function wire() {
  buildMeters();
  $("#btn-start").addEventListener("click", openPick);
  $("#btn-resume").addEventListener("click", () => menuEnter(resume));
  $("#btn-wall").addEventListener("click", openWall);
  $("#btn-ayar").addEventListener("click", () => openPanel("ayar"));
  $("#btn-kunye").addEventListener("click", () => openPanel("kunye"));
  for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", closePanel);
  for (const b of document.querySelectorAll<HTMLElement>("#mn-list .mn-item")) {
    b.addEventListener("pointerenter", e => {
      if (e.pointerType === "mouse" && !mnBusy) {
        b.focus({ preventScroll: true });
        mnOn(b);
      }
    });
    b.addEventListener("focus", () => mnOn(b));
  }
  // fareyle hafif parallaks: yalnız resmin kutusu kayar (tek katman, yeniden boyama yok)
  const fine = matchMedia("(pointer: fine)");
  let pxT = 0;
  addEventListener("pointermove", e => {
    if (screen !== "title" || reduced || !fine.matches || pxT) return;
    pxT = requestAnimationFrame(() => {
      pxT = 0;
      const sc = $("#mn-scene");
      sc.classList.add("px");
      sc.style.setProperty("--px", (e.clientX / innerWidth - 0.5).toFixed(3));
      sc.style.setProperty("--py", (e.clientY / innerHeight - 0.5).toFixed(3));
    });
  });
  // ilk dokunuşta ses açılsın ki menü tıkları duyulsun
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => snd.unlock(), { once: true, capture: true });
  $("#btn-go").addEventListener("click", () => openKampanya());
  $("#btn-bn-back").addEventListener("click", () => show("pick"));
  $("#btn-sessiz").addEventListener("click", () => startNew("sessiz"));
  $("#btn-sandik").addEventListener("click", () => void sandigaGit());
  // Rastgele aday: başka bir hazır aday, adıyla birlikte (broşürdeki lakap ve biyografi o ada ait); ad zarı ayrı düğme
  $("#btn-zar").addEventListener("click", () => {
    const cur = playerAvatar(),
      rest = MAYORS.filter(id => id !== cur);
    const id = pickOne(rest);
    LS.set("name", "");
    $<HTMLInputElement>("#in-name").value = "";
    pickAvatar(id);
    $(`#picks [data-id="${id}"]`).focus({ preventScroll: true });
  });
  $("#btn-ad-zar").addEventListener("click", () => {
    adZar();
    pickAvatar(playerAvatar(), false);
    snd.tick();
  });
  $("#btn-ad-zar").addEventListener("animationend", e => (e.currentTarget as HTMLElement).classList.remove("roll"));
  $("#in-name").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      openKampanya();
    }
  });
  $("#ay-ses").addEventListener("change", e => {
    if ((e.target as HTMLInputElement).checked !== snd.on) snd.toggle();
    paintMute();
  });
  $("#ay-vol").addEventListener("input", e => {
    snd.volume(+(e.target as HTMLInputElement).value);
    $("#ay-vol-o").textContent = String(snd.vol);
  });
  $("#ay-vol").addEventListener("change", () => snd.tick());
  $("#ay-tit").addEventListener("change", e => LS.set("vibrate", (e.target as HTMLInputElement).checked));
  $("#ay-hizli").addEventListener("change", e => LS.set("ecSeen", (e.target as HTMLInputElement).checked));
  $("#ay-intro").addEventListener("click", () => {
    LS.set("introSeen", false);
    paintAyar();
  });
  let silT = 0;
  $("#ay-sil").addEventListener("click", e => {
    // iki adımlı: önce "Emin misiniz?", 3,5 sn içinde ikinci basış siler
    const b = e.currentTarget as HTMLElement;
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      b.textContent = "Emin misiniz?";
      window.clearTimeout(silT);
      silT = window.setTimeout(paintAyar, 3500);
      return;
    }
    window.clearTimeout(silT);
    for (const k of ["save", "best", "hall"]) LS.del(k);
    b.classList.remove("armed");
    b.textContent = "Silindi";
    refreshMenu(true);
  });
  $("#btn-help").addEventListener("click", () => {
    show("help");
    $("#scr-help").scrollTop = 0;
  });
  $("#btn-help-back").addEventListener("click", showTitle);
  $("#btn-wall2").addEventListener("click", openWall);
  $("#btn-back").addEventListener("click", () => (wallFrom === "over" && lastOver ? show("over") : showTitle()));
  $("#btn-again").addEventListener("click", () => openKampanya()); // aynı adayla yeni kampanya
  $("#btn-menu").addEventListener("click", showTitle);
  $("#btn-danis").addEventListener("click", danis);
  $("#btn-log").addEventListener("click", () => openLog(!$("#log").classList.contains("open")));
  $("#btn-log-x").addEventListener("click", () => openLog(false));
  $("#log-scrim").addEventListener("click", () => openLog(false));
  wideLog.addEventListener("change", () => {
    openLog(false);
    logUnread = 0;
    if (S) renderLog(false);
  });
  $("#in-name").addEventListener("input", e => {
    LS.set("name", (e.target as HTMLInputElement).value.slice(0, 24));
    pickAvatar(playerAvatar(), false);
  });
  $("#btn-pick-back").addEventListener("click", showTitle);
  const mute = $("#btn-mute"),
    mute2 = $("#btn-mute2");
  function paintMute() {
    for (const b of [mute, mute2]) {
      b.setAttribute("aria-pressed", String(!snd.on));
      b.setAttribute("aria-label", snd.on ? "Sesi kapat" : "Sesi aç");
    }
    $<SVGElement>("#mute-wave").style.opacity = snd.on ? "1" : ".15";
  }
  for (const b of [mute, mute2])
    b.addEventListener("click", () => {
      snd.toggle();
      paintMute();
    });
  paintMute();
  for (const side of ["L", "R"] as const) {
    const b = $("#ch-" + side),
      dir = side === "L" ? -1 : 1;
    const peek = () => {
      const el = document.querySelector<HTMLElement>("#card");
      if (busy || !el || screen !== "game") return;
      el.classList.remove("enter");
      el.style.transition = "transform .2s ease-out";
      tilt(el, dir * 22);
      el.querySelector<HTMLElement>(".stamp." + side)!.style.opacity = ".35";
    };
    const unpeek = () => {
      if (!busy) untilt(document.querySelector<HTMLElement>("#card"));
    };
    b.addEventListener("click", () => commit(side));
    b.addEventListener("pointerenter", e => {
      if (e.pointerType === "mouse") peek();
    });
    b.addEventListener("pointerleave", e => {
      if (e.pointerType === "mouse") unpeek();
    });
    b.addEventListener("focus", () => {
      if (b.matches(":focus-visible")) peek();
    });
    b.addEventListener("blur", unpeek);
  }
  addEventListener("keydown", e => {
    // Escape ayar paneli ve aday kaydında odak bir kutudayken de çalışır
    if (e.key === "Escape" && screen === "title" && closePanel()) return;
    if (e.key === "Escape" && screen === "pick") return $("#btn-pick-back").click();
    if (e.key === "Escape" && screen === "kampanya") return $("#btn-bn-back").click();
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target as Element | null)?.matches?.("input, textarea")) return;
    if (screen === "wall" && e.key === "Escape") return $("#btn-back").click();
    if (screen === "help" && e.key === "Escape") return showTitle();
    if (screen === "pick") {
      pickMove(e);
      return;
    }
    if (screen === "title") {
      if ($(".mn").classList.contains("panel-open") || mnBusy) return;
      const list = mnItems(),
        d = ({ ArrowDown: 1, ArrowUp: -1, s: 1, w: -1 } as Record<string, number>)[e.key];
      if (!d || !list.length) return;
      e.preventDefault();
      const i = Math.max(
        list.indexOf(document.activeElement as HTMLElement),
        list.findIndex(x => x.classList.contains("on")),
      );
      const n = list[(i + d + list.length) % list.length];
      n.focus({ preventScroll: true });
      mnOn(n);
      return;
    }
    if (screen === "secim" && ["Enter", " ", "Escape"].includes(e.key)) {
      e.preventDefault();
      return ($("#btn-ec-go").hidden ? $("#btn-ec-skip") : $("#btn-ec-go")).click();
    }
    if (screen !== "game") return;
    const k = e.key.toLocaleLowerCase("tr");
    // çekmece açıkken masa kilitli: yalnız kapatma tuşları
    if ($("#log").classList.contains("open")) {
      if (e.key === "Escape" || k === "g") openLog(false);
      return;
    }
    if (k === "g" && !wideLog.matches) return openLog(true);
    if (e.key === "ArrowLeft" || k === "a") {
      e.preventDefault();
      commit("L");
    } else if (e.key === "ArrowRight" || k === "d") {
      e.preventDefault();
      commit("R");
    } else if (k === "f") danis();
    else if (e.key === "Escape") closeNote();
  });
}

wire();
showTitle();
// Evrak açılırken vesikalık beklemesin
window.setTimeout(() => {
  for (const id of Object.keys(PEOPLE)) new Image().src = photoSrc(id);
}, 1500);
// Web sürümünde çevrimdışı çalışmak için (dosyadan açılınca kayıt denenmez)
if (STANDALONE && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
