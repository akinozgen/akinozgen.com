// ─── Oyun motoru (DOM'suz; sim.mjs de bunu çalıştırır) ────────────────────
import {
  ADAYLAR,
  BLOKLAR,
  CARDS,
  CAY_LINES,
  CRISES,
  DAVET,
  ENDINGS,
  INTRO,
  KAMPANYA,
  MIRAS,
  ODA,
  PEOPLE,
  SYN,
  VAATLER,
} from "./cards.ts";
import type {
  Acilis,
  CardDef,
  CardKind,
  ChooseOut,
  Cond,
  Cur,
  Effect,
  Field,
  Kalem,
  Meter,
  Next,
  Pending,
  PolDef,
  QueueItem,
  Range,
  Rng,
  Side,
  State,
  Tally,
  TickEvent,
  VaatDef,
} from "./types.ts";

export const METERS: Meter[] = ["h", "k", "e", "a"];
export const METER_AD: Record<Meter, string> = { h: "Halk", k: "Kasa", e: "Esnaf", a: "Ankara" };
export const AYLAR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
export const TERM = 60; // ay
export const MAX_TERMS = 4;
export const Z: Effect = [0, 0, 0, 0];
export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map(c => [c.id, c]));

// İlişkiler: −3 küs … +3 dost
export const REL_AD: Record<string, string> = {
  "-3": "Küs",
  "-2": "Dargın",
  "-1": "Soğuk",
  "0": "Nötr",
  "1": "Ilık",
  "2": "Sıcak",
  "3": "Dost",
};
export const NOREL = new Set(["fikret", "tekir", "ingrid", "mahir"]);
// Sandıkta sözü geçenler (ilişki başına oy puanı)
export const INFLUENCE: Record<string, number> = {
  muhtar: 0.8,
  hayri: 0.8,
  bekir: 0.7,
  hatice: 0.7,
  tuncay: 0.6,
  nermin: 0.6,
};
// Ayar düğmeleri (sim.mjs ile ölçüldü)
// salience: koşulu tutan her şart kartın ağırlığını bu oranda artırır (özgül kart genel kartı yener)
// vaat: tutulmamış her vaat anketten bu kadar puan götürür (en çok vaatMax)
// defterMin/Max: sandık defterinin (skandallar eksi, akılda kalan işler artı) ankete net etkisinin sınırları
// yanAra: ilçede iki yan etki arasında en az bu kadar ay
// 2026-09: 61 yeni kartla birlikte hafif sıkılaştırıldı (rescue 1.4→1.3, fatigue 7→6.5, base 19→17.5, scale 1.15→1.2)
export const TUNE = {
  damp: 0.9,
  edge: 12,
  crisisP: 0.3,
  crisisCd: 18,
  crisisAt: 18,
  rescue: 1.3,
  fatigue: 6.5,
  base: 17.5,
  scale: 1.2,
  salience: 0.5,
  vaat: 2,
  vaatMax: 8,
  defterMin: -8,
  defterMax: 6,
  yanAra: 3,
};
export const MAX_ONGOING = 7;

// ─── Göreve başlayış: seçim beyannamesi, kampanya turu ve açılış seçimi ───────
// Sessiz kampanya seçimsiz, düşük başlar: bir mühür ve temiz sicil (defterde +3, ilk skandalda silinir).
// Sandığa giden dört kampanya evrakı oynar (KAMPANYA); anket, yani kazanma şansı, vaatlerle ve bu evraklarla oynar.
// Sandık üç sonuçtan birini verir: ezici zafer (en yüksek, beş mühür), rahat zafer (üç mühür) ya da kıl payı
// (en düşük, gölgeli mazbata, iki itiraz dilekçesi; ikisi de kapanınca gölge biter, iki mühür gelir).
export const VAAT: Record<string, VaatDef> = Object.fromEntries(VAATLER.map(v => [v.id, v]));
export const VAAT_MAX = 3;
// hesap evrakı sözü kapatır: tutulsa da tutulmasa da açık söz sayacı düşer, sonucu defter adıyla taşır
const VAAT_KART = new Set(VAATLER.map(v => v.kart));
// taban + vaatlerin gücü (en çok tavan); kampanya evrakları anketi alt ile üst arasında oynatır
export const SANS = { taban: 42, tavan: 80, alt: 10, ust: 92 };
// fark = 3 + (anket − zar) × egim (en çok 30); ezici eşiği aşan zafer ezicidir. Zar anketin üstüne düşerse kıl payı.
export const SANDIK = { egim: 0.4, ezici: 15, tavan: 30 };
// Mühür: basılı evrağın en ağır kaybını siler (en çok tavan); yalnız sıradan evrakta, 18 ayda söner
export const MUHUR = { ay: 18, tavan: 10 };
export const TEMIZ = "Temiz sicil";
export const muhurPol = (ay: number = MUHUR.ay): PolDef => ({
  id: "muhur",
  ad: "Mühür hakkı",
  ozet: "evrağın en ağır kaybını siler",
  ay,
  msg: "Kullanılmayan mühürler söndü; mazbatanın tazeliği geçti.",
});
export const KAMPANYA_KART: Record<string, CardDef> = Object.fromEntries(KAMPANYA.map(c => [c.id, c]));
// kalem: sandık hafızasına giden kalem (zafer ilk seçimde de hatırlanır; yüksek başlangıç beş yılda söner)
// pol: gölgeli mazbata bir yıl halkın kızgınlığını fazla sayar (HAVA); next: kıl payında itiraz dilekçesi
export const ACILIS: Record<
  Acilis,
  {
    m: State["m"];
    danis?: number;
    muhur?: number;
    rel?: Record<string, number>;
    kalem?: { ad: string; puan: number };
    pol?: PolDef;
    next?: Next;
  }
> = {
  sessiz: { m: { h: 44, k: 48, e: 48, a: 46 }, muhur: 1, kalem: { ad: TEMIZ, puan: 3 } },
  ezici: {
    m: { h: 66, k: 62, e: 52, a: 56 }, // kasa: Ankara'nın zafer ödeneği; esnaf 50 yakınında (iki ucu da tehlike)
    danis: 4,
    muhur: 5,
    kalem: { ad: "Sandıktan ezici çıkış", puan: 5 },
  },
  zafer: {
    m: { h: 60, k: 58, e: 52, a: 54 },
    danis: 4,
    muhur: 3,
    kalem: { ad: "Sandıktan güçlü çıkış", puan: 3 },
  },
  kilpayi: {
    m: { h: 38, k: 46, e: 46, a: 44 },
    rel: { nermin: -1 },
    pol: {
      id: "golge",
      ad: "Gölgeli mazbata",
      ozet: "halkın kızgınlığı fazla",
      ay: 12,
      tags: ["golge"],
      msg: "Mazbatanın gölgesi kalktı; itirazları kimse hatırlamıyor.",
    },
    next: { id: "itiraz_1", in: [1, 3] },
  },
};
// Havalar: yürürlükteki bir etiket, evrakta o göstergeyi eksiye düşüren etkiyi bu oranla çarpar (oklar da buna göre).
// Gölgeli mazbatada halkın kızgınlığı fazla; armağanlar ve dertler de buradan işler.
export const HAVA: Record<string, Effect> = {
  golge: [1.3, 1, 1, 1],
};
export const havaOf = (s: State) => {
  const tg = tagsOn(s),
    k = [1, 1, 1, 1];
  for (const [t, c] of Object.entries(HAVA)) if (tg.has(t)) c.forEach((v, i) => (k[i] *= v));
  return k;
};
export const kampanyaSans = (vaatler: string[]) =>
  clamp(SANS.taban + vaatler.slice(0, VAAT_MAX).reduce((a, id) => a + (VAAT[id]?.guc || 0), 0), SANS.taban, SANS.tavan);
