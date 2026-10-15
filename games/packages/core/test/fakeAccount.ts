import type { Imported, PlayRecord, User } from "../../account/src/protocol.ts";
import { judgeRecorded, type PlayRules, type Reply } from "../src/record.ts";

/**
 * The server a signed-in page talks to, for the daily games' tests: the
 * account API (/api/hesap) and one game's API, run in process. The game's
 * requests go through the same record code the Worker runs, with a Map for
 * D1. Requests made without the session (`credentials: "omit"`), or while
 * no one is signed in, are judged as anyone's.
 */

export const TEST_USER: User = {
  name: "Neşeli Kirpi #4821",
  base: "Neşeli Kirpi",
  tag: "4821",
  chosen: null,
  email: "oyuncu@example.com",
  provider: "google.com",
  createdAt: 1,
};

export interface StoredTestPlay {
  moves: unknown;
  result: unknown | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface FakeAccount {
  signedIn: boolean;
  /** The account's plays, by puzzle ("d:<date>", "e:<round>"). */
  plays: Map<string, StoredTestPlay>;
  imported: Imported | null;
  /** Every /aktar call, kept or not. */
  imports: unknown[];
  /** The clock the server writes with. */
  now: () => number;
  /** Every request, as "path?query". */
  calls: string[];
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function fakeAccount(options: {
  game: string;
  rules: (action: string, query: URLSearchParams) => PlayRules<unknown, unknown, unknown> | null;
  judge: (action: string, query: URLSearchParams) => Promise<Reply>;
}): FakeAccount {
  let tick = 1_000_000;
  const fake: FakeAccount = {
    signedIn: true,
    plays: new Map(),
    imported: null,
    imports: [],
    now: () => (tick += 1000),
    calls: [],
    fetch: async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), "http://localhost");
      fake.calls.push(`${url.pathname}${url.search}`);
      const headers = new Headers(init?.headers);
      const path = url.pathname;

      if (path.startsWith("/api/hesap/")) {
        if (headers.get("X-Hesap") !== "1") return json(403, { error: "koken" });
        const what = path.slice("/api/hesap/".length);
        if (what === "ben") return json(200, { user: fake.signedIn ? TEST_USER : null });
        if (!fake.signedIn) return json(401, { error: "oturum" });
        if (url.searchParams.get("oyun") !== options.game) return json(404, { error: "yok" });
        if (what === "kayitlar") {
          const plays: PlayRecord[] = [...fake.plays]
            .filter(([, play]) => play.finishedAt !== null)
            .map(([puzzle, play]) => ({ puzzle, result: play.result, startedAt: play.startedAt, finishedAt: play.finishedAt! }))
            .sort((a, b) => b.finishedAt - a.finishedAt);
          return json(200, { plays, imported: fake.imported });
        }
        if (what === "aktar") {
          const stats = JSON.parse(decodeURIComponent(headers.get("X-Hesap-Veri") ?? "")) as unknown;
          fake.imports.push(stats);
          if (fake.imported) return json(200, { imported: false });
          fake.imported = { stats, importedAt: fake.now() };
          return json(200, { imported: true });
        }
        return json(404, { error: "yok" });
      }

      const prefix = `/api/${options.game}/`;
      if (!path.startsWith(prefix)) return json(404, { error: "no such endpoint" });
      const action = path.slice(prefix.length);
      const query = url.searchParams;
      const rules = options.rules(action, query);
      const judge = (q: URLSearchParams) => options.judge(action, q);
      const reply =
        !fake.signedIn || init?.credentials === "omit" || !rules
          ? await judge(query)
          : await judgeRecorded(
              rules,
              {
                load: async () => {
                  const play = fake.plays.get(rules.puzzle);
                  return play ? { moves: play.moves, finishedAt: play.finishedAt } : null;
                },
                save: async (moves, result) => {
                  const play = fake.plays.get(rules.puzzle);
                  if (play?.finishedAt != null) return;
                  const now = fake.now();
                  fake.plays.set(rules.puzzle, {
                    moves,
                    result,
                    startedAt: play?.startedAt ?? now,
                    finishedAt: result === null ? null : now,
                  });
                },
              },
              judge,
              query,
            );
      return json(reply.status, reply.body);
    },
  };
  return fake;
}

/** A finished play to put on the fake's record. */
export const finished = (moves: unknown, result: unknown, startedAt: number, finishedAt: number): StoredTestPlay => ({
  moves,
  result,
  startedAt,
  finishedAt,
});
