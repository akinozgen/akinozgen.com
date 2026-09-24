// İçerik denetimi: kart grafı, bayraklar, sayaçlar, etiketler, uzunluklar.
// lintContent(E) → { errors: [], warnings: [] }. E: cards.js + engine.js'ten dönen nesne (CARDS, CARD, CRISES, INTRO, PEOPLE, SYN).
// test/content.test.mjs hata bırakmaz; tools/sim.mjs uyarıları da yazar.

// Motorun kendisinin okuduğu sayaçlar (kartlarda kapı olarak geçmese de kullanılıyor)
const ENGINE_CNT = new Set(["tekir", "vaat"]);

const arr = x => [].concat(x ?? []);
const keysOf = x => (!x ? [] : typeof x === "string" ? [x] : Object.keys(x));
const nextOf = n => (!n ? null : Array.isArray(n) ? { id: n[0], in: n[1] } : n);

export function lintContent(E) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  const all = [...E.CARDS, ...E.INTRO.map(c => ({ ...c, intro: true })), ...Object.entries(E.CRISES).map(([k, c]) => ({ ...c, id: "kriz_" + k, crisis: true }))];
  const ids = new Set(), polIds = new Set();
  const flagW = new Set(), flagR = new Map(), cntW = new Set(), cntR = new Map(), tagW = new Set(), tagR = new Map();
  const readF = (f, by) => flagR.set(f, [...(flagR.get(f) || []), by]);
  const readC = (k, by) => cntR.set(k, [...(cntR.get(k) || []), by]);
  const readT = (t, by) => tagR.set(t, [...(tagR.get(t) || []), by]);
  const readCond = (q, by) => {
    if (!q) return;
    arr(q.req).forEach(f => readF(f, by)); arr(q.not).forEach(f => readF(f, by));
    Object.keys(q.cnt || {}).forEach(k => readC(k, by));
    arr(q.tag).forEach(t => readT(t, by)); arr(q.notag).forEach(t => readT(t, by));
    for (const w of Object.keys(q.rel || {})) if (!E.PEOPLE[w]) err(`${by}: koşulda bilinmeyen kişi ${w}`);
  };
  const polRefs = [];

  for (const c of E.CARDS) { if (ids.has(c.id)) err(`çift kimlik: ${c.id}`); ids.add(c.id); }
  for (const c of all) {
    const by = c.id || c.konu;
    if (!E.PEOPLE[c.who]) err(`${by}: bilinmeyen kişi ${c.who}`);
    if (!c.text || c.text.length > 240) err(`${by}: metin boş ya da evraka sığmaz (${c.text?.length})`);
    for (const a of c.alt || []) {
      if (!a.text || a.text.length > 240) err(`${by}: hatırlama metni boş ya da uzun (${a.text?.length})`);
      arr(a.req).forEach(f => readF(f, by)); readCond(a.if, by);
    }
    arr(c.req).forEach(f => readF(f, by)); arr(c.not).forEach(f => readF(f, by));
    Object.keys(c.reqCnt || {}).forEach(k => readC(k, by));
    arr(c.reqTag).forEach(t => readT(t, by)); arr(c.notTag).forEach(t => readT(t, by));
    arr(c.reqPol).concat(arr(c.notPol)).forEach(p => polRefs.push([p, by]));
    for (const [w] of Object.entries({ ...c.relMin, ...c.relMax })) if (!E.PEOPLE[w]) err(`${by}: ilişki kapısında bilinmeyen kişi ${w}`);
    for (const side of ["L", "R"]) {
      const o = c[side], sb = `${by}.${side}`;
      if (!o || !o.t || !Array.isArray(o.e) || o.e.length !== 4) { err(`${sb}: hatalı seçenek`); continue; }
      if (o.t.length > 26) err(`${sb}: "${o.t}" düğmeye sığmaz (${o.t.length})`);
      if (o.e.some(v => !Number.isFinite(v))) err(`${sb}: etki sayı değil`);
      arr(o.set).forEach(f => flagW.add(f)); arr(o.clr).forEach(f => flagW.add(f));
      keysOf(o.inc).forEach(k => cntW.add(k)); keysOf(o.dec).forEach(k => cntW.add(k));
      for (const w of Object.keys(o.rel || {})) if (!E.PEOPLE[w]) err(`${sb}: ilişkide bilinmeyen kişi ${w}`);
      const n = nextOf(o.next);
      if (n) {
        const d = n.in ?? 0;
        if (!(Number.isInteger(d) && d >= 0) && !(Array.isArray(d) && d.length === 2 && d[0] >= 0 && d[1] >= d[0])) err(`${sb}: next gecikmesi hatalı`);
        readCond(n.if, sb);
        if (n.else && !n.if) warn(`${sb}: next.else var ama if yok`);
      }
      if (o.pol) {
        const p = o.pol;
        if (!p.id || !p.ad) err(`${sb}: kararın id/ad'ı yok`);
        polIds.add(p.id);
        if (p.e && p.e.length !== 4) err(`${sb}: kararın aylık etkisi dört gösterge değil`);
        arr(p.tags).forEach(t => tagW.add(t));
      }
      arr(o.cut).forEach(p => polRefs.push([p, sb]));
    }
  }

  // Kart bağlantıları
  const links = c => ["L", "R"].flatMap(s => {
    const o = c[s] || {}, n = nextOf(o.next);
    return [n?.id, n?.else, o.pol?.doneCard].filter(Boolean);
  });
  for (const c of all) for (const t of links(c)) if (!ids.has(t)) err(`${c.id || c.konu}: bağlandığı kart yok → ${t}`);
  for (const x of E.SYN) {
    if (!x.id || !x.a || !x.b) err(`SYN: id/a/b eksik ${JSON.stringify(x)}`);
    readT(x.a, "SYN " + x.id); readT(x.b, "SYN " + x.id);
    if (x.card && !ids.has(x.card)) err(`SYN ${x.id}: kart yok → ${x.card}`);
    if (x.e && x.e.length !== 4) err(`SYN ${x.id}: etki dört gösterge değil`);
    if (x.msg && !x.ad) err(`SYN ${x.id}: haberin başlığı (ad) yok`);
  }
  if (new Set(E.SYN.map(x => x.id)).size !== E.SYN.length) err("SYN: çift kimlik");
  for (const [p, by] of polRefs) if (!polIds.has(p)) err(`${by}: böyle bir karar yok → ${p}`);

  // Ulaşılabilirlik: zincir kartları yalnız bağlantıyla gelir; hiçbir yerden bağlanmayan zincir ölü içeriktir
  const reach = new Set(), stack = [...all.filter(c => !c.chain)];
  for (const x of E.SYN) if (x.card && tagW.has(x.a) && tagW.has(x.b)) stack.push(E.CARD[x.card]);
  while (stack.length) {
    const c = stack.pop();
    if (!c || reach.has(c.id)) continue;
    reach.add(c.id);
    for (const t of links(c)) if (E.CARD[t]) stack.push(E.CARD[t]);
  }
  for (const c of E.CARDS) if (c.chain && !reach.has(c.id)) err(`${c.id}: zincir kartına hiçbir yerden ulaşılmıyor`);
  // Zincir döngüsü: once olmayan zincirler kendini besleyebilir
  for (const c of E.CARDS) {
    const seen = new Set(), st = links(c).map(t => [t, 1]);
    while (st.length) {
      const [t, d] = st.pop();
      if (t === c.id) { if (!c.once) warn(`${c.id}: zincir kendine dönüyor`); break; }
      if (seen.has(t) || d > 8 || !E.CARD[t]) continue;
      seen.add(t); links(E.CARD[t]).forEach(u => st.push([u, d + 1]));
    }
  }

  // Durum anahtarları: okunup hiç yazılmayan hata, yazılıp hiç okunmayan uyarı
  for (const [f, by] of flagR) if (!flagW.has(f)) err(`bayrak "${f}" okunuyor ama hiçbir seçenek koymuyor (${by.join(", ")})`);
  for (const f of flagW) if (!flagR.has(f)) warn(`bayrak "${f}" konuyor ama hiçbir yer okumuyor`);
  for (const [k, by] of cntR) if (!cntW.has(k)) err(`sayaç "${k}" okunuyor ama hiçbir seçenek artırmıyor (${by.join(", ")})`);
  for (const k of cntW) if (!cntR.has(k) && !ENGINE_CNT.has(k)) warn(`sayaç "${k}" artıyor ama hiçbir yer okumuyor`);
  for (const [t, by] of tagR) if (!tagW.has(t)) err(`etiket "${t}" aranıyor ama hiçbir karar taşımıyor (${by.join(", ")})`);
  for (const t of tagW) if (!tagR.has(t)) warn(`etiket "${t}" taşınıyor ama hiçbir yer aramıyor`);
  return { errors, warnings };
}
