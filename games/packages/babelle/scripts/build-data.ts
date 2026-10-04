import { readFile, writeFile } from "node:fs/promises";
import type { Concept, Language, PublicData, ServerData, UiLanguage } from "../src/types.ts";
import { UI_LANGUAGES, WITHDRAWN } from "../src/types.ts";

/**
 * Builds babelle's data from NorthEuraLex (Dellert et al. 2020, CC BY 4.0;
 * fetched by fetch-source.ts) and Tabler icons (MIT).
 *
 *  - data/public.json: concepts (label + icon) and language names. Shipped.
 *  - data/server.json: every language's words, family and location. Server only:
 *    with it in the page, the day's language could be looked up from its words.
 */

const SOURCE = new URL("../source/", import.meta.url);
const ICONS = new URL("../node_modules/@tabler/icons/icons/outline/", import.meta.url);

/** NorthEuraLex concept name → Tabler icon. One picture per idea, none shared. */
const CONCEPTS: Record<string, string> = {
  tree: "tree", water: "droplet", sun: "sun", moon: "moon", star: "star", fire: "flame",
  mountain: "mountain", rain: "cloud-rain", snow: "snowflake", cloud: "cloud", wind: "wind",
  fish: "fish", bird: "feather", dog: "dog", cat: "cat", horse: "horse", pig: "pig", egg: "egg",
  hand: "hand-stop", eye: "eye", ear: "ear", tooth: "dental", heart: "heart", bone: "bone",
  leaf: "leaf", flower: "flower", apple: "apple", bread: "bread", milk: "milk", salt: "salt",
  house: "home", door: "door", book: "book", boat: "sailboat", road: "road",
  bridge: "building-bridge", bed: "bed", chair: "armchair", window: "window", needle: "needle",
  mushroom: "mushroom", butterfly: "butterfly", mouse: "mouse", spider: "spider",
  island: "beach", money: "coin", shoe: "shoe", shirt: "shirt", cup: "cup", spoon: "tools-kitchen",
  table: "table", sea: "ripple", forest: "trees", wood: "wood", seed: "seedling", king: "crown",
  doctor: "stethoscope", letter: "mail", sleep: "zzz", run: "run", swim: "swimming",
  write: "pencil", sing: "music", laugh: "mood-happy", smoke: "smoking",
};

/** NorthEuraLex language → BCP 47 code, for ICU's names in each interface language. */
const CODES: Record<string, string> = {
  ekk: "et", pes: "fa", arb: "ar", cmn: "zh", khk: "mn", azj: "az", uzn: "uz", pbu: "ps",
  nor: "nb", sqi: "sq", kmr: "ku", hye: "hy", ell: "el", ron: "ro", ces: "cs", slk: "sk",
  slv: "sl", hrv: "hr", bul: "bg", pol: "pl", ukr: "uk", bel: "be", rus: "ru", lit: "lt",
  lav: "lv", isl: "is", swe: "sv", dan: "da", deu: "de", nld: "nl", eng: "en", gle: "ga",
  cym: "cy", bre: "br", lat: "la", fra: "fr", cat: "ca", spa: "es", por: "pt", ita: "it",
  fin: "fi", hun: "hu", tur: "tr", kaz: "kk", bak: "ba", tat: "tt", chv: "cv", kat: "ka",
  eus: "eu", kor: "ko", jpn: "ja", heb: "he", ben: "bn", hin: "hi", oss: "os", tam: "ta",
  tel: "te", kan: "kn", mal: "ml", che: "ce", ava: "av", abk: "ab", sme: "se", kal: "kl",
  mhr: "chm", kpv: "kv",
};

/**
 * Labels where NorthEuraLex's lexicographic pick reads oddly on a card
 * ("it" for dog, "kundura" for shoe) or clashes with another card ("ağaç"
 * for both tree and wood).
 */