// kampanya turu: her aşamadan bir evrak
export const kampanyaSira = (rng: Rng) =>
  [0, 1, 2, 3].map(a => {
    const h = KAMPANYA.filter(c => c.asama === a);
    return h[Math.floor(rng() * h.length)].id;
  });

export const calOf = (m: number) => ({ mon: (3 + m) % 12, year: 2029 + Math.floor((3 + m) / 12) });
export const dateLabel = (m: number) => {
  const c = calOf(m);
  return AYLAR[c.mon] + " " + c.year;
};
export const durLabel = (n: number) => {
  const y = Math.floor(n / 12),
    m = n % 12;
  return [y ? y + " yıl" : "", m ? m + " ay" : ""].filter(Boolean).join(" ") || "bir aydan kısa";
};
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// Uca uzaklık: halk için yalnız aşağısı tehlike (halkın sevgisi fazla gelmez)
export const edgeRisk = (k: Meter, v: number) => (k === "h" ? Math.max(0, 50 - v) : Math.abs(v - 50));
export const relBonus = (s: State) =>
  clamp(
    Object.entries(INFLUENCE).reduce((a, [w, k]) => a + (s.rel[w] || 0) * k, 0),
    -8,
    8,
  );
// Tutulmamış vaatler (s.cnt.vaat) sandıkta ödenir
export const vaatCost = (s: State) => Math.min(TUNE.vaatMax, (s.cnt?.vaat || 0) * TUNE.vaat);
// Sandık defteri (s.defter): skandallar ve akılda kalan işler adlarıyla birikir, yeni dönemde yarıya iner
export const defterOf = (s: State) =>
  clamp(
    (s.defter || []).reduce((a, k) => a + k.puan, 0),
    TUNE.defterMin,
    TUNE.defterMax,
  );
// en ağır kalemler (seçim gecesi "Neden?" satırı, gazete)
export const kalemler = (s: State, n = 2) =>
  (s.defter || [])
    .slice()
    .sort((a, b) => Math.abs(b.puan) - Math.abs(a.puan))
    .slice(0, n)
    .map(({ ad, puan }) => ({ ad, puan }));
// Yıpranma: her yeni dönemde sandık biraz daha zorlaşır
export const pollOf = (s: State) =>
  TUNE.base +
  s.m.h * 0.45 +
  s.m.e * 0.08 +
  s.m.a * 0.04 +
  relBonus(s) -
  (s.term - 1) * TUNE.fatigue -
  vaatCost(s) +
  defterOf(s);

// ── Ortak koşul dili: kart kapıları, next.if ve alt.if hepsi bunu kullanır
// { req: bayrak(lar), not: bayrak(lar), cnt: {sayaç: en az | [en az, en çok]}, pol: karar id(leri), nopol,
//   tag: etiket(ler) (yürürlükteki kararlardan), notag, rel: {kişi: en az | [en az, en çok]} }
export const arr = <T>(x: T | T[] | null | undefined): T[] => ([] as T[]).concat(x ?? []);
export const inRange = (v: number, r: Range) =>
  Array.isArray(r) ? v >= (r[0] ?? -Infinity) && v <= (r[1] ?? Infinity) : v >= r;
export const tagsOn = (s: State) => new Set(s.ongoing.flatMap(o => o.tags || []));
export function condOK(s: State, q: Cond | null | undefined) {
  if (!q) return true;
  if (q.req && !arr(q.req).every(f => s.flags[f])) return false;
  if (q.not && arr(q.not).some(f => s.flags[f])) return false;
  if (q.cnt && !Object.entries(q.cnt).every(([k, r]) => inRange(s.cnt[k] || 0, r))) return false;
  if (q.pol && !arr(q.pol).every(id => s.ongoing.some(o => o.id === id))) return false;
  if (q.nopol && arr(q.nopol).some(id => s.ongoing.some(o => o.id === id))) return false;
  if (q.tag || q.notag) {
    const t = tagsOn(s);
    if (q.tag && !arr(q.tag).every(x => t.has(x))) return false;
    if (q.notag && arr(q.notag).some(x => t.has(x))) return false;
  }
  if (q.rel && !Object.entries(q.rel).every(([w, r]) => inRange(s.rel[w] || 0, r))) return false;
  return true;
}
// Kartın kendi kapıları ortak dile çevrilir
export const gateOf = (c: CardDef): Cond => ({
  req: c.req,
  not: c.not,
  cnt: c.reqCnt,
  pol: c.reqPol,
  nopol: c.notPol,
  tag: c.reqTag,
  notag: c.notTag,
});
// Kaç özel şartla açıldığı: özgül kartlar torbada daha ağır basar
export const specificity = (c: CardDef) =>
  arr(c.req).length +
  Object.keys(c.reqCnt || {}).length +
  arr(c.reqPol).length +
  arr(c.reqTag).length +
  Object.keys(c.relMin || {}).length;

export function newGame(
  opts: { intro?: boolean; acilis?: Acilis; kampanya?: boolean; vaatler?: string[]; secim?: Tally; rng?: Rng } = {},
): State {
  const s: State = {
    v: 2,
    gid: Math.random().toString(36).slice(2, 10),
    m: { h: 50, k: 50, e: 50, a: 50 },
    month: 0,
    term: 1,
    electionTerm: 0,
    flags: {},
    cnt: {},
    last: {},
    used: {},
    queue: [],
    log: [],
    rel: {},
    ongoing: [],
    bitti: [],
    cay: 0,
    signed: 0,
    tekirUsed: false,
    danis: 3,
    danisTerm: 1,
    intro: opts.intro ? INTRO.length : 0,
    lastWho: null,
    pending: null,
    cur: null,
    over: null,
  };
  const vz = (opts.vaatler || []).filter(id => VAAT[id]).slice(0, VAAT_MAX);
  // sandığa giden: önce kampanya turu, açılış tur bitince (kampanyaBitir)
  if (opts.kampanya)
    s.kampanya = { oy: kampanyaSans(vz), vaatler: vz, sira: kampanyaSira(opts.rng || Math.random), i: 0 };
  else if (opts.acilis) acilisUygula(s, opts.acilis, vz, opts.rng);
  if (opts.secim) s.acilisSecim = opts.secim;
  return s;
}

