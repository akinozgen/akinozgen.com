import type { Country } from "@vexle/data/client";
import data from "@vexle/data/data/countries.json";

/** Every flag in the game, by name. Which one is today's is the server's secret. */
export const COUNTRIES = data as Country[];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function country(code: string): Country {
  const found = byCode.get(code);
  if (!found) throw new Error(`unknown country: ${code}`);
  return found;
}

/** Lower-cased, accent-free, so "turkiye", "Türkiye" and "TÜRKİYE" all match. */
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
