# games

The small browser games served under [akinozgen.com/games](https://akinozgen.com/games).

- **travelle** — a clone of [travle.earth](https://travle.earth): name the
  countries that link a start country to an end country by land.
- **vexle** — a daily flag game: every guess turns over one tile of the flag,
  and a compass points from your last guess towards the answer.
- **tessle** — a daily map jigsaw: a handful of neighbouring countries,
  scattered and turned, to be fitted back together.
- **sizele** — a daily size game: how many Turkeys make a Greenland? Five
  rounds on a Mercator map, which lies, then each country slides to its
  true size.
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
| `packages/vexle` | vexle's countries, tile packs and game server                         |
| `apps/vexle`     | vexle — React + Vite                                                  |
| `packages/tessle` | tessle's map, groups and game server                               |
| `apps/tessle`    | tessle — React + Vite                                                 |
| `packages/sizele` | sizele's areas, outlines and game server                            |
| `apps/sizele`    | sizele — React + Vite                                                 |
| `apps/belediye`  | Çaylar Belediyeden — TypeScript + Vite                                |

## Commands

```sh
pnpm install
pnpm --filter @travelle/geo build:data      # rebuild the border graph
pnpm --filter @travelle/geo build:public    # rebuild what the browser may see
pnpm --filter @tessle/data build:data       # rebuild tessle's pieces and groups (append-only)
pnpm --filter @sizele/data build:data       # rebuild sizele's areas and outlines
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

## How vexle keeps its answer

`packages/vexle/scripts/build-data.ts` takes flags from
[flag-icons](https://github.com/lipis/flag-icons) (MIT), drawn faithfully at
one 4:3 ratio (real ratios would give answers away), cuts each into six tiles (colour and grey, WebP) and writes one pack per
flag to `packages/vexle/tiles/` (not in git; `scripts/upload-tiles.ts` puts
them in the `akinozgen-games` R2 bucket, bound to the Worker as `GAME_ASSETS`), plus `data/countries.json`
(names in five languages from ICU, centroids from travelle's regions). Every
flag is public anyway; what stays on the server is which one is today's.

`/api/vexle/judge?d=<date>&g=<codes>&hard=1` (`src/pages/api/vexle/[action].ts`,
backed by `packages/vexle/src/server.ts`) picks the day's flag from
`HMAC(seed, day)`, scores each guess (distance, bearing, proximity), and sends
back only the tiles earned so far, as data URLs. The answer's code appears only
once the round is over. It uses the same Worker secret as travelle, prefixed so
the two games' draws are unrelated.

Which flags can be the answer changed on day 4. Days 1–3 were dealt from
`data/answers.json` — nearly every flag, territories included — and keep
their answers. From day 4 the list is `data/answers-v2.json`: countries only
(UN members, the two observers, Kosovo and Taiwan; Anguilla, Pitcairn and the
other territories can still be guessed but are never the answer), with
Africa's flags in a `half` list that comes round every other pass. Within a
pass continents take turns, and no flag returns within 45 days. Both lists
are append-only, and appended entries wait for a new era (`ERAS` in
`server.ts`) starting on a future day.

## vexle's endless mode

vexle has an endless mode: back-to-back practice rounds with a record
of their own, kept apart from the daily streak. Rounds come from a deck: the
browser picks a random 32-bit deck number and plays it card by card
(`/api/vexle/endless?e=<deck>&i=<card>`). The server shuffles the deck —
every country flag, half of Africa's — with `HMAC(seed, deck)`, so the
number alone gives nothing away, and no flag comes round twice until all
170 cards are played. (Drawn independently, as endless first did, a repeat
was more likely than not within about seventeen rounds.)

Endless deliberately excludes nothing — not even today's answer. A rule
like "never deal today's flag" could be measured from outside by asking for
thousands of rounds and seeing which answer never turns up, which would
narrow the daily down to a handful. Instead the page keeps endless closed
until the day's round is finished, so an honest player can't be spoiled.

## How tessle keeps its answer

`packages/tessle/scripts/build-data.ts` reads travelle's map and writes
three files: `data/world.json` (every country that can be a piece, its
landmasses and which of them share a border), `data/groups.json` (the groups
a round can deal: five to seven neighbours, compact, with no piece more than
30 times another's size, and no continent holding more than its share —
Africa at most 22%, Europe 36%) and `data/names.json` (piece names in five
languages, the only one the browser loads). Outlines are copied untouched
from travelle's topology-aware geometry, so neighbours share the very same
border line and fit without seams.

`/api/tessle/*` (`src/pages/api/tessle/[action].ts`, backed by
`packages/tessle/src/server.ts`) is the only place the answer exists:

| Endpoint  | Does                                                                  |
| --------- | --------------------------------------------------------------------- |
| `daily`   | Today's pieces, from `HMAC(seed, day)`: each centred on itself, turned a secret number of 30° steps, in shuffled order; names only outside hard mode. Also the frame: the finished map's silhouette, made of the edges only one piece has |
| `endless` | The same for a random round number the browser picks                  |
| `fit`     | Takes the whole board (`x,y,turn` per piece) and says which pieces fit — neighbours facing the same way, within snap distance, and pieces north up near their place in the frame — snapping them exactly into place; once the map is whole it sends the answer |
| `reveal`  | Giving up: every piece's name, place and way up                       |

Which pieces border which, where each belongs and which way is north never
reach the page. Same Worker secret as the other games, prefixed `tessle:`.

`groups.json` is append-only, and the build keeps the published list as it
is. The daily cycles through a fixed number of groups (`ERAS` in
`server.ts`): appended groups wait for a new era, starting on a future day,
because changing the length a pass cycles through would reshuffle every day
it has dealt, today's included. Within a pass continents take turns: a
continent rests a day or more (up to three for the rarer ones) before it is
dealt again, and nothing the previous pass ended on returns within 30 days.

## How sizele keeps its answer

`packages/sizele/scripts/build-data.ts` reads travelle's map and writes
`data/countries.json` — every country a round can deal (UN members and the
like, over 20,000 km², plus Greenland), with its area on the globe, its area
as Mercator draws it, where it sits and a thinned outline — and
`data/names.json`, the only file the browser loads. Areas are measured on
the full-detail outline, on the sphere; the browser only gets the thinned
one, for drawing.

`/api/sizele/play?d=<date>&g=<guesses>` (`src/pages/api/sizele/[action].ts`,
backed by `packages/sizele/src/server.ts`) deals the day's five pairs from
`HMAC(seed, day)`: a familiar unit and any target, a ratio between 1/25 and
25 and not too even, no country twice, at most two targets from one
continent, and at least two pairs the map lies about by three times or
more. The rounds run from the most honest pair to the most misleading.
Each call carries every guess so far; the server scores them (100 for the
truth, about 23 at twice or half, on a log scale), hands over the next
round as two outlines and nothing else, and reveals a pair's true and
Mercator ratios only once it has been guessed. `e=<number>` plays an
endless set the same way. Same Worker secret as the other games, prefixed
`sizele:`.

The schedule draws from `countries.json` by position, so the file is frozen
once a day has been dealt: editing it would change days already played. A
change needs an era, as tessle's `ERAS` does. Like the other games the API
is stateless — it judges whatever guesses it is sent, so scores and streaks
live in the player's browser and nothing is a leaderboard.
