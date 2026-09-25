// İçerik denetimi: kart grafı, bayraklar, sayaçlar, etiketler, uzunluklar.
// lintContent(E) → { errors: [], warnings: [] }. E: cards.ts + engine.ts'ten dönen nesne (CARDS, CARD, CRISES, INTRO, PEOPLE, SYN; varsa DAVET, ENDINGS, MIRAS).
// test/content.test.mjs hata bırakmaz; tools/sim.mjs uyarıları da yazar.

// Motorun kendisinin okuduğu sayaçlar (kartlarda kapı olarak geçmese de kullanılıyor)
const ENGINE_CNT = new Set(["tekir", "vaat", "skandal", "muhur"]);

// Bağlam: bir olayı "olmuş" sayan metin, o olay yaşanmadan gelmemeli. Metin bu olayı anıyorsa ya kart
// o olayın kendi zincirindedir (ok), ya da kart/metin varyantı olayın bayrağını ister (flag).
// Yeni bir olay (heykel, bina, proje...) eklerken buraya da yazın.
export const FACTS = [
  { ad: "dev kavun heykeli", re: /kavun heykel/i, flag: "devkavun", ok: ["devkavun", "devkavun2"] },
  { ad: "Karakavak Towers", re: /Towers/, flag: "towers", ok: ["towers", "towersL", "skandal"] },
  { ad: "eşek Karaca", re: /Karaca\b/, flag: "karaca", ok: ["esek", "karaca"] },
  { ad: "e-Belediye", re: /e-Belediye/, ok: ["eb_ihbar", "ebelediye", "ebelediye_coktu", "tek_kullanici"] },
  { ad: "sondaj kulesi", re: /sondaj/i, ok: ["petrol_rezalet", "petrol_kule"] },
  { ad: "coğrafi işaret", re: /coğrafi işaret/i, ok: ["tescil_sahte", "cografi_isaret", "tescil_sonuc", "ova_kavga"] },
  { ad: "kent lokantası", re: /kent lokanta/i, ok: ["kent_lokantasi", "kuyruk_birlesti"] },
  { ad: "tanzim çadırı", re: /tanzim/i, ok: ["tanzim", "tanzim_ispanak", "kuyruk_birlesti"] },
  {
    ad: "çevre yolu",
    re: /çevre yolu/i,
    ok: ["garanti_yol", "garanti_tur", "garanti_kopru", "garanti_fesih", "scooter_garanti"],
  },
  { ad: "kiralık scooter", re: /scooter/i, ok: ["scooter", "scooter_dere", "scooter_garanti"] },
  { ad: "tribün", re: /tribün/i, ok: ["tribun", "kume"] },
  {
    ad: "dizi çekimi",
    re: /\bdizi\b/i,
    ok: ["set_evi", "set_teklif", "set_kostum", "set_viral", "set_mesai", "set_sezon", "set_intikam", "dizi", "dizi2"],
  },
  { ad: "Norveç heyeti", re: /Norveç/, ok: ["kardes", "norvec"] },
  { ad: "lojman", re: /lojman/i, ok: ["ogretmen_lojman", "doktor_lojman"] },
  { ad: "Karakavak jetonu", re: /jeton/i, ok: ["sakiz"] },
  { ad: "Roma mozaiği", re: /mozaik/i, ok: ["mozaik", "mozaik2"] },
  { ad: "Dijital Fikret", re: /Dijital Fikret/, ok: ["dijital", "dijital2"] },
  { ad: "AVM", re: /\bAVM/, ok: ["avm", "avmL", "towers"] },
  { ad: "sanal tarla", re: /sanal (kavun )?tarla/i, ok: ["sanal_ciftlik", "ciftlik_cikis", "ciftlik_kacti"] },
  { ad: "güneş paneli", re: /panel/i, ok: ["ges_tarla", "ges_festival", "ova_kavga", "gunes", "elektrik"] },
  { ad: "metro sözü", re: /metro/i, flag: "metro_soz", ok: ["vaat_metro", "su_kapsul", "deepfake"] },
  { ad: "petrol müjdesi", re: /petrol/i, ok: ["petrol", "petrol_tahlil", "petrol_rezalet", "petrol_kule"] },
  {
    ad: "hizmet sarayı",
    re: /hizmet saray/i,
    flag: "bina_saray",
    ok: ["bina_saray", "bina_temel", "bina_uyari", "bina_kat", "bina_icra"],
  },
  {
    ad: "Kavun AŞ",
    re: /Kavun AŞ/,
    flag: "as_kuruldu",
    ok: ["as_kurulus", "as_akraba", "as_su", "as_kafe", "as_arac", "as_zarar", "as_devir"],
  },
  {
    ad: "Kavunlandia",
    re: /Kavunlandia/i,
    flag: "kral_park",
    ok: ["kral_park", "kral_tac"],
  },
];

