import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Against the computer harfiyen needs no server: the dictionary, the board
 * and the opponent all run in the browser. Games with people go through
 * /api/harfiyen, which in development is the dev Worker
 * (`pnpm --filter @harfiyen/engine dev:mp`, port 8787). `--mode site` builds
 * the game for /games/harfiyen/.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "site" ? "/games/harfiyen/" : "/",
  server: {
    host: true,
    port: 5187,
    strictPort: true,
    proxy: {
      "/api/harfiyen": { target: "http://localhost:8787", ws: true, changeOrigin: false },
      "/api/hesap": { target: "http://localhost:8787", changeOrigin: false },
    },
  },
  preview: { host: true, port: 5188, strictPort: true },
  build: { target: "es2022" },
}));
