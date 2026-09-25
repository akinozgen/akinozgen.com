// İçerik grafı denetimi: gerçek içerik temiz olmalı, bozuk içerik yakalanmalı
import { test } from "vitest";
import assert from "node:assert/strict";
import { lintContent } from "../tools/lint.mjs";
import { yukle } from "./yukle.mjs";

const load = () => yukle("cards", "engine");

test("gerçek içerikte bağlantı, bayrak, sayaç ve etiket hatası yok", async () => {
  const r = lintContent(await load());
  assert.deepEqual(r.errors, []);
  if (r.warnings.length) console.log("uyarılar:\n  " + r.warnings.join("\n  "));
});

test("denetim bozuk içeriği yakalıyor", async () => {
  const E = await load();
  const card = (id, extra = {}, L = {}, R = {}) => ({
    id,
    who: "muhtar",
    konu: "Deneme",
    text: "Deneme metni.",
    L: { t: "Sol", e: [0, 0, 0, 0], ...L },
    R: { t: "Sağ", e: [0, 0, 0, 0], ...R },
    ...extra,
  });
  E.CARDS.push(
    card("t_yetim", { chain: true }), // hiçbir yerden bağlanmıyor
    card("t_bayrak", { req: ["hic_konmayan"] }), // okunan ama yazılmayan bayrak
    card("t_kayip", {}, { next: { id: "yok_boyle_kart", in: [2, 4] } }), // olmayan karta bağlantı
    card("t_uzun", {}, { t: "Bu etiket düğmeye asla sığmayacak kadar uzun" }),
    card("t_etiket", { reqTag: "kimse_tasimiyor" }),
    card("t_sayac", { reqCnt: { hayalet: 2 } }),
    card("t_gecikme", {}, { next: { id: "asfalt", in: [5, 2] } }), // ters aralık
    { ...card("t_heykel"), text: "Dev kavun heykelimizin önünde kuyruk var başkanım." }, // olay yaşanmadan anılıyor
    card("t_yan", {}, { pol: { id: "t_pol", ad: "Deneme", yan: [{ card: "yan_yok", p: 0.9 }] } }), // olmayan yan etki, fazla olasılık
    card("t_yanzincir", { chain: true }),
    card("t_yanli", {}, { pol: { id: "t_pol2", ad: "Deneme 2", ay: 6, yan: [{ card: "t_yanzincir", p: 0.1 }] } }),
    card("t_sonsuz", {}, { son: "boyle_son_yok" }),
    card("t_ceza", {}, { son: "t_cezason" }), // ceza sonu yay sonunda değil
    card("t_kalem", {}, { anket: { ad: "Aşırı skandal", puan: -9 } }),
  );
  E.ENDINGS.t_cezason = { who: "fikret", konu: "x", text: "x", manset: "X", spot: "x", kisa: "x", tur: "ceza" };
  E.ENDINGS.t_uzunson = {
    who: "fikret",
    konu: "x",
    text: "x",
    manset: "BU MANŞET GAZETENİN SAYFASINA HİÇ SIĞMAZ",
    spot: "x",
    kisa: "x",
  };
  E.MIRAS.push({ if: {}, text: "Koşulsuz." }, { if: { req: "hic_yok" }, text: "Dev kavun heykeli ile anılacak." });
  E.SYN.push({ id: "t_syn", a: "x", b: "y", card: "yok_kart" });
  E.CARD = Object.fromEntries(E.CARDS.map(c => [c.id, c]));
  const text = lintContent(E).errors.join("\n");
  assert.ok(!text.includes("t_yanzincir: zincir"), "yan etkiyle bağlanan zincir kartı ulaşılabilir sayılmalı");
  for (const want of [
    "t_yetim: zincir kartına hiçbir yerden ulaşılmıyor",
    `bayrak "hic_konmayan"`,
    "yok_boyle_kart",
    "t_uzun.L",
    `etiket "kimse_tasimiyor"`,
    `sayaç "hayalet"`,
    "t_gecikme.L: next gecikmesi hatalı",
    "SYN t_syn: kart yok",
    `t_heykel: metin "dev kavun heykeli"`,
    "t_yan: bağlandığı kart yok → yan_yok",
    "t_yan.L: yan etki olasılığı",
    "t_ceza.L: ceza sonu",
    "t_kalem.L: defter kalemi",
    "t_sonsuz.L: böyle bir son yok",
    "son t_uzunson: manşet",
    "MIRAS[0]: koşulsuz",
    `MIRAS[1]: metin "dev kavun heykeli"`,
    `bayrak "hic_yok"`,
  ])
    assert.ok(text.includes(want), `yakalanmadı: ${want}\n--- bulunanlar ---\n${text}`);
});
