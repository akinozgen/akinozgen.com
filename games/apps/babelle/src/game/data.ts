import type { Concept, PublicData, PublicLanguage, UiLanguage } from "@babelle/data/client";
import data from "@babelle/data/data/public.json";

/**
 * What the page knows: pictured concepts and language names. Which language
 * is today's, and every word in it, stays on the server.
 */
const publicData = data as unknown as PublicData;

export const CONCEPTS: readonly Concept[] = publicData.concepts;
export const LANGUAGES: readonly PublicLanguage[] = publicData.languages;

const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));
const languageById = new Map(LANGUAGES.map((l) => [l.id, l]));

export function concept(id: string): Concept {
  const found = conceptById.get(id);
  if (!found) throw new Error(`unknown concept: ${id}`);
  return found;
}

export function language(id: string): PublicLanguage {
  const found = languageById.get(id);
  if (!found) throw new Error(`unknown language: ${id}`);
  return found;
}

/** Language families as NorthEuraLex names them, in each interface language. */
const FAMILIES: Record<string, Partial<Record<UiLanguage, string>>> = {
  "Indo-European": { tr: "Hint-Avrupa", de: "Indogermanisch", ru: "Индоевропейская", es: "Indoeuropea" },
  Uralic: { tr: "Ural", de: "Uralisch", ru: "Уральская", es: "Urálica" },
  Turkic: { tr: "Türk", de: "Turksprachen", ru: "Тюркская", es: "Túrquica" },
  "Mongolic-Khitan": { en: "Mongolic", tr: "Moğol", de: "Mongolisch", ru: "Монгольская", es: "Mongólica" },
  Tungusic: { tr: "Tunguz", de: "Tungusisch", ru: "Тунгусо-маньчжурская", es: "Tungús" },
  Ainu: { tr: "Ainu", de: "Ainu", ru: "Айнская", es: "Ainu" },
  Koreanic: { tr: "Kore", de: "Koreanisch", ru: "Корейская", es: "Coreánica" },
  Japonic: { tr: "Japon", de: "Japonisch", ru: "Японская", es: "Japónica" },
  "Eskimo-Aleut": { tr: "Eskimo-Aleut", de: "Eskimo-Aleutisch", ru: "Эскимосско-алеутская", es: "Esquimo-aleutiana" },
  Dravidian: { tr: "Dravid", de: "Dravidisch", ru: "Дравидийская", es: "Drávida" },
  Kartvelian: { tr: "Kartvel", de: "Kartwelisch", ru: "Картвельская", es: "Kartveliana" },
  Basque: { tr: "Bask (yalıtık)", de: "Baskisch (isoliert)", ru: "Баскский (изолят)", es: "Vasco (aislada)", en: "Basque (isolate)" },
  "Abkhaz-Adyge": { tr: "Kuzeybatı Kafkas", de: "Nordwestkaukasisch", ru: "Абхазо-адыгская", es: "Caucásica noroccidental", en: "Northwest Caucasian" },
  "Nakh-Daghestanian": { tr: "Kuzeydoğu Kafkas", de: "Nordostkaukasisch", ru: "Нахско-дагестанская", es: "Caucásica nororiental", en: "Northeast Caucasian" },
  "Afro-Asiatic": { tr: "Afro-Asya", de: "Afroasiatisch", ru: "Афразийская", es: "Afroasiática" },
  "Sino-Tibetan": { tr: "Çin-Tibet", de: "Sinotibetisch", ru: "Сино-тибетская", es: "Sinotibetana" },
};

export function familyName(family: string, ui: UiLanguage): string {
  return FAMILIES[family]?.[ui] ?? family;
}

/** Lower-cased, accent-free, so "ingilizce", "İngilizce" and "INGILIZCE" all match. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[’'`.-]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}
