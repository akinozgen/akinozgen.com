import { readFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const PACKS = new URL("../../../public/games/vexle-tiles/", import.meta.url);

/**
 * In development the game talks to the same API code the site runs, served
 * by Vite itself with a throwaway seed. The real seed is a Worker secret.
 */
function devApi(): Plugin {
  return {
    name: "vexle-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/vexle", async (req, res) => {
        const { handleVexle } = await server.ssrLoadModule("@vexle/data/server");
        const url = new URL(req.url ?? "/", "http://localhost");
        const reply = await handleVexle(
          url.pathname.replace(/^\//, ""),
          url.searchParams,
          process.env.VEXLE_SEED ?? "development-only-seed",
          async (code: string) =>
            new Uint8Array(await readFile(new URL(`${code.toLowerCase()}.bin`, PACKS))),
        );
        res.statusCode = reply.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply.body));
      });
    },
  };
}

/** The site serves the game under /games/vexle/; `--mode site` builds it for that path. */
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi()],
  base: mode === "site" ? "/games/vexle/" : "/",
  server: { host: true, port: 5179, strictPort: true },
  preview: { host: true, port: 5180, strictPort: true },
  build: { target: "es2022" },
}));