// Göreve başlayışı duruma işler: başlangıç göstergeleri (kampanya evraklarının etkisi üstüne biner), danışma hakkı,
// mühürler, sandık hafızası, hava ve ilişkiler; ilk evrak açılış evrağı
export function acilisUygula(s: State, acilis: Acilis, vaatler: string[] = [], rng: Rng = Math.random) {
  const A = ACILIS[acilis];
  METERS.forEach(k => (s.m[k] = clamp(A.m[k] + s.m[k] - 50, 5, 95)));
  if (A.danis) s.danis = A.danis;
  if (A.kalem) (s.defter ||= []).push({ ...A.kalem, m: 0 });
  if (A.pol) addPol(s, A.pol);
  if (A.muhur) {
    s.cnt.muhur = A.muhur;
    addPol(s, muhurPol());
  }
  for (const [w, v] of Object.entries(A.rel || {})) s.rel[w] = clamp((s.rel[w] || 0) + v, -3, 3);
  schedule(s, A.next, rng);
  s.acilis = acilis;
  s.pending = { type: "acilis" };
  // sessiz kampanyada söz verilmez; sandığa gidenin sözleri deftere ve takvime girer
  const vz = acilis === "sessiz" ? [] : vaatler.filter(id => VAAT[id]).slice(0, VAAT_MAX);
  if (!vz.length) return;
  s.vaatler = vz;
  bump(s, { vaat: vz.length }, 1);
  for (const id of vz) {
    const v = VAAT[id];
    // söz meydanı ısıtır: sandığa gidince hemen etkisi (kıl payında da, söz verilmiştir)
    if (v.hemen) METERS.forEach((k, i) => (s.m[k] = clamp(s.m[k] + (v.hemen![i] || 0), 5, 95)));
    s.flags["vaat_" + id] = true;
    if (v.set) s.flags[v.set] = true;
    s.queue.push({ id: v.kart, at: v.ay[0] + Math.floor(rng() * (v.ay[1] - v.ay[0] + 1)) });
  }
}

// Kampanya turu bitti: sandık açılır, sonuç duruma işlenir; seçim gecesi yayını için sonucu döndürür
export function kampanyaBitir(s: State, rng: Rng = Math.random) {
  const K = s.kampanya!;
  const r = acilisSecimi(K.vaatler, rng, K.oy);
  delete s.kampanya;
  acilisUygula(s, r.acilis, K.vaatler, rng);
  s.acilisSecim = r.res;
  return r;
}

// ── Uygulama: yumuşak kenar, yuvarlama, sınır
export function applyDelta(s: State, d: Effect): Effect {
  return METERS.map((k, i) => {
    const v = s.m[k];
    let x = d[i] || 0;
    if (!x) return 0;
    const hi = 100 - TUNE.edge,
      lo = TUNE.edge;
    if (x > 0 && v + x > hi) {
      const b = Math.max(hi, v);
      x = b - v + (v + x - b) * TUNE.damp;
    }
    if (x < 0 && v + x < lo) {
      const b = Math.min(lo, v);
      x = b - v - (b - (v + x)) * TUNE.damp;
    }
    const nv = clamp(Math.round(v + x), 0, 100);
    s.m[k] = nv;
    return nv - v;
  });
}

export function addPol(s: State, p: PolDef) {
  s.ongoing = s.ongoing.filter(o => o.id !== p.id);
  // yer yoksa en eski sıradan karar kalkar (iş/inşaat değil), oyuncuya da haber verilir
  if (s.ongoing.length >= MAX_ONGOING) {
    const i = Math.max(
      0,
      s.ongoing.findIndex(o => !o.proj),
    );
    (s.dropped ||= []).push(s.ongoing.splice(i, 1)[0].ad);
  }
  s.ongoing.push({
    id: p.id,
    ad: p.ad,
    e: (p.e || Z).slice(),
    left: p.ay ?? null,
    total: p.ay ?? null,
    done: p.done || null,
    msg: p.msg || null,
    doneCard: p.doneCard || null,
    proj: !!(p.done || p.doneCard),
    tags: arr(p.tags),
    ozet: p.ozet,
    yan: p.yan?.map(y => ({ ...y })),
    age: 0,
  });
}

// Sayaç: inc "ad" (+1) ya da {ad: n}; dec aynı biçimde düşürür, sayaç sıfırın altına inmez
export function bump(s: State, x: string | Record<string, number> | undefined, sign: number) {
  if (!x) return;
  const o = typeof x === "string" ? { [x]: 1 } : x;
  for (const [k, v] of Object.entries(o)) s.cnt[k] = Math.max(0, (s.cnt[k] || 0) + sign * v);
}
// next: [kart, ay] ya da { id, in: ay | [en az, en çok], if: koşul, else: kart }
// Koşul teslim anında yeniden sınanır; tutmazsa else gelir, else yoksa hiçbir şey gelmez (borç kapatıldıysa gibi)
export function schedule(s: State, n: Next | undefined, rng: Rng) {
  if (!n) return;
  const [id, d] = Array.isArray(n) ? n : ([n.id, n.in ?? 0] as const);
  const lag = Array.isArray(d) ? d[0] + Math.floor(rng() * (d[1] - d[0] + 1)) : d;
  const q: QueueItem = { id, at: s.month + 1 + lag };
  if (!Array.isArray(n)) {
    if (n.if) q.if = n.if;
    if (n.else) q.else = n.else;
  }
  s.queue.push(q);
}

// Ay başı: yürürlükteki kararlar işler, süresi dolanlar biter, birbirine değen kararlar etkileşir,
// yan etkisi olan kararlar zar atar (yan etkisi olmayan içerik rng harcamaz)
export function tick(s: State, rng: Rng = Math.random): { sum: Effect; events: TickEvent[] } {
  const sum = [0, 0, 0, 0],
    events: TickEvent[] = [];
  for (const ad of s.dropped || []) events.push({ ad, msg: "Yeni karara yer açmak için yürürlükten kalktı." });
  s.dropped = [];
  for (const o of s.ongoing) {
    o.e.forEach((v, i) => {
      sum[i] += v;
    });
    if (o.left != null) o.left--;
    o.age = (o.age || 0) + 1;
  }
  // Yan etkiler: kararın ilk aylarında gelmez, ilçede 3 ayda en çok bir tane doğar, her biri bir kez
  if (s.lastYan == null || s.month - s.lastYan >= TUNE.yanAra)
    for (const o of s.ongoing) {
      const y = o.yan?.find(y => o.age! >= (y.min ?? 3) && condOK(s, y.if) && rng() < y.p);
      if (!y) continue;
      o.yan = o.yan!.filter(x => x !== y);
      s.queue.unshift({ id: y.card, at: s.month });
      s.lastYan = s.month;
      break;
    }
  // Etkileşim tablosu (cards.ts'teki SYN): iki etiket aynı anda yürürlükteyse her ay ek etki; ilk kez değince kart/haber
  const tg = tagsOn(s);
  for (const x of SYN) {
    if (!tg.has(x.a) || !tg.has(x.b)) continue;
    (x.e || Z).forEach((v, i) => {
      sum[i] += v;
    });
    if (x.id in (s.syn ||= {})) continue; // ilk değdiği ay saklanır (0. ay da olabilir)
    s.syn[x.id] = s.month;
    if (x.card) s.queue.unshift({ id: x.card, at: s.month });
    if (x.msg) events.push({ ad: x.ad ?? x.id, msg: x.msg, e: x.e && x.e.some(Boolean) ? x.e : null, syn: true });
  }
  const ended = s.ongoing.filter(o => o.left != null && o.left <= 0);
  s.ongoing = s.ongoing.filter(o => !(o.left != null && o.left <= 0));
  for (const o of ended) {
    if (o.id === "muhur") delete s.cnt.muhur;
    if (o.done)
      o.done.forEach((v, i) => {
        sum[i] += v;
      });
    if (o.doneCard) s.queue.unshift({ id: o.doneCard, at: s.month });
    if (o.proj) (s.bitti ||= []).push(o.ad.replace(/ (inşaatı|kurulumu)$/, ""));
    events.push({ ad: o.ad, msg: o.msg || (o.proj ? `${o.ad} tamamlandı.` : `${o.ad} sona erdi.`), e: o.done });
  }
  return { sum, events };
}

