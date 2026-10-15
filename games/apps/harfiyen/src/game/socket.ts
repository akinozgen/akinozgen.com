import type { ErrorCode } from "@harfiyen/engine";

/**
 * One WebSocket to the game server that keeps itself up: it greets the
 * server first (the player is the session's account, which the Worker reads
 * from the cookie the socket opens with), tries again after a drop — 1, 2, 4 … 30 seconds apart, with a
 * little jitter so a server restart isn't met by everyone at once — and
 * straight away when the network or the tab comes back. A ping every 30
 * seconds keeps it warm and finds a line that died quietly. It gives up
 * for good only when the server says retrying can't help.
 *
 * A page left in the background can let go of its line after half a minute
 * (and does at once when it's put away for good): the server then counts
 * the player as away and sends notices instead, and the line comes back
 * the moment the page is looked at again.
 */

export type LinkState = "connecting" | "open" | "closed";

/** The part of a WebSocket this needs; tests hand in a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type SocketConstructor = new (url: string) => SocketLike;

export interface LinkOptions<M> {
  url: string;
  /** The first message on every connection: `hello` for a room, `seek` for the lobby. */
  greeting: () => unknown;
  onMessage: (message: M) => void;
  onState?: (state: LinkState) => void;
  /** Send "ping" every so often; only where the server answers it. */
  ping?: boolean;
  /** Errors after which the link stops. */
  final?: readonly ErrorCode[];
  /** How long a hidden page keeps its line (default half a minute); Infinity keeps it. Asked each time the page hides. */
  hiddenGrace?: () => number;
  WebSocket?: SocketConstructor;
  random?: () => number;
}

export interface Link {
  /** Sends a message if the line is open; false if it isn't. */
  send(message: unknown): boolean;
  /** Closes the line for good. */
  close(): void;
  readonly state: LinkState;
}

export const PING_EVERY = 30_000;
/** How long a ping may go unanswered before the line counts as dead. */
export const PONG_WITHIN = 10_000;
export const MAX_DELAY = 30_000;
export const HIDDEN_GRACE = 30_000;

/** Errors that end a room's link: no such room, it's full, the invitation was withdrawn, play is off, nobody is signed in. */
export const ROOM_FINAL: readonly ErrorCode[] = ["yok", "dolu", "iptal", "kapali", "surum", "oturum"];

/** The wait before attempt `n` (0 for the first retry): 1, 2, 4 … 30 s, plus up to a second. */
export function backoff(attempt: number, random: () => number = Math.random): number {
  return Math.min(MAX_DELAY, 1000 * 2 ** attempt) + Math.floor(random() * 1000);
}

/** A WebSocket URL on the page's own host. */
export function socketUrl(path: string, where: Pick<Location, "protocol" | "host"> = window.location): string {
  return `${where.protocol === "https:" ? "wss:" : "ws:"}//${where.host}${path}`;
}

/** The page, for reloading; a seam for tests. */
export const page = {
  reload: (): void => window.location.reload(),
};

const RELOADED_KEY = "harfiyen:reloaded:v1";

/**
 * The server runs newer code than this page: reload, once. If the page
 * still says it's too old a minute later — a cached copy — reloading again
 * won't help; the caller says so instead. True if it reloaded.
 */
export function reloadForNewVersion(now: number = Date.now()): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
    if (now - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(now));
  } catch {
    // No storage: reload anyway, the server will say it again if it must.
  }
  page.reload();
  return true;
}

export function openLink<M extends { t: string }>(options: LinkOptions<M>): Link {
  const Socket = options.WebSocket ?? (globalThis.WebSocket as unknown as SocketConstructor);
  const random = options.random ?? Math.random;
  const final = options.final ?? ROOM_FINAL;
  let socket: SocketLike | null = null;
  let state: LinkState = "closed";
  let stopped = false;
  /** Let go while the page is hidden; back when it's seen. */
  let paused = false;
  let attempt = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  const setState = (next: LinkState): void => {
    if (state === next) return;
    state = next;
    options.onState?.(next);
  };

  const stopTimers = (): void => {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    retryTimer = pingTimer = pongTimer = undefined;
  };

  /** Lets go of the current socket without hearing from it again. */
  const release = (): void => {
    const old = socket;
    socket = null;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try {
      old.close(1000);
    } catch {
      // already closing
    }
  };

  const schedule = (): void => {
    if (stopped || paused) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, backoff(attempt, random));
    attempt++;
  };

  /** The line went down: drop it and try again later. */
  const dropped = (): void => {
    stopTimers();
    release();
    setState("closed");
    schedule();
  };

  const probe = (): void => {
    if (!socket || state !== "open") return;
    try {
      socket.send("ping");
    } catch {
      dropped();
      return;
    }
    clearTimeout(pongTimer);
    pongTimer = setTimeout(dropped, PONG_WITHIN);
  };

  function connect(): void {
    if (stopped) return;
    stopTimers();
    release();
    setState("connecting");
    let ws: SocketLike;
    try {
      ws = new Socket(options.url);
    } catch {
      setState("closed");
      schedule();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(options.greeting()));
      } catch {
        dropped();
        return;
      }
      setState("open");
      if (options.ping !== false) pingTimer = setInterval(probe, PING_EVERY);
    };
    ws.onmessage = (event) => {
      // Anything heard proves the line alive.
      clearTimeout(pongTimer);
      if (typeof event.data !== "string" || event.data === "pong") return;
      let message: M;
      try {
        message = JSON.parse(event.data) as M;
      } catch {
        return;
      }
      if (!message || typeof message !== "object" || typeof message.t !== "string") return;
      // The server took the greeting: the next drop starts the waits from the beginning.
      attempt = 0;
      if (message.t === "error") {
        const code = (message as unknown as { code: ErrorCode }).code;
        if (final.includes(code)) {
          stopped = true;
          stopTimers();
          release();
          setState("closed");
          if (code === "surum") reloadForNewVersion();
        }
      }
      options.onMessage(message);
    };
    ws.onclose = () => dropped();
    ws.onerror = () => {
      // A close follows; nothing to do until then.
    };
  }

  const hidden = (): boolean => document.visibilityState === "hidden";

  /** Back online, or back on the tab: reconnect now instead of waiting out the delay, or check the line still works. */
  const wake = (): void => {
    if (stopped || (paused && hidden())) return;
    paused = false;
    if (state === "open") probe();
    else if (state === "closed") {
      attempt = 0;
      connect();
    }
  };

  /** The page is out of sight: let the line go, quietly, until it's back. */
  const pause = (): void => {
    if (stopped || paused) return;
    paused = true;
    stopTimers();
    release();
    setState("closed");
  };

  const onVisibility = (): void => {
    clearTimeout(hideTimer);
    if (!hidden()) {
      wake();
      return;
    }
    const grace = options.hiddenGrace?.() ?? HIDDEN_GRACE;
    if (Number.isFinite(grace)) hideTimer = setTimeout(pause, grace);
    else wake();
  };
  const onPageShow = (): void => wake();
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", onPageShow);

  connect();

  return {
    send(message) {
      if (!socket || state !== "open") return false;
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    },
    close() {
      // Closed by its owner, who isn't listening any more.
      stopped = true;
      stopTimers();
      release();
      state = "closed";
      clearTimeout(hideTimer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", onPageShow);
    },
    get state() {
      return state;
    },
  };
}
