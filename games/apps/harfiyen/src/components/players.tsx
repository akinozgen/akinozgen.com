import { createContext, useContext } from "react";

/**
 * Who sits where, for every label on screen. Against the computer the
 * player is seat 0 and the other is "Bilgisayar"; online, either seat can be
 * the player's, and the other has a name.
 */
export interface Players {
  me: number;
  them: number;
  /** The full name for a seat: "Sen" for the player. */
  name: (seat: number) => string;
  /** A short one, for the narrowest screens. */
  short: (seat: number) => string;
  /** The other side is the computer. */
  bot: boolean;
  /** Which seats are connected right now; online only. */
  online?: readonly boolean[];
}

export const BOT_PLAYERS: Players = {
  me: 0,
  them: 1,
  name: (seat) => (seat === 0 ? "Sen" : "Bilgisayar"),
  short: (seat) => (seat === 0 ? "Sen" : "Rakip"),
  bot: true,
};

/** Players for an online game: `names` per seat, the player's own replaced by "Sen". */
export function onlinePlayers(me: number, names: readonly string[], online?: readonly boolean[]): Players {
  return {
    me,
    them: 1 - me,
    name: (seat) => (seat === me ? "Sen" : (names[seat] ?? "Rakip")),
    short: (seat) => (seat === me ? "Sen" : "Rakip"),
    bot: false,
    online,
  };
}

const PlayersContext = createContext<Players>(BOT_PLAYERS);

export const PlayersProvider = PlayersContext.Provider;

export function usePlayers(): Players {
  return useContext(PlayersContext);
}