export function eligible(c: CardDef, s: State) {
  if (c.chain) return false;
  if (c.once && s.used[c.id]) return false;
  if (s.last[c.id] != null && s.month - s.last[c.id] < (c.cd ?? 36)) return false;
  if (!condOK(s, gateOf(c))) return false;
  if (c.relMin && !Object.entries(c.relMin).every(([w, v]) => (s.rel[w] || 0) >= v)) return false;
  if (c.relMax && !Object.entries(c.relMax).every(([w, v]) => (s.rel[w] || 0) <= v)) return false;
  if (c.months && !c.months.includes(calOf(s.month).mon)) return false;
  if (c.minM && s.month < c.minM) return false;
  if (c.pre && s.month % TERM < TERM - 9) return false;
  return true;
}

// Yönetmen: tehlikedeki göstergeyi kurtarabilecek kartları öne çıkarır
export function rescueW(c: CardDef, s: State) {
  let w = 1;
  METERS.forEach((k, i) => {
    const v = s.m[k];
    if (v > 24 && v < 76) return;
    if (k === "h" && v >= 76) return;
    const dir = v <= 24 ? 1 : -1;
    const a = (c.L.e[i] || 0) * dir,
      b = (c.R.e[i] || 0) * dir;
    if (a >= 6 || b >= 6) w *= TUNE.rescue;
    else if (a < 0 && b < 0) w *= 0.35;
  });
  return w;
}

export function cayCard(s: State): CardDef {
  const w = METERS.map(k => ({ k, d: Math.abs(s.m[k] - 50), v: s.m[k] })).sort((a, b) => b.d - a.d)[0];
  const line = w.d < 22 ? CAY_LINES.ok : CAY_LINES[w.k + (w.v < 50 ? "lo" : "hi")];
  return {
    id: "cay",
    kind: "cay",
    who: "fikret",
    konu: "Çay molası",
    text: "Çayınız başkanım. " + line,
    L: { t: "Açık olsun", e: Z },
    R: { t: "Tavşan kanı", e: Z },
  };
}

export function pick(s: State, rng: Rng): CardDef {
  const items: { c: CardDef; w: number }[] = CARDS.filter(c => eligible(c, s)).map(c => ({
    c,
    w: (c.w ?? 1) * rescueW(c, s) * (1 + TUNE.salience * specificity(c)),
  }));
  const since = s.month - (s.last.cay ?? -4);
  if (since >= 8) items.push({ c: cayCard(s), w: 1 + (since - 8) * 0.35 });
  const fresh = items.filter(it => it.c.who !== s.lastWho);
  const pool = fresh.length ? fresh : items;
  if (!pool.length) return cayCard(s);
  let r = rng() * pool.reduce((a, it) => a + it.w, 0);
  for (const it of pool) if ((r -= it.w) <= 0) return it.c;
  return pool[pool.length - 1].c;
}

export function crisisKey(s: State): string | null {
  const cands = METERS.map(k => ({ k, v: s.m[k] }))
    .filter(x => x.v <= TUNE.crisisAt || (x.k !== "h" && x.v >= 100 - TUNE.crisisAt))
    .map(x => ({ key: x.k + (x.v <= TUNE.crisisAt ? "0" : "100"), d: Math.abs(x.v - 50) }))
    .filter(x => s.last["kriz_" + x.key] == null || s.month - s.last["kriz_" + x.key] >= TUNE.crisisCd)
    .sort((a, b) => b.d - a.d);
  return cands[0]?.key || null;
}

export function supporters(s: State) {
  return Object.keys(INFLUENCE)
    .map(w => ({ w, r: s.rel[w] || 0 }))
    .filter(x => x.r !== 0)
    .sort((a, b) => b.r - a.r);
}

// ─── Seçim: 2-5 aday, en çok oyu alan kazanır ─────────────────────────────
// Anket (pollOf) sizin "iki adaylı" oyunuzdur; ana rakip kalanı alır. Her ek aday kendi oyunu
// beta oranında sizden, kalanını ana rakipten çalar. Adaylar seçimden 9 ay önce belli olur.
export const ADAY_MAX = 5;
export const trPct = (v: number | string) => String(v).replace(".", ",");
export const joinTR = (a: string[]) =>
  a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " ve " + a[a.length - 1];
