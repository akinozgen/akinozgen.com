import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In development the game talks to the same API code the site runs, served
 * by Vite itself with a throwaway seed. The real seed is a Worker secret.
 */
function devApi(): Plugin {
  return {
    name: "sizele-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/sizele", async (req, res) => {
        const { handleSizele } = await server.ssrLoadModule("@sizele/data/server");
        const url = new URL(req.url ?? "/", "http://localhost");
        const reply = await handleSizele(
          url.pathname.replace(/^\//, ""),
          url.searchParams,
          process.env.SIZELE_SEED ?? "development-only-seed",
        );
        res.statusCode = reply.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply.body));
      });
    },
  };
}

/** The site serves the game under /games/sizele/; `--mode site` builds it for that path. */
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi()],
  base: mode === "site" ? "/games/sizele/" : "/",
  server: { host: true, port: 5183, strictPort: true },
  preview: { host: true, port: 5184, strictPort: true },
  build: { target: "es2022" },
}));
