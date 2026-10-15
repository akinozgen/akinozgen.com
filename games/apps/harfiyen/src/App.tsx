import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useState } from "react";
import { HowToPlay } from "./components/Sheets.tsx";
import { Footer } from "./components/TopBar.tsx";
import { useIdentity } from "./game/identity.ts";
import { loadLexicons, type Lexicons } from "./game/lexicons.ts";
import { useMyGames } from "./game/myGames.ts";
import { listenForOpen, syncPush } from "./game/push.ts";
import { useRoute } from "./game/route.ts";
import { BotGame } from "./screens/BotGame.tsx";
import { OnlineHub } from "./screens/OnlineHub.tsx";
import { OnlineRoom } from "./screens/OnlineRoom.tsx";

const SEEN_RULES_KEY = "harfiyen:seen-rules:v1";

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

  // The online games this device plays, for the hub and for the badge on every screen's switch.
  const identity = useIdentity();
  const myGames = useMyGames(identity, route.page === "online");
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
      {route.page === "online" && <OnlineHub identity={identity} games={myGames} onRules={openRules} waiting={myGames.waiting} />}
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
    </div>
  );
}
