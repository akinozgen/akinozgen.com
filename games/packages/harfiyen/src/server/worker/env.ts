import type { AccountEnv } from "../../../../account/src/server/worker/route.ts";
import type { HarfiyenLobby } from "./lobby.ts";
import type { HarfiyenRoom } from "./room.ts";

/** What harfiyen needs from the Worker's environment: its objects, and the accounts players sign in with. */
export interface HarfiyenEnv extends AccountEnv {
  HARFIYEN_ROOM: DurableObjectNamespace<HarfiyenRoom>;
  HARFIYEN_LOBBY: DurableObjectNamespace<HarfiyenLobby>;
  /** "off" closes online play without a deploy of code. */
  HARFIYEN_MP?: string;
  /** The VAPID private key for push notices, as a JWK (a Worker secret). Without it, no notices. */
  HARFIYEN_VAPID?: string;
}