export function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function drawField(s: State, rng: Rng): Field {
  const friend = (w: string) => (s.rel[w] || 0) >= 2; // dost aday olmaz, sizi destekler
  const ids = Object.keys(ADAYLAR);
  const main =
    ids
      .filter(w => ADAYLAR[w].ana)
      .sort((a, b) => ADAYLAR[a].ana! - ADAYLAR[b].ana!)
      .find(w => !friend(w)) || "kaan";
  const extras = shuffle(
    ids
      .filter(w => w !== main && !friend(w) && ADAYLAR[w].guc)
      .filter(w => {
        const a = ADAYLAR[w];
        return rng() < ((a.sart?.(s) ? a.pSart : a.p) ?? 0);
      }),
    rng,
  ).slice(0, ADAY_MAX - 2);
  const f = { term: s.term, main, extras };
  s.field = f;
  return f;
}
export const fieldOf = (s: State, rng: Rng): Field => (s.field?.term === s.term ? s.field : drawField(s, rng));
// Seçmen grubu dökümü: grupların profiline göre dağıtılır, sonra birkaç tur orantılı düzeltmeyle
// hem her grup %100 eder hem de grupların ağırlıklı toplamı adayların oyunu tutturur
export function blocsOf(s: State, cands: { id: string; pct: number }[]) {
  const prof = (id: string) => (id === "you" ? [s.m.h / 50, s.m.e / 50, s.m.a / 50, 1] : ADAYLAR[id].blok);
  const W = BLOKLAR.map(b => b[1]);
  let m = BLOKLAR.map((_, b) => cands.map(c => Math.max(0.1, c.pct) * Math.max(0.05, prof(c.id)[b])));
  const norm = (row: number[]) => {
    const t = row.reduce((a, v) => a + v, 0);
    return row.map(v => v / t);
  };
  for (let it = 0; it < 30; it++) {
    m = m.map(norm);
    const agg = cands.map((_c, i) => 100 * m.reduce((a, row, b) => a + W[b] * row[i], 0));
    m = m.map(row => row.map((v, i) => (v * Math.max(0.1, cands[i].pct)) / Math.max(0.01, agg[i])));
  }
  return BLOKLAR.map(([ad, w], b) => ({ ad, w, pay: norm(m[b]).map(v => Math.round(1000 * v) / 10) })); // pay[i] ↔ cands[i]
}
export function tally(s: State, rng: Rng): Tally {
  const f = fieldOf(s, rng);
  const p0 = clamp(pollOf(s) + (rng() * 8 - 4), 5, 95);
  let you = p0,
    main = 100 - p0;
  const ex = f.extras.map(id => {
    const a = ADAYLAR[id],
      v = clamp(a.guc!(s) + rng() * 4 - 2, 2, 30);
    you -= a.beta! * v;
    main -= (1 - a.beta!) * v;
    return { id, v };
  });
  const raw = [{ id: "you", v: Math.max(2, you) }, { id: f.main, v: Math.max(2, main) }, ...ex].sort(
    (a, b) => b.v - a.v,
  );
  // en büyük kalan yöntemiyle binde bire yuvarla: toplam tam %100, sıra bozulmaz; kazananı yuvarlanmamış oy belirler
  const tot = raw.reduce((a, c) => a + c.v, 0),
    q = raw.map(c => (1000 * c.v) / tot),
    fl = q.map(Math.floor);
  let rest = 1000 - fl.reduce((a, v) => a + v, 0);
  q.map((v, i) => [v - fl[i], i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (rest-- > 0) fl[i]++;
    });
  const cands = raw.map((c, i) => ({ id: c.id, pct: fl[i] / 10 }));
  // p0/steal/vaat/rel/fatigue: seçim gecesi ekranındaki "Neden?" satırları için
  return {
    cands,
    blocs: blocsOf(s, cands),
    winner: cands[0].id,
    win: cands[0].id === "you",
    you: cands.find(c => c.id === "you")!.pct,
    margin: Math.round((cands[0].pct - cands[1].pct) * 10) / 10,
    month: s.month,
    term: s.term,
    order: [f.main, ...f.extras],
    p0: Math.round(p0 * 10) / 10,
    steal: ex.map(x => ({ id: x.id, v: Math.round(ADAYLAR[x.id].beta! * x.v * 10) / 10 })),
    vaat: vaatCost(s),
    rel: Math.round(relBonus(s) * 10) / 10,
    fatigue: (s.term - 1) * TUNE.fatigue,
    defter: defterOf(s),
    kalem: kalemler(s),
  };
}
export function fieldCard(s: State, rng: Rng): CardDef {
  const f = drawField(s, rng),
    rivals = [f.main, ...f.extras];
  const fr = Object.keys(ADAYLAR)
    .filter(w => (s.rel[w] || 0) >= 2 && w !== "tekir")
    .map(w => PEOPLE[w].ad);
  let text = `Başkanım, seçime dokuz ay var ve adaylar belli oldu: karşınızda ${joinTR(rivals.map(id => PEOPLE[id].ad))} var.`;
  for (const part of [
    rivals.includes("tekir") && " Evet, Tekir de; dilekçesine pati bastı, kurul kabul etti.",
    fr.length && ` ${fr[0]} aday olmadı, sizi destekliyor.`,
    rivals.length >= 3 && " Oylar bölünür, yüzde elli şart değil.",
  ])
    if (part && text.length + part.length <= 240) text += part; // sığmayan atlanır
  return {
    id: "adaylar",
    kind: "adaylar",
    who: "tuncay",
    konu: "Adaylar belli oldu",
    text,
    L: { t: "Kampanya başlasın", e: [3, -4, 0, 0] },
    R: { t: "İşimize bakalım", e: Z },
  };
}

export function electionCard(s: State, rng: Rng): CardDef {
  if (s.term >= MAX_TERMS) return endingCard("emekli", s);
  const p = Math.round(pollOf(s)),
    f = fieldOf(s, rng);
  const rivals = [f.main, ...f.extras];
  const sup = supporters(s),
    fr = sup.filter(x => x.r >= 2).map(x => PEOPLE[x.w].ad);
  const en = sup.filter(x => x.r <= -2 && !rivals.includes(x.w)).map(x => PEOPLE[x.w].ad); // aday olan düşman zaten listede
  // metin evraka sığsın: önemsizden önemliye doğru eklenir, sığmayan atlanır
  let text = `Başkanım, sandıklar kuruldu. Karşınızda ${joinTR(rivals.map(id => PEOPLE[id].ad))} var; en çok oyu alan kazanır. Son ankette %${p} civarındasınız.`;
  for (const part of [
    fr.length && ` ${fr[0]} sizin için çalışıyor.`,
    en.length && ` ${en[0]} aleyhinize oy topluyor.`,
    " Son bir hamle?",
  ])
    if (part && text.length + part.length <= 240) text += part;
  return {
    id: "secim",
    kind: "secim",
    who: "fikret",
    konu: "Yerel seçim",
    text,
    L: { t: "Sessiz kalalım", e: Z },
    R: { t: "Meydana çıkalım", e: [6, -10, 3, 0] },
  };
}

export function endingCard(key: string, _s: State, extra: { oy?: string; rakip?: string } = {}): CardDef {
  const E = ENDINGS[key];
  return {
    id: "end_" + key,
    kind: "ending",
    key,
    who: E.who,
    konu: E.konu,
    text: E.text.replace("{oy}", extra.oy ?? "").replace("{rakip}", extra.rakip ?? ""),
    L: {
      t: E.btn?.[0] ?? (key === "emekli" ? "Hakkınızı helal edin" : E.win ? "Hayırlı olsun" : "Ah be Fikret..."),
      e: Z,
    },
    R: { t: E.btn?.[1] ?? (key === "emekli" ? "Son bir çay" : E.win ? "Karakavak'a selam" : "Bu da geçer"), e: Z },
  };
}

// Oyun sonu gazetesi: başkanın neyle anılacağı (MIRAS), koşulu tutan ilk n cümle
export const mirasOf = (s: State, n = 2) =>
  MIRAS.filter(m => condOK(s, m.if) && (!m.son || arr(m.son).includes(s.over?.key ?? "")))
    .slice(0, n)
    .map(m => m.text);

