import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import countries from "i18n-iso-countries";
import sharp from "sharp";
import geo from "../../geo/data/geo.json" with { type: "json" };
import answers from "../data/answers.json" with { type: "json" };
import { COLUMNS, type Country, LANGUAGES, ROWS, TILE_H, TILE_W } from "../src/types.ts";

/**
 * Builds vexle's data from two sources:
 *
 *  - travelle's regions, for a centroid to measure distances from;
 *  - the platform's Intl.DisplayNames, for names in every language;
 *  - flag-icons (MIT), for faithful flags redrawn at one 4:3 ratio. Real
 *    ratios would give the answer away (Qatar's long strip, Switzerland's
 *    square); stretching them to one ratio would warp circles and suns.
 *
 * It writes data/countries.json, which anyone may see, and one tile pack per
 * flag under the site's public folder. The packs are public too — every flag
 * is — but only the Worker decides which one is today's and which tiles of it
 * a player has earned, so nothing on the page says what the answer is.
 */

const FLAGS = new URL("../node_modules/flag-icons/flags/4x3/", import.meta.url);
/**
 * Tile packs land here, outside git; `upload-tiles.ts` puts them in the
 * akinozgen-games R2 bucket, which the site's Worker reads through a binding.
 */
const PACKS = new URL("../tiles/", import.meta.url);

/** Natural Earth codes that are not the country's ISO code. */
const ISO3_FIXES: Record<string, string> = { cuba: "CUB", cyprus: "CYP", kosovo: "XKX" };
const ALPHA2_FIXES: Record<string, string> = { XKX: "XK" };
/** Where flag-icons files a territory's own flag under another name. */
const FLAG_FILES: Record<string, string> = { SH: "sh-hl" };
/** When two codes share a flag, these keep it over their territories. */
const SOVEREIGN_FIRST = new Set(["FR", "NO", "US", "GB", "NL", "AU", "NZ", "DK"]);

interface GeoRegion {
  id: string;
  iso3: string;
  names: { en: string; tr: string; de: string; es: string };
  continent: string;
  centroid: [number, number];
}

/** A small rendering of a flag, to tell whether two files draw the same thing. */
async function thumbnail(svg: Buffer): Promise<Buffer> {
  return sharp(svg, { density: 72 }).resize(64, 48, { fit: "fill" }).flatten({ background: "#ffffff" }).raw().toBuffer();
}

/** Same picture, give or take antialiasing. */
function alike(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  // Svalbard against Norway measures under 4; Romania against Chad, the
  // nearest real pair of distinct flags, measures 18.
  return total / a.length < 6;
}

/**
 * A pack is the six colour tiles, the same six in grey, then the whole flag,
 * each a WebP. Header: 13 little-endian uint32 byte lengths. The whole flag
 * is only ever sent once a round is over, so the finished board shows one
 * clean image rather than six tiles resampled side by side.
 */
async function pack(svg: Buffer): Promise<Buffer> {
  const width = COLUMNS * TILE_W;
  const height = ROWS * TILE_H;
  const full = await sharp(svg, { density: 400 })
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  const tiles: Buffer[] = [];
  for (const grey of [false, true]) {
    for (let index = 0; index < COLUMNS * ROWS; index++) {
      let tile = sharp(full).extract({
        left: (index % COLUMNS) * TILE_W,
        top: Math.floor(index / COLUMNS) * TILE_H,
        width: TILE_W,
        height: TILE_H,
      });
      if (grey) tile = tile.grayscale();
      tiles.push(await tile.webp({ quality: 82 }).toBuffer());
    }
  }

  tiles.push(await sharp(full).webp({ quality: 86 }).toBuffer());

  const header = Buffer.alloc(tiles.length * 4);
  tiles.forEach((tile, i) => header.writeUInt32LE(tile.length, i * 4));
  return Buffer.concat([header, ...tiles]);
}

/** ICU's Russian short forms ("о-ва", "Конго - Киншаса") spelled out. */
const RU_FIXES: Record<string, string> = {
  CD: "Демократическая Республика Конго",
  CG: "Республика Конго",
  HK: "Гонконг",
  MO: "Макао",
  MM: "Мьянма",
  SH: "Остров Святой Елены",
  VG: "Британские Виргинские острова",
  VI: "Американские Виргинские острова",
  PS: "Палестина",
};

/** Names people type that no language's official form covers. */
const EXTRA_ALIASES: Record<string, string[]> = {
  US: ["USA", "United States", "America", "ABD", "США"],
  GB: ["UK", "Great Britain", "Britain", "England", "İngiltere", "Birleşik Krallık"],
  TR: ["Turkey", "Türkiye", "Turkei", "Турция"],
  CZ: ["Czech Republic", "Czechia", "Çekya"],
  CI: ["Ivory Coast", "Côte d'Ivoire", "Fildişi Sahili"],
  TL: ["East Timor", "Doğu Timor"],
  SZ: ["Swaziland", "Eswatini", "Svaziland"],
  BA: ["Bosnia", "Bosna"],
  TT: ["Trinidad", "Tobago"],
  MK: ["Macedonia", "Makedonya"],
  CD: ["DRC", "DR Congo", "Congo-Kinshasa", "Kongo DC"],
  CG: ["Congo-Brazzaville", "Congo"],
  KR: ["South Korea", "Korea", "Güney Kore"],
  KP: ["North Korea", "Kuzey Kore"],
  AE: ["UAE", "BAE"],
  NL: ["Holland", "Hollanda"],
  VA: ["Vatican", "Vatikan"],
  MM: ["Burma", "Birmanya"],
  CV: ["Cape Verde", "Yeşil Burun Adaları"],
  PS: ["Palestine", "Filistin"],
};

