import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import countries from "i18n-iso-countries";
import sharp from "sharp";
import geo from "../../geo/data/geo.json" with { type: "json" };
import { COLUMNS, type Country, LANGUAGES, ROWS, TILE_PX } from "../src/types.ts";

/**
 * Builds vexle's data from two sources:
 *
 *  - travelle's regions, for a centroid to measure distances from;
 *  - the platform's Intl.DisplayNames, for names in every language;
 *  - country-flag-icons (MIT), for 3:2 flags.
 *
 * It writes data/countries.json, which anyone may see, and one tile pack per
 * flag under the site's public folder. The packs are public too — every flag
 * is — but only the Worker decides which one is today's and which tiles of it
 * a player has earned, so nothing on the page says what the answer is.
 */

const FLAGS = new URL("../node_modules/country-flag-icons/3x2/", import.meta.url);
const PACKS = new URL("../../../../public/games/vexle-tiles/", import.meta.url);

/** Natural Earth codes that are not the country's ISO code. */
const ISO3_FIXES: Record<string, string> = { cuba: "CUB", cyprus: "CYP", kosovo: "XKX" };
const ALPHA2_FIXES: Record<string, string> = { XKX: "XK" };
/** When two codes share a flag, these keep it over their territories. */
const SOVEREIGN_FIRST = new Set(["FR", "NO", "US"]);

interface GeoRegion {
  id: string;
  iso3: string;
  names: { en: string };
  continent: string;
  centroid: [number, number];
}

/**
 * A pack is the six colour tiles, then the same six in grey, each a WebP.
 * Header: 12 little-endian uint32 byte lengths.
 */
async function pack(svg: Buffer): Promise<Buffer> {
  const width = COLUMNS * TILE_PX;
  const height = ROWS * TILE_PX;
  const full = await sharp(svg, { density: 400 })
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  const tiles: Buffer[] = [];
  for (const grey of [false, true]) {
    for (let index = 0; index < COLUMNS * ROWS; index++) {
      let tile = sharp(full).extract({
        left: (index % COLUMNS) * TILE_PX,
        top: Math.floor(index / COLUMNS) * TILE_PX,
        width: TILE_PX,
        height: TILE_PX,
      });
      if (grey) tile = tile.grayscale();
      tiles.push(await tile.webp({ quality: 82 }).toBuffer());
    }
  }

  const header = Buffer.alloc(tiles.length * 4);
  tiles.forEach((tile, i) => header.writeUInt32LE(tile.length, i * 4));
  return Buffer.concat([header, ...tiles]);
}

/** Where ICU's name is not what players would type. */
const NAME_FIXES: Record<string, Partial<Country["names"]>> = {
  PS: { en: "Palestine", tr: "Filistin", de: "Palästina", ru: "Палестина", es: "Palestina" },
  CI: { tr: "Fildişi Sahili", de: "Elfenbeinküste", es: "Costa de Marfil" },
};

/** The country's name in each language, from ICU. */
function namesOf(code: string, fallback: string): Country["names"] {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const name = new Intl.DisplayNames([language], { type: "region" }).of(code);
      const fixed = NAME_FIXES[code]?.[language];
      return [language, fixed ?? (name && name !== code ? name : fallback)];
    }),
  ) as Country["names"];
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
  const codes = [...byCode.keys()].sort(
    (a, b) =>
      Number(SOVEREIGN_FIRST.has(b)) - Number(SOVEREIGN_FIRST.has(a)) || a.localeCompare(b),
  );
  const seenFlags = new Map<string, string>();
  const chosen: Country[] = [];
  for (const code of codes) {
    const region = byCode.get(code)!;
    let svg: Buffer;
    try {
      svg = await readFile(new URL(`${code}.svg`, FLAGS));
    } catch {
      skipped.push(`${region.id} (no flag)`);
      continue;
    }
    const digest = createHash("sha256").update(svg).digest("hex");
    const twin = seenFlags.get(digest);
    if (twin) {
      skipped.push(`${region.id} (same flag as ${twin})`);
      continue;
    }
    seenFlags.set(digest, code);

    chosen.push({
      code,
      names: namesOf(code, region.names.en),
      continent: region.continent,
      lat: Math.round(region.centroid[1] * 1000) / 1000,
      lon: Math.round(region.centroid[0] * 1000) / 1000,
    });
    await writeFile(new URL(`${code.toLowerCase()}.bin`, PACKS), await pack(svg));
  }

  chosen.sort((a, b) => a.code.localeCompare(b.code));
  await writeFile(new URL("../data/countries.json", import.meta.url), JSON.stringify(chosen));

  const licence = await readFile(new URL("../LICENSE", FLAGS), "utf8");
  await writeFile(
    new URL("FLAGS-LICENSE.txt", PACKS),
    `Flags from country-flag-icons (https://gitlab.com/catamphetamine/country-flag-icons)\n\n${licence}`,
  );

  console.log(`countries: ${chosen.length}`);
  console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
}

await main();
