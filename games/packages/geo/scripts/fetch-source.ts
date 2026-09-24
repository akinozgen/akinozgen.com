import { mkdir, stat, writeFile } from "node:fs/promises";

const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
export const SOURCES = ["ne_10m_admin_0_countries", "ne_10m_admin_0_map_subunits"];
export const CACHE = new URL("../.cache/", import.meta.url);

export async function ensureSources(): Promise<void> {
  await mkdir(CACHE, { recursive: true });
  for (const name of SOURCES) {
    const target = new URL(`${name}.geojson`, CACHE);
    try {
      await stat(target);
      continue;
    } catch {
      // not cached yet
    }
    process.stdout.write(`downloading ${name}… `);
    const res = await fetch(`${BASE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    await writeFile(target, body);
    console.log(`${(body.length / 1e6).toFixed(1)} MB`);
  }
}

if (import.meta.filename === process.argv[1]) await ensureSources();
