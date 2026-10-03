# games

The small browser games served under [akinozgen.com/games](https://akinozgen.com/games).

- **travelle** — a clone of [travle.earth](https://travle.earth): name the
  countries that link a start country to an end country by land.
- **Çaylar Belediyeden** (`belediye`) — a card game in Turkish: you run a
  made-up Anatolian town by swiping memos left or right. TypeScript built
  with Vite; see [apps/belediye/README.md](apps/belediye/README.md).

travelle has two modes: **Daily**, one puzzle a day, the same for everyone, and **Endless**,
which deals puzzles from a map you set up — continents switched off, individual
countries dropped, and a route length you choose.

## Layout

| Path             | What lives there                                                    |
| ---------------- | ------------------------------------------------------------------- |
| `packages/geo`   | Border graph: the Natural Earth pipeline, the solver, the game server |
| `packages/core`  | Game-agnostic bits shared across games (daily index, storage, share)  |
| `apps/travelle`  | The game itself — React + Vite                                        |
| `apps/belediye`  | Çaylar Belediyeden — TypeScript + Vite                                |

## Commands

```sh
pnpm install
pnpm --filter @travelle/geo build:data      # rebuild the border graph
pnpm --filter @travelle/geo build:public    # rebuild what the browser may see
pnpm test                                   # graph + scoring tests
pnpm typecheck && pnpm lint                 # tsc and ESLint in every app that has them
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

## How travelle keeps its answers

The browser gets country names and outlines (`data/public.json`) and nothing
about which countries border which. The border graph lives only in the site's
Worker, at `/api/travelle/*` (`src/pages/api/travelle/[action].ts`, backed by
`packages/geo/src/server/api.ts`):

| Endpoint  | Does                                                                  |
| --------- | --------------------------------------------------------------------- |
| `daily`   | Today's pair, from `HMAC(TRAVELLE_SEED, day)`; refuses days that have not begun anywhere on Earth |
| `endless` | Draws a round on the map the player set up                            |
| `judge`   | Marks the guesses, fills in the hints taken, and shows the answer only once the round is over |

`TRAVELLE_SEED` is a Worker secret, set in Cloudflare and nowhere in this
repo; without it the daily endpoints answer 503 rather than fall back to
anything guessable. Days up to 4 October 2026 were published as a fixed list
before this existed and are kept as they were in `data/legacy.json`.

`pnpm dev` serves the same API from Vite with a throwaway seed, and the tests
call it in-process, so neither needs the real one. The Worker only runs for
`/api/*` (`run_worker_first` in the site's `wrangler.jsonc`); every other
request, including the bots' 404s, is served from static assets.