const LABEL_FIXES: Record<string, Partial<Record<UiLanguage, string>>> = {
  dog: { tr: "köpek" },
  wind: { tr: "rüzgâr" },
  shoe: { tr: "ayakkabı" },
  forest: { tr: "orman" },
  wood: { tr: "odun", ru: "дрова", es: "leña" },
  seed: { tr: "tohum", de: "Samen", es: "semilla" },
  doctor: { tr: "doktor" },
  hand: { ru: "рука" },
  sing: { tr: "şarkı söylemek" },
  chair: { tr: "sandalye" },
  bed: { ru: "кровать" },
  mountain: { es: "montaña" },
  boat: { es: "barca" },
  road: { es: "camino", ru: "дорога" },
  bird: { es: "pájaro" },
  cup: { es: "taza" },
};

/**
 * The country each language is chiefly spoken in, by hand: nearest-centroid
 * guesses put Russian in Estonia and Kannada in Sri Lanka. Latin goes to
 * the one state that still keeps it official.
 */
const HOME: Record<string, string> = {
  fin: "FI", krl: "RU", ekk: "EE", sma: "NO", smj: "SE", sme: "NO", smn: "FI", sms: "FI",
  mhr: "RU", mdf: "RU", myv: "RU", udm: "RU", koi: "RU", kpv: "RU", hun: "HU", sel: "RU",
  ben: "BD", hin: "IN", pbu: "AF", pes: "IR", kmr: "TR", oss: "RU", hye: "AM", ell: "GR",
  sqi: "AL", bul: "BG", hrv: "HR", slv: "SI", slk: "SK", ces: "CZ", pol: "PL", ukr: "UA",
  bel: "BY", rus: "RU", lit: "LT", lav: "LV", isl: "IS", nor: "NO", swe: "SE", dan: "DK",
  deu: "DE", nld: "NL", eng: "GB", gle: "IE", cym: "GB", bre: "FR", lat: "VA", fra: "FR",
  cat: "ES", spa: "ES", por: "PT", ita: "IT", ron: "RO", tur: "TR", azj: "AZ", uzn: "UZ",
  kaz: "KZ", bak: "RU", tat: "RU", sah: "RU", chv: "RU", khk: "MN", bua: "RU", xal: "RU",
  mnc: "CN", ain: "JP", kor: "KR", jpn: "JP", ale: "US", kal: "GL", kan: "IN", mal: "IN",
  tam: "IN", tel: "IN", kat: "GE", eus: "ES", abk: "GE", ady: "RU", ava: "RU", lez: "RU",
  dar: "RU", che: "RU", arb: "SA", heb: "IL", cmn: "CN",
};

/**
 * NorthEuraLex writes some languages with dictionary marks nobody uses day
 * to day: Slovene tone accents (okó), Italian stress (àlbero), Catalan
 * macrons (āigua), Cyrillic stress (шинча́). Cards show the everyday spelling.
 */
const strip = (word: string, marks: RegExp): string => word.normalize("NFD").replace(marks, "").normalize("NFC");
const SPELLING: Record<string, (word: string) => string> = {
  slv: (w) => strip(w, /[\u0300\u0301\u0302\u0304\u030F\u0311]/g),
  cat: (w) => strip(w, /\u0304/g),
  mhr: (w) => strip(w, /\u0301/g),
  mdf: (w) => strip(w, /\u0301/g),
  ady: (w) => strip(w, /\u0301/g),
  // Italian writes an accent only on a final vowel: città, perché.
  ita: (w) => {
    const d = w.normalize("NFD");
    const last = d.search(/[\u0300\u0301][^\u0300\u0301]*$/);
    const isFinal = last !== -1 && last === d.length - 1;
    return (isFinal ? d.slice(0, -1).replace(/[\u0300\u0301]/g, "") + d.slice(-1) : d.replace(/[\u0300\u0301]/g, "")).normalize("NFC");
  },
};

/** Entries in NorthEuraLex that are plainly not the everyday word. */
const FORM_FIXES: Record<string, Record<string, string>> = {
  hin: { wind: "हवा", water: "पानी" },
};

/** Where the interface languages' own words come from in NorthEuraLex. */
const LABEL_SOURCE: Record<UiLanguage, string> = { en: "eng", tr: "tur", de: "deu", ru: "rus", es: "spa" };

