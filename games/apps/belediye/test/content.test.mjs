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
  );
  E.SYN.push({ id: "t_syn", a: "x", b: "y", card: "yok_kart" });
  E.CARD = Object.fromEntries(E.CARDS.map(c => [c.id, c]));
  const text = lintContent(E).errors.join("\n");
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
  ])
    assert.ok(text.includes(want), `yakalanmadı: ${want}\n--- bulunanlar ---\n${text}`);
});
