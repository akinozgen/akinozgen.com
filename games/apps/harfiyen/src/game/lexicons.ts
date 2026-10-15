import { Lexicon, type Level } from "@harfiyen/engine";
import fullUrl from "@harfiyen/engine/data/kelimeler.txt?url";
import easyUrl from "@harfiyen/engine/data/kolay.txt?url";
import commonUrl from "@harfiyen/engine/data/yaygin.txt?url";
import hardUrl from "@harfiyen/engine/data/zor.txt?url";

/** Every word a player may put down, and the everyday ones the computer plays at each level. */
export interface Lexicons {
  full: Lexicon;
  /** The hard level's wider vocabulary. */
  wide: Lexicon;
  /** Everyday words: the medium level's. */
  common: Lexicon;
  easy: Lexicon;
}

/** The words the computer knows at a level: more of them the harder it is. */
export const botWords = (lexicons: Lexicons, level: Level): Lexicon =>
  level === "kolay" ? lexicons.easy : level === "orta" ? lexicons.common : lexicons.wide;

async function fetchList(url: string): Promise<Lexicon> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`word list answered ${response.status}`);
  return Lexicon.parse(await response.text());
}

let loading: Promise<Lexicons> | null = null;

/** All four lists, fetched and built once. */
export function loadLexicons(): Promise<Lexicons> {
  loading ??= Promise.all([fetchList(fullUrl), fetchList(hardUrl), fetchList(commonUrl), fetchList(easyUrl)]).then(
    ([full, wide, common, easy]) => ({ full, wide, common, easy }),
  );
  loading.catch(() => (loading = null));
  return loading;
}
