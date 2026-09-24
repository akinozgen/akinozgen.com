# travelle

A small collection of daily geography games. First one up is **travelle** — a
clone of [travle.earth](https://travle.earth): name the countries that link a
start country to an end country by land.

Two modes: **Daily**, one puzzle a day from a fixed calendar, and **Endless**,
which deals puzzles from a map you set up — continents switched off, individual
countries dropped, and a route length you choose.

## Layout

| Path             | What lives there                                                    |
| ---------------- | ------------------------------------------------------------------- |
| `packages/geo`   | Border graph: the Natural Earth pipeline, the solver, puzzle calendar |
| `packages/core`  | Game-agnostic bits shared across games (daily index, storage, share)  |
| `apps/travelle`  | The game itself — React + Vite                                        |

## Commands

```sh
pnpm install
pnpm --filter @travelle/geo build:data      # rebuild the border graph
pnpm --filter @travelle/geo build:puzzles   # rebuild the puzzle calendar
pnpm test                                   # graph + scoring tests
pnpm dev                                    # run the game
```

`packages/geo/data/*.json` is generated but committed, so nothing has to be
downloaded to run the game. Rebuild it only when the source data or the rules
in `packages/geo/src/overrides.ts` change.

## Deploying

The built site is static, so it goes up as a Cloudflare Worker with no Worker
script — just the assets on the edge.

```sh
CLOUDFLARE_API_TOKEN=… pnpm --filter @travelle/travelle deploy
```

The token is read from the environment and is deliberately not stored in
`wrangler.jsonc` or anywhere else in the repo.
