import { useEffect, useState } from "react";

/** Where the page is: the computer game, the online games, or one online game by its code. */
export type Route = { page: "bot" } | { page: "online" } | { page: "room"; code: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "cevrimici") return { page: "online" };
  const room = /^oda\/([0-9A-Za-z]{6})$/.exec(path);
  if (room) return { page: "room", code: room[1].replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32)) };
  return { page: "bot" };
}

/** The route, following the hash; links are plain `#/…` hrefs. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export const go = (hash: string): void => {
  window.location.hash = hash;
};