function csv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
}

/** Inner markup of a Tabler outline icon, minus its invisible bounding path. */
async function icon(name: string): Promise<string> {
  const svg = await readFile(new URL(`${name}.svg`, ICONS), "utf8");
  const inner = svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));
  return inner
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const read = async (file: string) => csv(await readFile(new URL(file, SOURCE), "utf8"));
const [languageRows, parameterRows, formRows] = await Promise.all([
  read("languages.csv"),
  read("parameters.csv"),
  read("forms.csv"),
]);

const conceptIds = new Map<string, string>();
for (const p of parameterRows) if (CONCEPTS[p.Name] && !conceptIds.has(p.Name)) conceptIds.set(p.Name, p.ID);

/** First form per language and concept: the most common word, by NorthEuraLex's ordering. */
const forms: ServerData["forms"] = {};
const wanted = new Map([...conceptIds].map(([name, id]) => [id, name]));
for (const f of formRows) {
  const concept = wanted.get(f.Parameter_ID);
  if (!concept || !f.Value) continue;
  const byConcept = (forms[f.Language_ID] ??= {});
  const spell = SPELLING[f.Language_ID];
  byConcept[concept] ??= spell ? spell(f.Value.trim()) : f.Value.trim();
}

for (const [language, fixes] of Object.entries(FORM_FIXES)) Object.assign((forms[language] ??= {}), fixes);
// The interface languages' cards were checked by hand; their words in the game match them.
for (const [ui, source] of Object.entries(LABEL_SOURCE)) {
  for (const [concept, fixes] of Object.entries(LABEL_FIXES)) {
    const fixed = fixes[ui as UiLanguage];
    if (fixed && forms[source]?.[concept]) forms[source][concept] = fixed;
  }
}

const languages: Language[] = [];
for (const row of languageRows) {
  const code = CODES[row.ID] ?? row.ID;
  const names = {} as Record<UiLanguage, string>;
  let named = true;
  for (const ui of UI_LANGUAGES) {
    const name = new Intl.DisplayNames([ui], { type: "language" }).of(code);
    if (!name || name === code) named = false;
    names[ui] = name ? name.charAt(0).toLocaleUpperCase(ui) + name.slice(1) : row.Name;
  }
  // Without a name in every interface language, a language can't be guessed fairly.
  if (!named) continue;
  // A language needs most of the pictured words to carry a day's questions.
  if (Object.keys(forms[row.ID] ?? {}).length < Object.keys(CONCEPTS).length * 0.8) continue;
  languages.push({
    id: row.ID,
    names,
    family: row.Family,
    subfamily: row.Subfamily,
    lat: Number(row.Latitude),
    lon: Number(row.Longitude),
    country: HOME[row.ID] ?? "",
  });
}

const concepts: Concept[] = [];
for (const [name, iconName] of Object.entries(CONCEPTS)) {
  if (!conceptIds.has(name)) continue;
  const labels = {} as Record<UiLanguage, string>;
  for (const ui of UI_LANGUAGES) {
    labels[ui] = LABEL_FIXES[name]?.[ui] ?? forms[LABEL_SOURCE[ui]]?.[name] ?? name;
  }
  labels.en = name;
  concepts.push({ id: name, labels, icon: await icon(iconName) });
}

const homeless = languages.filter((l) => !l.country).map((l) => l.id);
if (homeless.length) throw new Error(`no home country for ${homeless.join(", ")}`);

const kept = new Set(languages.map((l) => l.id));
const serverForms = Object.fromEntries(Object.entries(forms).filter(([id]) => kept.has(id)));
const publicData: PublicData = {
  concepts,
  languages: languages.filter((l) => !WITHDRAWN.has(l.id)).map(({ id, names }) => ({ id, names })),
};
const serverData: ServerData = { languages, forms: serverForms };

await writeFile(new URL("../data/public.json", import.meta.url), JSON.stringify(publicData));
await writeFile(new URL("../data/server.json", import.meta.url), JSON.stringify(serverData));
console.log(`concepts: ${concepts.length}, languages: ${languages.length}`);