// Açılış seçimi: sandığa gidenin gecesi. Sonuç baştan belli (ankete göre ezici, rahat ya da kıl payı zafer);
// seçim gecesi yayını bu sonucu sandık sandık açar. Rakip hep Nermin Hanım, yanına sıfır ile iki aday.
export function acilisSecimi(vaatler: string[], rng: Rng = Math.random, oy?: number): { acilis: Acilis; res: Tally } {
  const vz = vaatler.filter(id => VAAT[id]).slice(0, VAAT_MAX),
    sans = Math.round(oy ?? kampanyaSans(vz)),
    zar = rng() * 100,
    zafer = zar < sans;
  const pool = Object.keys(ADAYLAR).filter(w => w !== "nermin" && w !== "tekir" && ADAYLAR[w].guc);
  const extras = shuffle(pool, rng).slice(0, Math.floor(rng() * 3));
  if (rng() < 0.06) extras.push("tekir"); // Tekir her seçime aday olur, bazen
  const ex = extras.map(id => ({ id, v: 4 + rng() * 8 }));
  const rest = 100 - ex.reduce((a, x) => a + x.v, 0),
    fark = zafer ? Math.min(SANDIK.tavan, 3 + (sans - zar) * SANDIK.egim) : 0.3 + rng() * 0.6;
  const raw = [{ id: "you", v: (rest + fark) / 2 }, { id: "nermin", v: (rest - fark) / 2 }, ...ex].sort(
    (a, b) => b.v - a.v,
  );
  // en büyük kalan yöntemiyle binde bire yuvarla (tally ile aynı)
  const q = raw.map(c => c.v * 10),
    fl = q.map(Math.floor);
  let kalan = 1000 - fl.reduce((a, v) => a + v, 0);
  q.map((v, i) => [v - fl[i], i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (kalan-- > 0) fl[i]++;
    });
  const cands = raw.map((c, i) => ({ id: c.id, pct: fl[i] / 10 }));
  const acilis: Acilis = !zafer ? "kilpayi" : fark >= SANDIK.ezici ? "ezici" : "zafer",
    tmp = newGame();
  tmp.m = { ...ACILIS[acilis].m };
  const you = cands.find(c => c.id === "you")!.pct;
  return {
    acilis,
    res: {
      cands,
      blocs: blocsOf(tmp, cands),
      winner: "you",
      win: true,
      you,
      margin: Math.round((cands[0].pct - cands[1].pct) * 10) / 10,
      month: -1, // göreve başlamadan önceki mart
      term: 0,
      order: ["nermin", ...extras],
      p0: sans,
      steal: [],
      vaat: 0,
      rel: 0,
      fatigue: 0,
      ilk: true,
      vaatler: vz.map(id => VAAT[id].ad),
      sans,
      acilis,
    },
  };
}

// Göreve başlarken: kampanyanın nasıl bittiğini ve verilen sözleri anan ilk evrak
function acilisCard(s: State): CardDef {
  const vz = (s.vaatler || []).map(id => `“${VAAT[id].ad}”`), // başlıklar tırnakla: cümle ortasında büyük harf doğal dursun
    fark = s.acilisSecim?.margin;
  const soz =
    vz.length === 1 ? `Sözünüz de ortada: ${vz[0]}.` : vz.length ? `Sözleriniz de ortada: ${joinTR(vz)}.` : "";
  const sozSigar = (t: string, kisa: string) => (t.length <= 240 ? t : kisa);
  const puan = fark != null ? trPct(fark) + " puan farkla " : "",
    mh = ["", "bir", "iki", "üç", "dört", "beş", "altı"][s.cnt.muhur || 0] || String(s.cnt.muhur);
  const T = {
    sessiz: {
      konu: "Sessiz zafer",
      text: "Başkanım, seçimi sessiz sedasız kazandınız; afiş bile asmadık. Kimse adınızı bilmiyor ama sicil tertemiz. Bir de mühür verdiler: zararlı bir evrağa basın, en ağır kaybı silinsin.",
      L: "Tanışırız elbet",
      R: "İşe koyulalım",
    },
    ezici: {
      konu: "Ezici zafer",
      text: sozSigar(
        `Başkanım, sandıktan ${puan}ezici çıktınız! Ankara zafer ödeneği yolladı, masada ${mh} mühür var: zararlı evrağa basın, en ağır kaybı silinsin. ${soz}`,
        `Başkanım, sandıktan ${puan}ezici çıktınız! Ankara zafer ödeneği yolladı, masada ${mh} mühür var. ${vz.length} sözünüz de defterde.`,
      ),
      L: "Hayırlı olsun",
      R: "Sözler tutulacak",
    },
    zafer: {
      konu: "Rahat zafer",
      text: sozSigar(
        `Başkanım, sandıktan ${puan}rahat çıktınız! Ankara ödenek yolladı, masada ${mh} mühür var: zararlı evrağa basın, en ağır kaybı silinsin. ${soz}`,
        `Başkanım, sandıktan ${puan}rahat çıktınız! Ankara ödenek yolladı, masada ${mh} mühür var. ${vz.length} sözünüz de defterde.`,
      ),
      L: "Hayırlı olsun",
      R: "Sözler tutulacak",
    },
    kilpayi: {
      konu: "Kıl payı",
      text: sozSigar(
        `Başkanım, fark ${fark != null ? trPct(fark) + " puan" : "bir avuç oy"}! Nermin Hanım itiraz etti; mazbata gölgeli, halk her kusuru fazla sayacak. İtirazı kapatırsak gölge kalkar. ${soz}`,
        `Başkanım, fark ${fark != null ? trPct(fark) + " puan" : "bir avuç oy"}! Nermin Hanım itiraz etti; mazbata gölgeli. İtirazı kapatırsak gölge kalkar. ${vz.length} sözünüz de ortada.`,
      ),
      L: "Fark farktır",
      R: "Kolları sıvayalım",
    },
  }[s.acilis || "sessiz"];
  return {
    id: "acilis",
    kind: "acilis",
    who: "fikret",
    konu: T.konu,
    text: T.text,
    L: { t: T.L, e: Z },
    R: { t: T.R, e: Z },
  };
}

export function special(p: Pending, s: State): CardDef {
  if (p.type === "ending") return endingCard(p.key, s, p);
  if (p.type === "acilis") return acilisCard(s);
  if (p.type === "tekir")
    return {
      id: "tekirsave",
      kind: "tekir",
      who: "tekir",
      konu: "Olağanüstü durum",
      restore: p.restore,
      text: "(Tam o kararı mühürleyecekken Tekir masaya atladı, evrakın üstüne kıvrılıp uyudu. Mühür basılamadı, karar askıda kaldı. Kimse kediyi uyandırmaya kıyamadı.) Mırrr.",
      L: { t: "Aferin Tekir", e: Z },
      R: { t: "Mamayı iki kat yapın", e: Z },
    };
  if (p.type === "davet") return { ...DAVET[Math.min(s.cnt.ankara_ret || 0, DAVET.length - 1)], kind: "davet" };
  // esnaf tavan yapınca oda sizi başkanlığa çağırır (eski kayıtlardaki erken seçim de buraya döner)
  if (p.type === "oda" || p.type === "erken")
    return { ...ODA[Math.min(s.cnt.oda_ret || 0, ODA.length - 1)], kind: "davet" };
  {
    const r = p.res,
      n = r ? r.cands.length : 2;
    if (!p.win) {
      if (r?.winner === "tekir") return endingCard("tekir", s);
      const w = r?.cands[0];
      return endingCard("sandik", s, {
        oy: p.oy,
        rakip: w ? ` ${PEOPLE[w.id].ad} %${trPct(w.pct)} ile birinci oldu.` : "",
      });
    }
    const alti = r && r.you < 50 ? " Yüzde elli olmadı ama birinci birincidir." : "";
    return {
      id: "sonuc",
      kind: "sonuc",
      who: "huseyin",
      konu: "Seçim sonucu",
      oy: p.oy,
      text: p.big
        ? `${n} adaylı yarıştan %${p.oy} ile, ezici bir farkla birinci çıktınız başkanım! Meydana heykelinizi dikmek istediler; siz "önce çay ocağı" dediniz. ${s.term + 1}. döneminiz hayırlı olsun.`
        : `${n} adaylı yarıştan %${p.oy} ile birinci çıktınız başkanım!${alti} Bütün ilçeye çay dağıtıyorum. ${s.term + 1}. döneminiz hayırlı olsun.`,
      L: { t: "Çalışmaya devam", e: Z },
      R: { t: "Önce bir çay", e: Z },
    };
  }
}

