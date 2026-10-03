// Seslendirilecek sabit metinleri dışa verir: evraklar (hatırlama metinleri ~i ile), kampanya, talepler, davetler,
// tanıtım, krizler ve sonlar. İçinde {yer tutucu} olan ya da Tekir'in metinleri atlanır.
// node tools/ses/metinler.mjs > ~/tts/belediye-ses/metinler.json
import { motor } from "../lib/sayfa.mjs";
const E = await motor(),
  out = [];
const ekle = (id, who, text) => {
  if (text && who !== "tekir" && !/[{}]/.test(text)) out.push({ id, who, text });
};
for (const c of [...E.CARDS, ...E.KAMPANYA, ...Object.values(E.TALEP).flat(), ...E.DAVET, ...E.INTRO]) {
  ekle(c.id, c.who, c.text);
  (c.alt || []).forEach((a, i) => ekle(`${c.id}~${i}`, c.who, a.text));
}
for (const [k, c] of Object.entries(E.CRISES)) ekle("kriz_" + k, c.who, c.text);
for (const [k, c] of Object.entries(E.ENDINGS)) ekle("son_" + k, c.who, c.text);
console.log(JSON.stringify(out));