const ICU = Object.fromEntries(
  LANGUAGES.map((language) => [language, new Intl.DisplayNames([language], { type: "region" })]),
) as Record<string, Intl.DisplayNames>;

function russian(code: string, fallback: string): string {
  if (RU_FIXES[code]) return RU_FIXES[code];
  const name = ICU.ru.of(code);
  if (!name || name === code) return fallback;
  const spelled = name.replace(/о-ва/g, "острова").replace(/о-в/g, "остров").replace(/Св\./g, "Святого");
  return spelled.charAt(0).toUpperCase() + spelled.slice(1);
}

/**
 * Display names: travelle's curated Natural Earth names where it has the
 * language, Russian from ICU with its short forms spelled out. Everything
 * else ICU knows the country as becomes a search alias.
 */
function namesOf(code: string, region: GeoRegion): { names: Country["names"]; aliases: string[] } {
  const names: Country["names"] = {
    en: code === "SZ" ? "Eswatini" : region.names.en,
    tr: region.names.tr,
    de: region.names.de,
    es: region.names.es,
    ru: russian(code, region.names.en),
  };
  const shown = new Set(Object.values(names));
  const aliases = [
    ...LANGUAGES.map((language) => ICU[language].of(code) ?? ""),
    ...(EXTRA_ALIASES[code] ?? []),
  ].filter((alias) => alias && alias !== code && !shown.has(alias));
  return { names, aliases: [...new Set(aliases)] };
}

async function main(): Promise<void> {
  await rm(PACKS, { recursive: true, force: true });
  await mkdir(PACKS, { recursive: true });

  // Several regions can share a code (Australia and its outlying islands,
  // Portugal and the Azores); the one ICU names after the code is the country.
  const english = new Intl.DisplayNames(["en"], { type: "region" });
  const byCode = new Map<string, GeoRegion>();
  const skipped: string[] = [];
  for (const region of (geo as unknown as { regions: GeoRegion[] }).regions) {
    const iso3 = ISO3_FIXES[region.id] ?? region.iso3;
    const code = ALPHA2_FIXES[iso3] ?? countries.alpha3ToAlpha2(iso3);
    if (!code) {
      skipped.push(`${region.id} (no ISO code)`);
      continue;
    }
    const current = byCode.get(code);
    const named = english.of(code);
    if (!current || (current.names.en !== named && region.names.en === named)) {
      if (current) skipped.push(`${current.id} (shares ${code})`);
      byCode.set(code, region);
    } else {
      skipped.push(`${region.id} (shares ${code})`);
    }
  }

  // Réunion and Saint Pierre fly the French flag, Svalbard the Norwegian.
  // Two answers behind one picture is not a puzzle, so the sovereign keeps it.
  // Sovereigns first, then the frozen answers, so neither loses its flag to a territory.
  const answered = new Set(answers as string[]);
  const rank = (code: string): number => (SOVEREIGN_FIRST.has(code) ? 0 : answered.has(code) ? 1 : 2);
  const codes = [...byCode.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const seenFlags = new Map<string, Buffer>();
  const chosen: Country[] = [];
  for (const code of codes) {
    const region = byCode.get(code)!;
    let svg: Buffer;
    try {
      svg = await readFile(new URL(`${FLAG_FILES[code] ?? code.toLowerCase()}.svg`, FLAGS));
    } catch {
      skipped.push(`${region.id} (no flag)`);
      continue;
    }
    // Compared as pictures, not files: two SVGs can draw the same flag.
    const look = await thumbnail(svg);
    const twin = [...seenFlags].find(([, seen]) => alike(seen, look))?.[0];
    if (twin) {
      skipped.push(`${region.id} (same flag as ${twin})`);
      continue;
    }
    seenFlags.set(code, look);

    chosen.push({
      code,
      ...namesOf(code, region),
      continent: region.continent,
      lat: Math.round(region.centroid[1] * 1000) / 1000,
      lon: Math.round(region.centroid[0] * 1000) / 1000,
    });
    await writeFile(new URL(`${code.toLowerCase()}.bin`, PACKS), await pack(svg));
  }

  chosen.sort((a, b) => a.code.localeCompare(b.code));
  await writeFile(new URL("../data/countries.json", import.meta.url), JSON.stringify(chosen));

  const licence = await readFile(new URL("../../LICENSE", FLAGS), "utf8");
  await writeFile(
    new URL("FLAGS-LICENSE.txt", PACKS),
    `Flags from flag-icons (https://github.com/lipis/flag-icons)\n\n${licence}`,
  );

  console.log(`countries: ${chosen.length}`);
  console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
}

await main();