// Kartı o anki duruma göre somutlaştırır: metin, ilişkiye göre etki, taraf değişimi
export function materialize(c: CardDef, s: State, rng: Rng): Cur {
  const kind: CardKind = c.kind || (c.id.startsWith("intro") ? "intro" : "normal");
  const people = kind === "normal" && !c.norel && !NOREL.has(c.who);
  const r = s.rel[c.who] || 0,
    fav = c.fav || "R";
  const hava = kind === "normal" || kind === "kriz" ? havaOf(s) : [1, 1, 1, 1];
  const side = (key: "L" | "R"): Side => {
    const x = c[key];
    // havalar (gölgeli mazbata, armağanlar): eksi etkiler çarpılır; yalnız sıradan evrak ve kriz
    const olc = (d: Effect) =>
      d.map(v => Math.round(v * TUNE.scale)).map((v, i) => (v < 0 && hava[i] !== 1 ? Math.round(v * hava[i]) : v));
    let e = (x.e || Z).map(v => Math.round(v * TUNE.scale));
    if (people && key !== fav) {
      if (r <= -2)
        e = e.map(v => (v < 0 ? Math.round(v * 1.3) : v)); // dargın biri reddedilince fazla bozulur
      else if (r >= 2) e = e.map(v => (v < 0 ? Math.round(v * 0.7) : v)); // dost biri anlayış gösterir
    }
    e = e.map((v, i) => (v < 0 && hava[i] !== 1 ? Math.round(v * hava[i]) : v));
    const zar = x.zar && {
      p: x.zar.p,
      iyi: { ...x.zar.iyi, e: x.zar.iyi.e && olc(x.zar.iyi.e) },
      kotu: { ...x.zar.kotu, e: x.zar.kotu.e && olc(x.zar.kotu.e) },
    };
    const rel: Record<string, number> = {};
    if (people) rel[c.who] = key === fav ? 1 : -1;
    for (const [w, v] of Object.entries(x.rel || {})) rel[w] = (rel[w] || 0) + v;
    return {
      t: x.t,
      e,
      rel,
      set: x.set,
      clr: x.clr,
      inc: x.inc,
      dec: x.dec,
      next: x.next,
      pol: x.pol,
      cut: x.cut,
      son: x.son,
      anket: x.anket,
      not: x.not,
      zar,
      oy: x.oy,
    };
  };
  let L = side("L"),
    R = side("R");
  // Kabul hep aynı tarafta olmasın: normal kartlar yarı yarıya ters çevrilir
  const flip = (kind === "normal" || kind === "kriz" || kind === "kampanya") && rng() < 0.5;
  if (flip) [L, R] = [R, L];
  // Hatırlama metni: ilk tutan varyant ({req: bayraklar} ya da {if: koşul}) asıl metnin yerine geçer
  const alt = (c.alt || []).find(a => (a.if ? condOK(s, a.if) : arr(a.req).every(f => s.flags[f])));
  const cal = calOf(kind === "kampanya" ? -1 : s.month); // kampanya göreve başlamadan önce, martta
  return {
    id: c.id,
    kind,
    key: c.key,
    restore: c.restore,
    oy: c.oy,
    who: c.who,
    konu: c.konu,
    text: alt ? alt.text : c.text,
    L,
    R,
    flip,
    rel: people ? r : null,
    sayi: `${cal.year}/${String(101 + s.signed).padStart(4, "0")}`,
    tarih: `${String(1 + Math.floor(rng() * 28)).padStart(2, "0")}.${String(cal.mon + 1).padStart(2, "0")}.${cal.year}`,
    seed: Math.floor(rng() * 1e9),
  };
}

// Vakti gelmiş zincir kartı: koşulu tutmayan kuyruk kaydı else kartına döner ya da düşer
export function due(s: State): CardDef | null {
  for (;;) {
    const i = s.queue.findIndex(q => q.at <= s.month);
    if (i < 0) return null;
    const q = s.queue.splice(i, 1)[0];
    const id = !q.if || condOK(s, q.if) ? q.id : q.else;
    if (id && CARD[id]) return CARD[id];
  }
}

export function draw(s: State, rng: Rng = Math.random): Cur {
  let c: CardDef;
  if (s.kampanya) c = { ...KAMPANYA_KART[s.kampanya.sira[s.kampanya.i]], kind: "kampanya" };
  else if (s.pending) {
    c = special(s.pending, s);
    s.pending = null;
  } else if (s.intro > 0) c = INTRO[INTRO.length - s.intro];
  else if (s.month % TERM === TERM - 1 && s.electionTerm !== s.term) c = electionCard(s, rng);
  // seçimden 9 ay önceki pencerede ilk fırsatta adaylar ilan edilir (son dönemde seçim yok)
  else if (s.month % TERM >= TERM - 10 && s.month % TERM < TERM - 1 && s.fieldTerm !== s.term && s.term < MAX_TERMS)
    c = fieldCard(s, rng);
  else {
    const ck = crisisKey(s);
    if (ck && rng() < TUNE.crisisP) c = { ...CRISES[ck], id: "kriz_" + ck, kind: "kriz" };
    else c = due(s) || pick(s, rng);
  }
  const cur = materialize(c, s, rng);
  s.cur = cur;
  return cur;
}

// Mühür basılabilir mi: elde mühür var, sıradan evrak (kriz, seçim, özel evrak değil)
export const muhurOK = (s: State) => (s.cnt.muhur || 0) > 0 && s.cur?.kind === "normal";
// Mühürün silişi: en ağır kayıp (eşitlikte halk önce), en çok tavan kadar
export function muhurEtki(e: Effect, tavan = MUHUR.tavan): { e: Effect; i: number; sil: number } {
  let i = -1;
  e.forEach((v, j) => {
    if (v < 0 && (i < 0 || v < e[i])) i = j;
  });
  if (i < 0) return { e, i, sil: 0 };
  const sil = Math.min(tavan, -e[i]);
  return { e: e.map((v, j) => (j === i ? v + sil : v)), i, sil };
}

