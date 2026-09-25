// Yerel önizleme sunucusu: node tools/serve.mjs [port] [kök klasör]
// Varsayılan kök dist/ (vite build); sitenin tamamını denemek için kök olarak sitenin dist/ klasörü verilebilir.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, normalize, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2] || 8765);
const ROOT = resolve(process.argv[3] || fileURLToPath(new URL("../dist/", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  let file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await stat(file);
    // Cloudflare gibi: klasöre eğik çizgisiz gelinirse eğik çizgiye yönlendir
    if (st.isDirectory() && !p.endsWith("/")) {
      res.writeHead(307, { Location: p + "/" + url.search }).end();
      return;
    }
    if (st.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Bulunamadı");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}  (${ROOT})`));