const arr = x => [].concat(x ?? []);
const keysOf = x => (!x ? [] : typeof x === "string" ? [x] : Object.keys(x));
const nextOf = n => (!n ? null : Array.isArray(n) ? { id: n[0], in: n[1] } : n);

export function lintContent(E) {
  const errors = [],
    warnings = [];
  const err = m => errors.push(m),
    warn = m => warnings.push(m);
  const all = [
    ...E.CARDS,
    ...E.INTRO.map(c => ({ ...c, intro: true })),
    ...Object.entries(E.CRISES).map(([k, c]) => ({ ...c, id: "kriz_" + k, crisis: true })),
    ...(E.DAVET || []),
    ...(E.KAMPANYA || []).map(c => ({ ...c, kampanya: true })),
  ];
  const ids = new Set(),
    polIds = new Set();
  const flagW = new Set(),
    flagR = new Map(),
    cntW = new Set(),
    cntR = new Map(),
    tagW = new Set(),
    tagR = new Map();
  const readF = (f, by) => flagR.set(f, [...(flagR.get(f) || []), by]);
  const readC = (k, by) => cntR.set(k, [...(cntR.get(k) || []), by]);
  const readT = (t, by) => tagR.set(t, [...(tagR.get(t) || []), by]);
  const readCond = (q, by) => {
    if (!q) return;
    arr(q.req).forEach(f => readF(f, by));
    arr(q.not).forEach(f => readF(f, by));
    Object.keys(q.cnt || {}).forEach(k => readC(k, by));
    arr(q.tag).forEach(t => readT(t, by));
    arr(q.notag).forEach(t => readT(t, by));
    for (const w of Object.keys(q.rel || {})) if (!E.PEOPLE[w]) err(`${by}: koşulda bilinmeyen kişi ${w}`);
  };
  const polRefs = [],
    yanRefs = [];

  for (const c of E.CARDS) {
    if (ids.has(c.id)) err(`çift kimlik: ${c.id}`);
    ids.add(c.id);
  }
  for (const c of all) {
    const by = c.id || c.konu;
    if (!E.PEOPLE[c.who]) err(`${by}: bilinmeyen kişi ${c.who}`);
    if (!c.text || c.text.length > 240) err(`${by}: metin boş ya da evraka sığmaz (${c.text?.length})`);
    for (const a of c.alt || []) {
      if (!a.text || a.text.length > 240) err(`${by}: hatırlama metni boş ya da uzun (${a.text?.length})`);
      arr(a.req).forEach(f => readF(f, by));
      readCond(a.if, by);
    }
    arr(c.req).forEach(f => readF(f, by));
    arr(c.not).forEach(f => readF(f, by));
    Object.keys(c.reqCnt || {}).forEach(k => readC(k, by));
    arr(c.reqTag).forEach(t => readT(t, by));
    arr(c.notTag).forEach(t => readT(t, by));
    arr(c.reqPol)
      .concat(arr(c.notPol))
      .forEach(p => polRefs.push([p, by]));
    for (const [w] of Object.entries({ ...c.relMin, ...c.relMax }))
      if (!E.PEOPLE[w]) err(`${by}: ilişki kapısında bilinmeyen kişi ${w}`);
    for (const side of ["L", "R"]) {
      const o = c[side],
        sb = `${by}.${side}`;
      if (!o || !o.t || !Array.isArray(o.e) || o.e.length !== 4) {
        err(`${sb}: hatalı seçenek`);
        continue;
      }
      if (o.t.length > 26) err(`${sb}: "${o.t}" düğmeye sığmaz (${o.t.length})`);
      if (o.e.some(v => !Number.isFinite(v))) err(`${sb}: etki sayı değil`);
      if (o.son && E.ENDINGS && !E.ENDINGS[o.son]) err(`${sb}: böyle bir son yok → ${o.son}`);
      // ceza sonu tek seçimle gelmez: yayın sonundaki (zincirle gelen) evrakta olmalı
      if (o.son && E.ENDINGS?.[o.son]?.tur === "ceza" && !c.chain && !c.crisis)
        err(`${sb}: ceza sonu (${o.son}) yalnız bir yayın sonundaki zincir evrakında olabilir`);
      if (o.anket) {
        const k = o.anket;
        if (!k.ad || k.ad.length > 40) err(`${sb}: defter kaleminin adı boş ya da uzun`);
        if (!Number.isFinite(k.puan) || !k.puan || Math.abs(k.puan) > 4)
          err(`${sb}: defter kalemi -4..4 arası, sıfırdan farklı olmalı`);
      }
      if (o.not && o.not.length > 80) err(`${sb}: hafıza notu uzun (${o.not.length})`);
      // zarlı seçenek: oran düğmede yazılır; iki ucun da haberi olur
      if (o.oy != null && (!c.kampanya || !Number.isFinite(o.oy) || Math.abs(o.oy) > 4))
        err(`${sb}: kesin anket etkisi (oy) yalnız kampanya evrakında, en çok ±4`);
      if (o.zar) {
        const z = o.zar;
        if (!(z.p >= 0.3 && z.p <= 0.8)) err(`${sb}: zar olasılığı 0,3-0,8 arası olmalı (${z.p})`);
        if (o.t.length > 20) err(`${sb}: zarlı seçeneğin düğmesi en çok 20 harf (yanına zar işareti gelir)`);
        for (const [u, x] of [
          ["iyi", z.iyi],
          ["kötü", z.kotu],
        ]) {
          if (!x) {
            err(`${sb}: zarın ${u} ucu yok`);
            continue;
          }
          if (x.e && (x.e.length !== 4 || x.e.some(v => !Number.isFinite(v))))
            err(`${sb}: zarın ${u} ucu etkisi hatalı`);
          if (!x.msg || x.msg.length > 90) err(`${sb}: zarın ${u} ucunun haberi boş ya da uzun (${x.msg?.length})`);
          if (x.oy != null && (!c.kampanya || Math.abs(x.oy) > 9))
            err(`${sb}: zarın anket etkisi yalnız kampanyada, en çok ±9`);
          if (x.kalem && (!x.kalem.ad || Math.abs(x.kalem.puan) > 4)) err(`${sb}: zarın defter kalemi hatalı`);
          arr(x.set).forEach(f => flagW.add(f));
          for (const w of Object.keys(x.rel || {})) if (!E.PEOPLE[w]) err(`${sb}: zarda bilinmeyen kişi ${w}`);
        }
        if (c.kampanya && !(z.iyi?.oy > 0 && z.kotu?.oy < 0))
          err(`${sb}: kampanya zarı iyi ucta anketi artırmalı, kötüde düşürmeli`);
      }
      arr(o.set).forEach(f => flagW.add(f));
      arr(o.clr).forEach(f => flagW.add(f));
      keysOf(o.inc).forEach(k => cntW.add(k));
      keysOf(o.dec).forEach(k => cntW.add(k));
      for (const w of Object.keys(o.rel || {})) if (!E.PEOPLE[w]) err(`${sb}: ilişkide bilinmeyen kişi ${w}`);
      const n = nextOf(o.next);
      if (n) {
        const d = n.in ?? 0;
        if (!(Number.isInteger(d) && d >= 0) && !(Array.isArray(d) && d.length === 2 && d[0] >= 0 && d[1] >= d[0]))
          err(`${sb}: next gecikmesi hatalı`);
        readCond(n.if, sb);
        if (n.else && !n.if) warn(`${sb}: next.else var ama if yok`);
      }
      if (o.pol) {
        const p = o.pol;
        if (!p.id || !p.ad) err(`${sb}: kararın id/ad'ı yok`);
        polIds.add(p.id);
        if (p.e && p.e.length !== 4) err(`${sb}: kararın aylık etkisi dört gösterge değil`);
        arr(p.tags).forEach(t => tagW.add(t));
        for (const y of p.yan || []) {
          if (!(y.p > 0 && y.p <= 0.3)) err(`${sb}: yan etki olasılığı 0-0,3 arası olmalı (${y.p})`);
          if (p.ay && (y.min ?? 3) >= p.ay) err(`${sb}: yan etki karar bittikten sonraya kalıyor`);
          readCond(y.if, sb);
          yanRefs.push([y.card, p.id, sb]);
        }
      }
      arr(o.cut).forEach(p => polRefs.push([p, sb]));
    }
  }

  // Kart bağlantıları
  const links = c =>
    ["L", "R"].flatMap(s => {
      const o = c[s] || {},
        n = nextOf(o.next);
      return [n?.id, n?.else, o.pol?.doneCard, ...(o.pol?.yan || []).map(y => y.card)].filter(Boolean);
    });
  for (const c of all) for (const t of links(c)) if (!ids.has(t)) err(`${c.id || c.konu}: bağlandığı kart yok → ${t}`);
  for (const x of E.SYN) {
    if (!x.id || !x.a || !x.b) err(`SYN: id/a/b eksik ${JSON.stringify(x)}`);
    readT(x.a, "SYN " + x.id);
    readT(x.b, "SYN " + x.id);
    if (x.card && !ids.has(x.card)) err(`SYN ${x.id}: kart yok → ${x.card}`);
    if (x.e && x.e.length !== 4) err(`SYN ${x.id}: etki dört gösterge değil`);
    if (x.msg && !x.ad) err(`SYN ${x.id}: haberin başlığı (ad) yok`);
  }
  if (new Set(E.SYN.map(x => x.id)).size !== E.SYN.length) err("SYN: çift kimlik");
  // göreve başlayışın kararları ve evrakları (gölgeli mazbata, itiraz dilekçesi)
  for (const [k, a] of Object.entries(E.ACILIS || {})) {
    if (a.pol) {
      polIds.add(a.pol.id);
      arr(a.pol.tags).forEach(t => tagW.add(t));
    }
    const n = nextOf(a.next);
    if (n && !ids.has(n.id)) err(`ACILIS ${k}: evrak yok → ${n.id}`);
  }
  if (E.muhurPol) polIds.add(E.muhurPol().id);
  // kampanya turu: her aşamada evrak var; her evrakta biri kesin (oy), öbürü zarlı
  if (E.KAMPANYA) {
    for (const a of [0, 1, 2, 3]) if (!E.KAMPANYA.some(c => c.asama === a)) err(`KAMPANYA: ${a}. aşamada evrak yok`);
    const kid = new Set();
    for (const c of E.KAMPANYA) {
      if (kid.has(c.id) || ids.has(c.id)) err(`KAMPANYA ${c.id}: çift kimlik`);
      kid.add(c.id);
      if (![0, 1, 2, 3].includes(c.asama)) err(`KAMPANYA ${c.id}: aşama 0-3 olmalı`);
      const zl = ["L", "R"].filter(s => c[s]?.zar).length;
      if (zl !== 1 || !["L", "R"].some(s => !c[s]?.zar && c[s]?.oy > 0))
        err(`KAMPANYA ${c.id}: bir seçenek kesin (oy > 0), öbürü zarlı olmalı`);
      for (const s of ["L", "R"])
        if (c[s]?.next || c[s]?.pol || c[s]?.son)
          err(`KAMPANYA ${c.id}.${s}: kampanyada zincir, karar ya da son olmaz`);
    }
  }
  for (const [p, by] of polRefs) if (!polIds.has(p)) err(`${by}: böyle bir karar yok → ${p}`);
  // yan etki evrakı kararı kaldırma yolu sunmalı (biri "kaldır", öbürü "üstüne git")
  for (const [id, p, by] of yanRefs) {
    const y = E.CARD[id];
    if (y && !["L", "R"].some(s => arr(y[s]?.cut).includes(p)))
      warn(`${by}: yan etki evrakı ${id} kararı (${p}) kaldırma seçeneği sunmuyor`);
  }
  // aynı evrakın iki tarafı birden oyunu bitirmesin
  for (const c of all)
    if (c.L?.son && c.R?.son && !c.id?.startsWith("davet")) err(`${c.id}: iki taraf da oyunu bitiriyor`);

  // Ulaşılabilirlik: zincir kartları yalnız bağlantıyla gelir; hiçbir yerden bağlanmayan zincir ölü içeriktir
  const reach = new Set(),
    stack = [...all.filter(c => !c.chain)];
  for (const x of E.SYN) if (x.card && tagW.has(x.a) && tagW.has(x.b)) stack.push(E.CARD[x.card]);
  for (const v of E.VAATLER || []) if (E.CARD[v.kart]) stack.push(E.CARD[v.kart]); // vaat verilince gelir
  for (const a of Object.values(E.ACILIS || {})) if (E.CARD[nextOf(a.next)?.id]) stack.push(E.CARD[nextOf(a.next).id]); // göreve başlarken gelir
  while (stack.length) {
    const c = stack.pop();
    if (!c || reach.has(c.id)) continue;
    reach.add(c.id);
    for (const t of links(c)) if (E.CARD[t]) stack.push(E.CARD[t]);
  }
  for (const c of E.CARDS) if (c.chain && !reach.has(c.id)) err(`${c.id}: zincir kartına hiçbir yerden ulaşılmıyor`);
  // Zincir döngüsü: once olmayan zincirler kendini besleyebilir
  for (const c of E.CARDS) {
    const seen = new Set(),
      st = links(c).map(t => [t, 1]);
    while (st.length) {
      const [t, d] = st.pop();
      if (t === c.id) {
        if (!c.once) warn(`${c.id}: zincir kendine dönüyor`);
        break;
      }
      if (seen.has(t) || d > 8 || !E.CARD[t]) continue;
      seen.add(t);
      links(E.CARD[t]).forEach(u => st.push([u, d + 1]));
    }
  }

  // Seçim beyannamesi: vaatlerin evrakı zincirdir, sözü tutan seçeneği vardır; metinler beyannameye sığar
  const vaatIds = new Set();
  for (const v of E.VAATLER || []) {
    const by = "VAAT " + v.id;
    if (vaatIds.has(v.id)) err(`${by}: çift kimlik`);
    vaatIds.add(v.id);
    if (!v.ad || v.ad.length > 26) err(`${by}: başlık boş ya da uzun (${v.ad?.length})`);
    if (!v.soz || v.soz.length > 110) err(`${by}: söz boş ya da uzun (${v.soz?.length})`);
    if (!(v.guc >= 3 && v.guc <= 15)) err(`${by}: güç 3-15 arası olmalı (${v.guc})`);
    if (v.hemen && (v.hemen.length !== 4 || v.hemen.some(x => !Number.isFinite(x) || Math.abs(x) > 5)))
      err(`${by}: hemen etkisi dört gösterge ve en çok ±5 olmalı`);
    if (!Array.isArray(v.ay) || !(v.ay[0] >= 1 && v.ay[1] >= v.ay[0] && v.ay[1] <= 58))
      err(`${by}: ay aralığı ilk dönemin içinde olmalı`);
    const c = E.CARD[v.kart];
    if (!c) err(`${by}: evrak yok → ${v.kart}`);
    else {
      if (!c.chain) err(`${by}: evrakı (${v.kart}) zincir olmalı; yalnız vaat verilince gelir`);
      if (!["L", "R"].some(s => keysOf(c[s]?.dec).includes("vaat")))
        warn(`${by}: evrakında sözü tutan (dec vaat) seçenek yok`);
    }
    flagW.add("vaat_" + v.id);
    if (v.set) flagW.add(v.set);
  }

  // Sonlar ve miras: uzunluklar, kişiler; miras koşulları da bayrak/sayaç okur
  for (const [k, x] of Object.entries(E.ENDINGS || {})) {
    if (!E.PEOPLE[x.who]) err(`son ${k}: bilinmeyen kişi ${x.who}`);
    if (!x.text || x.text.length > 240) err(`son ${k}: metin boş ya da evraka sığmaz (${x.text?.length})`);
    if (!x.manset || x.manset.length > 32) err(`son ${k}: manşet boş ya da uzun (${x.manset?.length})`);
    if (!x.spot || x.spot.length > 170) err(`son ${k}: spot boş ya da uzun (${x.spot?.length})`);
    if (!x.kisa || x.kisa.length > 30) err(`son ${k}: kısa ad boş ya da uzun (${x.kisa?.length})`);
    for (const t of x.btn || []) if (t.length > 26) err(`son ${k}: "${t}" düğmeye sığmaz`);
  }
  const sonlar = new Set(Object.keys(E.ENDINGS || {}));
  (E.MIRAS || []).forEach((m, i) => {
    const by = `MIRAS[${i}]`;
    if (!m.text || m.text.length > 200) err(`${by}: metin boş ya da uzun (${m.text?.length})`);
    if (!m.if || !Object.keys(m.if).length) err(`${by}: koşulsuz miras her oyunda çıkar`);
    readCond(m.if, by);
    for (const k of arr(m.son)) if (!sonlar.has(k)) err(`${by}: böyle bir son yok → ${k}`);
    for (const f of FACTS)
      if (f.re.test(m.text) && !(f.flag && arr(m.if?.req).includes(f.flag)))
        err(`${by}: metin "${f.ad}" olayını anıyor ama koşulu o olayın bayrağını istemiyor`);
  });

  // Bağlam: olayı anan metin olaysız gelemez (FACTS)
  const needs = (c, a) => [...arr(c.req), ...arr(a?.req), ...arr(a?.if?.req)];
  for (const c of E.CARDS) {
    const texts = [[c.text, null], ...(c.alt || []).map(a => [a.text, a])];
    for (const [t, a] of texts)
      for (const f of FACTS) {
        if (!f.re.test(t) || f.ok.includes(c.id)) continue;
        if (f.flag && needs(c, a).includes(f.flag)) continue;
        err(
          `${c.id}${a ? " (varyant)" : ""}: metin "${f.ad}" olayını anıyor ama o olay olmadan da gelebilir${f.flag ? ` (bayrak: ${f.flag})` : ""}`,
        );
      }
  }

  // Durum anahtarları: okunup hiç yazılmayan hata, yazılıp hiç okunmayan uyarı
  for (const [f, by] of flagR)
    if (!flagW.has(f)) err(`bayrak "${f}" okunuyor ama hiçbir seçenek koymuyor (${by.join(", ")})`);
  for (const f of flagW)
    if (!flagR.has(f) && !f.startsWith("vaat_")) warn(`bayrak "${f}" konuyor ama hiçbir yer okumuyor`);
  for (const [k, by] of cntR)
    if (!cntW.has(k)) err(`sayaç "${k}" okunuyor ama hiçbir seçenek artırmıyor (${by.join(", ")})`);
  for (const k of cntW) if (!cntR.has(k) && !ENGINE_CNT.has(k)) warn(`sayaç "${k}" artıyor ama hiçbir yer okumuyor`);
  for (const [t, by] of tagR)
    if (!tagW.has(t)) err(`etiket "${t}" aranıyor ama hiçbir karar taşımıyor (${by.join(", ")})`);
  for (const t of Object.keys(E.HAVA || {})) readT(t, "HAVA"); // motor havaları etiketle okur
  for (const t of tagW) if (!tagR.has(t)) warn(`etiket "${t}" taşınıyor ama hiçbir yer aramıyor`);
  return { errors, warnings };
}