// side: "L" | "R" → { d: kararın etkisi, td: ayın işleyen kararları, events, rel, dead }
// opt.muhur: mühürlü evrak; seçeneğin (zarıyla birlikte) en ağır kaybı silinir, silinecek kayıp yoksa mühür harcanmaz
export function choose(s: State, side: "L" | "R", rng: Rng = Math.random, opt: { muhur?: boolean } = {}): ChooseOut {
  const c = s.cur!,
    o = c[side];
  const before = { ...s.m };
  const out: ChooseOut = { d: Z, td: Z, events: [], rel: {} };
  // sandık defteri: kalem adıyla yazılır; skandal/eser sayaçları kapılar için (gazeteci kartı, müfettiş yayı).
  // İlk leke temiz sicili siler.
  function kalemYaz(k: Kalem) {
    (s.defter ||= []).push({ ...k, m: s.month });
    if (k.puan >= 0) return;
    bump(s, "skandal", 1);
    const n = s.defter.length;
    s.defter = s.defter.filter(x => x.ad !== TEMIZ);
    if (s.defter.length < n)
      out.events.push({ ad: TEMIZ, msg: "İlk lekeyle temiz sicil gitti; sandık artık bunu saymaz." });
  }
  // zarlı seçenek: oran düğmede yazılı; tutarsa iyi, tutmazsa kötü uç işler (etkisi seçeneğinkine eklenir)
  const rel = { ...o.rel };
  let e = o.e;
  if (o.zar) {
    const iyi = rng() < o.zar.p,
      z = iyi ? o.zar.iyi : o.zar.kotu;
    out.zar = { iyi, msg: z.msg, oy: z.oy };
    if (z.e) e = e.map((v, i) => v + (z.e![i] || 0));
    arr(z.set).forEach(f => {
      s.flags[f] = true;
    });
    for (const [w, v] of Object.entries(z.rel || {})) rel[w] = (rel[w] || 0) + v;
    if (z.kalem) kalemYaz(z.kalem);
  }
  if (opt.muhur && muhurOK(s)) {
    const m = muhurEtki(e);
    if (m.sil) {
      e = m.e;
      out.muhur = { k: METERS[m.i], v: m.sil };
      s.cnt.muhur--;
      if (!s.cnt.muhur) s.ongoing = s.ongoing.filter(x => x.id !== "muhur");
    }
  }
  out.d = applyDelta(s, e);
  arr(o.set).forEach(f => {
    s.flags[f] = true;
  });
  arr(o.clr).forEach(f => {
    delete s.flags[f];
  });
  bump(s, o.inc, 1);
  bump(s, o.dec, -1);
  const decVaat = typeof o.dec === "string" ? o.dec === "vaat" : !!o.dec?.vaat;
  if (VAAT_KART.has(c.id) && !decVaat) bump(s, "vaat", -1);
  if (o.anket) kalemYaz(o.anket);
  schedule(s, o.next, rng);
  if (o.cut) s.ongoing = s.ongoing.filter(x => !arr(o.cut).includes(x.id));
  if (o.pol) addPol(s, o.pol);
  for (const [w, v] of Object.entries(rel)) {
    const nv = clamp((s.rel[w] || 0) + v, -3, 3);
    if (nv !== (s.rel[w] || 0)) out.rel[w] = nv - (s.rel[w] || 0);
    s.rel[w] = nv;
  }
  // imzalı evrak: kullanıldı, günlüğe ve gazeteye girer, ay geçer
  const signed = () => {
    s.used[c.id] = true;
    s.last[c.id] = s.month;
    s.lastWho = c.who;
    s.signed++;
    s.log.push({ m: s.month, who: c.who, konu: c.konu, t: o.t, e: out.d });
    if (s.log.length > 60) s.log.shift();
    passMonth();
  };
  const passMonth = () => {
    s.month++;
    const t = tick(s, rng);
    out.td = applyDelta(s, t.sum);
    out.events.push(...t.events);
  };

  switch (c.kind) {
    case "intro":
      s.intro--;
      return out;
    case "acilis": // göreve başlarken: ay geçmez, günlüğe girmez
      return out;
    case "kampanya": {
      // kampanya evrağı: anket oynar, ay geçmez; dördüncü evraktan sonra sandık açılır (kampanyaBitir)
      const K = s.kampanya!;
      out.oy = (o.oy || 0) + (out.zar?.oy || 0);
      K.oy = clamp(K.oy + out.oy, SANS.alt, SANS.ust);
      if (++K.i >= K.sira.length) out.kampanyaBitti = true;
      return out;
    }
    case "ending":
      s.over = { key: c.key!, months: s.month, term: s.term };
      out.over = true;
      return out;
    case "tekir":
      s.m = { ...c.restore! };
      s.tekirUsed = true;
      out.d = METERS.map(k => s.m[k] - before[k]);
      passMonth();
      break;
    case "sonuc":
      s.term++;
      if (s.danisTerm !== s.term) {
        s.danis = 3;
        s.danisTerm = s.term;
      }
      // yeni dönemde eski vaatlerin ve defterin yarısı unutulur
      for (const k of ["vaat", "skandal"]) if (s.cnt[k]) s.cnt[k] = Math.floor(s.cnt[k] / 2);
      if (s.defter) s.defter = s.defter.map(k => ({ ...k, puan: k.puan / 2 })).filter(k => Math.abs(k.puan) >= 0.5);
      passMonth();
      break;
    case "cay":
      s.cay++;
      s.last.cay = s.month;
      passMonth();
      break;
    case "secim":
      s.electionTerm = s.term;
      break;
    case "adaylar":
      s.fieldTerm = s.term;
      passMonth();
      break;
    case "davet": // Ankara'dan ya da esnaftan: kabul finali getirir · ret normal evrak gibi işlenir (günlüğe ve gazeteye girer)
      if (o.son) {
        s.pending = { type: "ending", key: o.son };
        return out;
      }
      signed();
      break;
    default:
      signed();
  }

  // yay finali: seçenek oyunu kendi sonuyla bitirir (göstergeler ne olursa olsun)
  if (o.son && c.kind !== "davet") {
    s.pending = { type: "ending", key: o.son };
    return out;
  }
  // seçim evrakında esnaf ya da Ankara tavanı sandığı bekletmez: önce seçim, teklif sonra
  const dead = METERS.find(
    k => s.m[k] <= 0 || (k !== "h" && s.m[k] >= 100 && !((k === "e" || k === "a") && c.kind === "secim")),
  );
  if (dead) {
    const key = dead + (s.m[dead] <= 0 ? "0" : "100");
    if (key === "e100")
      s.pending = { type: "oda" }; // esnaf tavan yapınca oda sizi başkanlığa çağırır; reddedebilirsiniz
    else if (key === "a100")
      s.pending = { type: "davet" }; // Ankara tavan yapınca sizi yukarı çağırır; reddedebilirsiniz
    else if ((s.cnt.tekir || 0) >= 3 && !s.tekirUsed) s.pending = { type: "tekir", restore: before, cause: key };
    else s.pending = { type: "ending", key };
    out.dead = dead;
  } else if (c.kind === "secim") {
    const r = tally(s, rng);
    s.lastElection = r; // seçim gecesi ekranı ve gazete için
    s.pending = { type: "sonuc", oy: trPct(r.you), win: r.win, big: r.win && r.margin >= 25, res: r };
  }
  return out;
}
