// Araçların ortak yardımcıları.
//   sunucu(klasör)  derlenmiş oyunu (vite build → dist/) rastgele bir porttan sunar: { url, kapat }. Modül kodu dosyadan açılınca çalışmaz.
//   motor()         oyun motoru ve içerik (cards.js + engine.js + adlar.js) tek nesnede; araçlar durum kurmak için kullanır
//   betik(...ad)    src/ modüllerini import/export'suz düz betiğe çevirip birleştirir: oyundan bağımsız gösteri sayfalarına gömmek için
//   FONTS           yazı karakteri CSS'i, dosya yolları mutlak (gösteri sayfaları .cache/ altında durur)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = new URL("../../", import.meta.url);
export const DIST = fileURLToPath(new URL("dist/", APP));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

export function sunucu(dir = DIST) {
  const root = resolve(dir);
  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
    let file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const st = await stat(file);
      if (st.isDirectory() && !p.endsWith("/")) { res.writeHead(307, { Location: p + "/" + url.search }).end(); return; }
      if (st.isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Bulunamadı"); }
  });
  return new Promise(ok => srv.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${srv.address().port}/`, kapat: () => srv.close() })));
}

export async function motor() {
  const ms = await Promise.all(["cards", "engine", "adlar"].map(m => import(new URL(`src/${m}.js`, APP).href)));
  return Object.assign({}, ...ms);
}

export const betik = (...adlar) => adlar.map(a => readFileSync(new URL(`src/${a}.js`, APP), "utf8")
  .replace(/^import [^\n]*\n/gm, "").replace(/^export /gm, "")).join("\n");

export const FONTS = readFileSync(new URL("src/fonts.css", APP), "utf8").replace(/url\(\.\/fonts\//g, `url(${new URL("src/fonts/", APP).href}`);
