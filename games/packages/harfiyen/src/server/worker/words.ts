import { Lexicon } from "../../lexicon.ts";

/**
 * The dictionary inside the Worker. The entry module hands over the word
 * list's text (each build imports it its own way); it becomes a DAWG the
 * first time a room needs it — never at start-up, which the Worker's
 * router shares and must keep short.
 */
let text = "";
let built: Lexicon | null = null;

export function provideWords(words: string): void {
  text = words;
}

export function lexicon(): Lexicon {
  if (!built) {
    if (!text) throw new Error("harfiyen: the word list was never provided");
    built = Lexicon.parse(text);
  }
  return built;
}
