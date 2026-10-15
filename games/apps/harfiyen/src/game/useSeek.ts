import { type ErrorCode, type LobbyMessage, PROTOCOL } from "@harfiyen/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionLost } from "./session.ts";
import { type Link, type LinkState, openLink, type SocketConstructor, socketUrl } from "./socket.ts";

/** After this long without a partner, the other ways to play are offered beside the search. */
export const FALLBACK_AFTER = 20_000;

export interface Seek {
  searching: boolean;
  /** Everyone looking right now, this player included; null until the lobby says. */
  seekers: number | null;
  /** Seconds since the search began. */
  elapsed: number;
  connection: LinkState;
  error: ErrorCode | null;
  start: () => void;
  stop: () => void;
}

/**
 * Looking for a random opponent: the lobby's socket, open while the search
 * lasts. Pairing hands back a room code; the search never gives up by
 * itself — after a while the other ways to play are offered beside it.
 */
export function useSeek(onMatched: (code: string) => void, options: { WebSocket?: SocketConstructor } = {}): Seek {
  const [searching, setSearching] = useState(false);
  const [seekers, setSeekers] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [connection, setConnection] = useState<LinkState>("closed");
  const [error, setError] = useState<ErrorCode | null>(null);
  const link = useRef<Link | null>(null);
  const matched = useRef(onMatched);
  matched.current = onMatched;
  const WebSocketImpl = options.WebSocket;

  const stop = useCallback(() => {
    link.current?.close();
    link.current = null;
    setSearching(false);
    setSeekers(null);
    setConnection("closed");
  }, []);

  const start = useCallback(() => {
    if (link.current) return;
    setError(null);
    setSeekers(null);
    setElapsed(0);
    setSearching(true);
    link.current = openLink<LobbyMessage>({
      url: socketUrl("/api/harfiyen/ws/lobi"),
      greeting: () => ({ t: "seek", v: PROTOCOL }),
      final: ["surum", "kapali", "oturum"],
      WebSocket: WebSocketImpl,
      onState: setConnection,
      onMessage: (message) => {
        if (message.t === "waiting") setSeekers(message.seekers);
        else if (message.t === "matched") {
          link.current?.close();
          link.current = null;
          setSearching(false);
          matched.current(message.code);
        } else if (message.t === "error") {
          setError(message.code);
          if (message.code === "surum" || message.code === "kapali" || message.code === "oturum") {
            link.current = null;
            setSearching(false);
          }
          if (message.code === "oturum") sessionLost();
        }
      },
    });
  }, [WebSocketImpl]);

  useEffect(() => {
    if (!searching) return;
    const began = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [searching]);

  // Leaving the page ends the search.
  useEffect(() => () => link.current?.close(), []);

  return { searching, seekers, elapsed, connection, error, start, stop };
}
