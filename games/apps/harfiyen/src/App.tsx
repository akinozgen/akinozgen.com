import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HowToPlay } from "./components/Sheets.tsx";
import { Footer } from "./components/TopBar.tsx";
import { loadLexicons, type Lexicons } from "./game/lexicons.ts";
import { useMyGames } from "./game/myGames.ts";
import { listenForOpen, syncPush } from "./game/push.ts";
import { useRoute } from "./game/route.ts";
import { useSession } from "./game/session.ts";
import { BotGame } from "./screens/BotGame.tsx";
import { OnlineHub } from "./screens/OnlineHub.tsx";
import { OnlineRoom } from "./screens/OnlineRoom.tsx";

const SEEN_RULES_KEY = "harfiyen:seen-rules:v1";
/** How long the word that a device's games moved to the account stays. */
export const MOVED_NOTE_MS = 6000;

/** harfiyen: the word lists, the rules sheet and whichever screen the hash asks for. */
export function App(): React.ReactElement {
  const [lexicons, setLexicons] = useState<Lexicons | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    loadLexicons().then(setLexicons, () => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const route = useRoute();
  const [rules, setRules] = useState(() => !readJson<boolean>(SEEN_RULES_KEY));
  const closeRules = useCallback(() => {
    writeJson(SEEN_RULES_KEY, true);
    setRules(false);
  }, []);
  const openRules = useCallback(() => setRules(true), []);

  // The signed-in account's online games, for the hub and for the badge on every screen's switch.
  const session = useSession();
  const myGames = useMyGames(session, route.page === "online");
  // Games this browser played before accounts, just moved to the account: said once, briefly.
  const [movedNote, setMovedNote] = useState(0);
  useEffect(() => {
    if (myGames.moved === 0) return;
    setMovedNote(myGames.moved);
    const timer = setTimeout(() => setMovedNote(0), MOVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [myGames.moved]);
  // Notices: keep the stored subscription true to the browser's, and follow a tapped one to its room.
  useEffect(() => {
    void syncPush();
    return listenForOpen();
  }, []);

  return (
    <div className="app">
      {route.page === "bot" && (
        <BotGame lexicons={lexicons} failed={failed} onRetry={load} onRules={openRules} blocked={rules} waiting={myGames.waiting} />
      )}
      {route.page === "online" && <OnlineHub session={session} games={myGames} onRules={openRules} waiting={myGames.waiting} />}
      {route.page === "room" && (
        <OnlineRoom
          key={route.code}
          code={route.code}
          lexicons={lexicons}
          failed={failed}
          onRetry={load}
          onRules={openRules}
          blocked={rules}
          waiting={myGames.waiting}
        />
      )}
      <Footer />
      {rules && <HowToPlay onClose={closeRules} />}
      {movedNote > 0 &&
        createPortal(
          <div className="toast" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
            Bu cihazdaki {movedNote} oyun hesabına taşındı
          </div>,
          document.body,
        )}
    </div>
  );
}
