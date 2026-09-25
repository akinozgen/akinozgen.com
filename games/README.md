# games

The small browser games served under [akinozgen.com/games](https://akinozgen.com/games).

- **travelle** — a clone of [travle.earth](https://travle.earth): name the
  countries that link a start country to an end country by land.
- **Çaylar Belediyeden** (`belediye`) — a card game in Turkish: you run a
  made-up Anatolian town by swiping memos left or right. Plain JS modules
  built with Vite; see [apps/belediye/README.md](apps/belediye/README.md).

travelle has two modes: **Daily**, one puzzle a day from a fixed calendar, and **Endless**,
which deals puzzles from a map you set up — continents switched off, individual
countries dropped, and a route length you choose.

## Layout

| Path             | What lives there                                                    |
| ---------------- | ------------------------------------------------------------------- |
| `packages/geo`   | Border graph: the Natural Earth pipeline, the solver, puzzle calendar |
| `packages/core`  | Game-agnostic bits shared across games (daily index, storage, share)  |
| `apps/travelle`  | The game itself — React + Vite                                        |
| `apps/belediye`  | Çaylar Belediyeden — plain JS modules + Vite                          |

## Commands

```sh
pnpm install
pnpm --filter @travelle/geo build:data      # rebuild the border graph
pnpm --filter @travelle/geo build:puzzles   # rebuild the puzzle calendar
pnpm test                                   # graph + scoring tests
pnpm dev                                    # run travelle
pnpm build                                  # build every game into ../public/games/<slug>/
```

`pnpm build` runs each app's `build:site`, which writes straight into the
site's `public/games/<slug>/`. That output is committed, so publishing a game
is: build, commit, push — the site deploys the folder as it is. From the site
root, `npm run build:games` does the same. The per-app standalone builds
(each app's own `dist/`) are `pnpm build:apps`.

Adding a game: an app under `apps/<slug>` with a `build:site` script that
writes to `../../../public/games/<slug>/`, plus an entry in
`../src/data/games.ts` for the gallery.

`packages/geo/data/*.json` is generated but committed, so nothing has to be
downloaded to run the game. Rebuild it only when the source data or the rules
in `packages/geo/src/overrides.ts` change.

## Deploying travelle on its own

The built site is static, so it goes up as a Cloudflare Worker with no Worker
script — just the assets on the edge.

```sh
CLOUDFLARE_API_TOKEN=… pnpm --filter @travelle/travelle deploy
```

The token is read from the environment and is deliberately not stored in
`wrangler.jsonc` or anywhere else in the repo.
