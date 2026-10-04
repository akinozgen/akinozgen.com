/** Languages the game's interface speaks — not the languages being guessed. */
export const UI_LANGUAGES = ["en", "tr", "de", "ru", "es"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** A thing with a picture: tree, water, bridge. */
export interface Concept {
  id: string;
  /** The word for it in each interface language. */
  labels: Record<UiLanguage, string>;
  /** Inner SVG markup of its Tabler icon (24×24, stroke-based). */
  icon: string;
}

/** What the browser knows about a language: its name, nothing else. */
export interface PublicLanguage {
  id: string;
  names: Record<UiLanguage, string>;
}

/** What the server knows about a language. */
export interface Language extends PublicLanguage {
  family: string;
  subfamily: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2 of the country it is chiefly spoken in. */
  country: string;
}

export interface PublicData {
  concepts: Concept[];
  languages: PublicLanguage[];
}

export interface ServerData {
  languages: Language[];
  /** forms[language][concept] = the word, in the language's own script. */
  forms: Record<string, Record<string, string>>;
}

/**
 * Languages taken out of the game. They stay in the word lists so every
 * other day's shuffles come out as before; they are skipped wherever one
 * would be shown, and the browser's list no longer has them.
 */
export const WITHDRAWN: ReadonlySet<string> = new Set(["kmr"]);

/** Questions before the final guess. */
export const QUESTIONS = 5;
/** Tries at naming the language. */
export const FINAL_TRIES = 3;
