import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In development the game talks to the same API code the site runs, served
 * by Vite itself, with a throwaway seed. The real seed only exists as a
 * Worker secret.
 */
function devApi(): Plugin {
  return {
    name: "travelle-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/travelle", async (req, res) => {
        const { handleTravelle } = await server.ssrLoadModule("@travelle/geo/server");
        const url = new URL(req.url ?? "/", "http://localhost");
        const reply = await handleTravelle(
          url.pathname.replace(/^\//, ""),
          url.searchParams,
          process.env.TRAVELLE_SEED ?? "development-only-seed",
        );
        res.statusCode = reply.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply.body));
      });
    },
  };
}

/**
 * The game is served by the portfolio under /games/travelle/; `--mode site`
 * builds it for that path. The base lives here rather than on the command
 * line because a leading slash in an argument gets rewritten into a Windows
 * path by Git Bash.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi()],
  base: mode === "site" ? "/games/travelle/" : "/",
  server: { host: true, port: 5177, strictPort: true },
  preview: { host: true, port: 5178, strictPort: true },
  build: { target: "es2022" },
}));
