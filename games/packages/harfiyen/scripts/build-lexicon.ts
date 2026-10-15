/**
 * Writes the word lists the game ships (see data/README.md for where they come from):
 *
 *   data/kelimeler.txt  every word a player may put down
 *   data/zor.txt        a wider everyday vocabulary, most common first: the hard computer's
 *   data/yaygin.txt     everyday words, most common first: the medium computer's
 *   data/kolay.txt      the commonest of those: what the easy computer plays
 *
 *   node scripts/build-lexicon.ts --words gts.txt --countries tr.json \
 *     --wide common_15k.txt --common common_10k.txt --easy common_5k.txt --rank lemma_rank.tsv
 *
 * `--words` holds one TDK headword per line; `--countries` is
 * i18n-iso-countries' Turkish file, of which one-word names count, as they do
 * in the Turkish game. Circumflexes fold (kâr → kar), and anything that isn't 2–15
 * Turkish letters is dropped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decode, encode } from "../src/alphabet.ts";
import { compareLetters } from "../src/lexicon.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) throw new Error(`missing --${name}; see the comment at the top`);
  return process.argv[at + 1];
};

/** Three short words the Turkish game has long accepted that the dictionary lacks. */
const EXTRAS = ["go", "jak", "pi"];
/** Abbreviations, which don't count. */
const NOT_COUNTRIES = new Set(["abd"]);

/**
 * Real words a player may play, but the computer shouldn't: letter and note
 * names, archaisms and names, and short words whose frequency comes from
 * something else (English in subtitles, a misspelling, a first name). Picked
 * by hand from the two- and three-letter words of the everyday list.
 */
const BOT_SKIP = new Set(
  `be is la le yo do ge he si me se ke im ar re as fa es nü ta tu ti hu ce us fe pe je ur te ze om dü ut od öf öç uz
  jul rop ley mus mim cem lal ırz sof dem tav car dok bre run ace ski org aut bop cup pot gey sör kip rey pir şer gut
  hac aks ser mir küt gem ole kam hür kah faz per put lot bet ark sek nur ast som mis def dun sam ora hit sut nas dav
  kin pet alo raf nam kel ila ram leh men tin har zan iti ela ari koz ask nar mah ret lor tor asa oha tüh ful muş had
  bor sav vah zen pos çar cop eda aza lav tay bom kıt ası güz uca tal raz bap vız zum fer lim gön aba zon güm lak lok
  giz nah yen pak eko sit lam çat akı puf tiz çil gez çıt nesi yakin zenci alp san kamil
  adem mira batman sami neva baks abis abuk celi feri sülfür cebe zili bağı
  geçmişte ayakta başta onlardan çoktan gibisi hiçbiri kapıda seferi aynısı kuralı çeki tekrardan dolusu bini
  cehennemi birçoğu koçu havadan kaçta sabahtan kaçı yarınki sonda dünden yukarıdan belası birkaçı kafadan barda
  akşamdan meydanda bakımdan ağızdan geceki demiri şurası öylesi cümlesi bazısı kimisi uğrunda üstten öbürü
  pratikte aralıkta fonda sabahki akşamki evvelki yarda askıda yatı sağı saki yakı
  çe şe nev açıt erg mesh ate dink mül tab yek ır iye ide böke utku ece kulun kana enin`.split(/\s+/),
);

/** Fine for a player, not what a friendly opponent should put down: sex, drugs, suicide, terror. */
const BOT_TACT = new Set(
  `seks seksi seksüel biseksüel cinsel cinsellik sevişmek tecavüz porno pornografi penis vajina orgazm erotik
  şehvet şehvetli azgın fahişe genelev çıplaklık kokain eroin esrar esrarlı uyuşturucu intihar terörist terörizm`.split(/\s+/),
);

/** Plurals the dictionary lists as headwords of their own (kuşlar, böcekler) read as inflections; not these. */
const REAL_PLURALS = new Set(["dolar"]);

/** Letters that lose their marks on a keyboard without them. */
const MARKED: Record<string, string> = { i: "ı", s: "ş", c: "ç", g: "ğ", o: "ö", u: "ü" };

const clean = (word: string): string | null => {
  const letters = encode(word.trim());
  return letters && letters.length >= 2 && letters.length <= 15 ? decode(letters) : null;
};
const lines = (path: string): string[] => readFileSync(path, "utf8").split("\n");
const sortTurkish = (words: Iterable<string>): string[] =>
  [...words].map((word) => encode(word)!).sort(compareLetters).map(decode);

const all = new Set<string>();
for (const line of lines(arg("words"))) {
  const word = clean(line);
  if (word) all.add(word);
}
const countries = JSON.parse(readFileSync(arg("countries"), "utf8")) as { countries: Record<string, string | string[]> };
for (const name of Object.values(countries.countries).flat()) {
  if (/[\s\-().,'"’]/.test(name)) continue;
  const word = clean(name);
  if (word && !NOT_COUNTRIES.has(word)) all.add(word);
}
for (const word of EXTRAS) all.add(word);

const rank = new Map<string, number>();
for (const line of lines(arg("rank"))) {
  const [word, a, b] = line.split("\t");
  if (word && a && b) rank.set(word, Math.max(Number(a), Number(b)));
}
const ranked = (path: string): string[] => {
  const words = lines(path)
    .map(clean)
    .filter((word): word is string => word !== null && all.has(word));
  return [...new Set(words)].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
};
/**
 * Whether a word's count is probably someone else's, typed without Turkish
 * letters: "yakin" for "yakın", "aksam" for "akşam". It is if putting the
 * marks back gives a commoner word and the word itself isn't very common.
 */
function misspelt(word: string): boolean {
  const own = rank.get(word) ?? Infinity;
  if (own <= 1500) return false;
  const spots = [...word].flatMap((char, i) => (MARKED[char] ? [i] : []));
  if (spots.length > 5) return false;
  for (let mask = 1; mask < 1 << spots.length; mask++) {
    const chars = [...word];
    spots.forEach((at, bit) => {
      if (mask & (1 << bit)) chars[at] = MARKED[chars[at]];
    });
    const marked = chars.join("");
    if (all.has(marked) && (rank.get(marked) ?? Infinity) < own) return true;
  }
  return false;
}

/** A plural whose singular is a word too: the computer shouldn't seem to inflect. */
const plural = (word: string): boolean =>
  /l[ae]r$/.test(word) && all.has(word.slice(0, -3)) && !REAL_PLURALS.has(word);

const forBot = (words: string[]): string[] =>
  words.filter((word) => !BOT_SKIP.has(word) && !BOT_TACT.has(word) && !misspelt(word) && !plural(word));
const wide = forBot(ranked(arg("wide")));
const common = forBot(ranked(arg("common")));
const easy = forBot(ranked(arg("easy")));

writeFileSync(join(here, "../data/kelimeler.txt"), `${sortTurkish(all).join("\n")}\n`);
writeFileSync(join(here, "../data/zor.txt"), `${wide.join("\n")}\n`);
writeFileSync(join(here, "../data/yaygin.txt"), `${common.join("\n")}\n`);
writeFileSync(join(here, "../data/kolay.txt"), `${easy.join("\n")}\n`);
console.log(`kelimeler.txt ${all.size} · zor.txt ${wide.length} · yaygin.txt ${common.length} · kolay.txt ${easy.length}`);
