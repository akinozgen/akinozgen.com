import type { HarfiyenLobby } from "./lobby.ts";
import type { HarfiyenRoom } from "./room.ts";

/** What harfiyen needs from the Worker's environment. */
export interface HarfiyenEnv {
  HARFIYEN_ROOM: DurableObjectNamespace<HarfiyenRoom>;
  HARFIYEN_LOBBY: DurableObjectNamespace<HarfiyenLobby>;
  /** "off" closes online play without a deploy of code. */
  HARFIYEN_MP?: string;
  /** The VAPID private key for push notices, as a JWK (a Worker secret). Without it, no notices. */
  HARFIYEN_VAPID?: string;
}
