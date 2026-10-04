import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * Uploads the tile packs from tiles/ to R2: `node scripts/upload-tiles.ts <bucket>`.
 * Needs `wrangler login` (or CLOUDFLARE_API_TOKEN) first. The site's Worker
 * reads them through its GAME_ASSETS binding (bucket akinozgen-games); bump the
 * version here and in src/pages/api/vexle/[action].ts whenever the set is rebuilt.
 */
const PREFIX = "vexle/tiles-v2";
const bucket = process.argv[2];
if (!bucket) throw new Error("usage: node scripts/upload-tiles.ts <bucket>");

const run = promisify(execFile);
/** The site root, whose wrangler holds the login. */
const SITE = fileURLToPath(new URL("../../../../", import.meta.url));
const dir = new URL("../tiles/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".bin") || f.endsWith(".txt"));

let done = 0;
const queue = [...files];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      await run("npx", [
        "wrangler", "r2", "object", "put", `${bucket}/${PREFIX}/${file}`,
        "--file", fileURLToPath(new URL(file, dir)), "--remote",
        "--content-type", file.endsWith(".txt") ? "text/plain" : "application/octet-stream",
        "--cache-control", "public, max-age=604800, immutable",
      ], { cwd: SITE });
      done++;
      if (done % 25 === 0 || done === files.length) console.log(`${done}/${files.length}`);
    }
  }),
);
