/**
 * The daily games' records, on the Worker: a signed-in player's request is
 * judged against their play on record (games/packages/core/src/record.ts),
 * kept in D1 (games/packages/account/src/server/worker/plays.ts). Anyone
 * else is answered exactly as before accounts, and so is everyone when D1
 * can't be reached: a record is never a reason a game stops working.
 *
 * Imports into games/ are relative paths: the build here installs only the
 * site's packages, not the games workspace.
 */
import type { PuzzleGame } from "../../games/packages/account/src/protocol.ts";
import { playOf, savePlay } from "../../games/packages/account/src/server/worker/plays.ts";
import { sessionUser } from "../../games/packages/account/src/server/worker/route.ts";
import { judgeRecorded, type PlayRules, type Reply } from "../../games/packages/core/src/record.ts";

/** The account's database, when the Worker has it bound. */
export interface RecordEnv {
  DB?: D1Database;
}

/**
 * Answers a game request: through the player's record when they are signed
 * in and the request is about a puzzle (`rules`), otherwise straight from the
 * game's judge. A request without a session cookie costs no read.
 */
export async function recordedReply<Moves, Result, Asked>(
  game: PuzzleGame,
  request: Request,
  env: RecordEnv,
  rules: PlayRules<Moves, Result, Asked> | null,
  query: URLSearchParams,
  judge: (query: URLSearchParams) => Promise<Reply>,
): Promise<Reply> {
  const db = env.DB;
  if (!rules || !db) return judge(query);
  let user: Awaited<ReturnType<typeof sessionUser>>;
  try {
    user = await sessionUser(request, { DB: db });
  } catch (error) {
    console.error(`${game} record: session`, error);
    return judge(query);
  }
  if (!user) return judge(query);
  const { id } = user;
  return judgeRecorded(
    rules,
    {
      load: () => playOf<Moves, Result>(db, id, game, rules.puzzle),
      save: (moves, result) => savePlay(db, id, game, rules.puzzle, moves, result, Date.now()),
    },
    judge,
    query,
    (error) => console.error(`${game} record`, error),
  );
}

/** A game API's reply as the route sends it. */
export const send = (reply: Reply): Response =>
  Response.json(reply.body, {
    status: reply.status,
    headers: { "Cache-Control": reply.cache, "X-Content-Type-Options": "nosniff" },
  });
