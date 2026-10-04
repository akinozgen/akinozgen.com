import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In development the game talks to the same API code the site runs, served
 * by Vite itself with a throwaway seed. The real seed is a Worker secret.
 */
function devApi(): Plugin {
  return {
    name: "babelle-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/babelle", async (req, res) => {
        const { handleBabelle } = await server.ssrLoadModule("@babelle/data/server");
        const url = new URL(req.url ?? "/", "http://localhost");
        const reply = await handleBabelle(
          url.pathname.replace(/^\//, ""),
          url.searchParams,
          process.env.BABELLE_SEED ?? "development-only-seed",
        );
        res.statusCode = reply.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply.body));
      });
    },
  };
}

/** The site serves the game under /games/babelle/; `--mode site` builds it for that path. */
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi()],
  base: mode === "site" ? "/games/babelle/" : "/",
  server: { host: true, port: 5181, strictPort: true },
  preview: { host: true, port: 5182, strictPort: true },
  build: { target: "es2022" },
}));
