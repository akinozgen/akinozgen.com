import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Two homes: the standalone Worker serves the game at the root, and the
 * portfolio serves it under /games/travelle/. `--mode site` picks the second.
 * The base lives here rather than on the command line because a leading slash
 * in an argument gets rewritten into a Windows path by Git Bash.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "site" ? "/games/travelle/" : "/",
  // Listen on every interface so other machines on the network can play.
  server: { host: true, port: 5177, strictPort: true },
  preview: { host: true, port: 5178, strictPort: true },
  build: { target: "es2022" },
}));
