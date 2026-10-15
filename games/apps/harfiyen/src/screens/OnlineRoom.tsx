import type { ErrorCode } from "@harfiyen/engine";
import { readJson, writeJson } from "@travelle/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatButton, ChatDrawer, ChatIcon } from "../components/Chat.tsx";
import { GiveUp } from "../components/GiveUp.tsx";
import { Monogram } from "../components/Monogram.tsx";
import { onlinePlayers } from "../components/players.tsx";
import { PushOffer } from "../components/PushOffer.tsx";
import { SignInCard } from "../components/SignIn.tsx";
import { RulesIcon, TopBar } from "../components/TopBar.tsx";
import type { Lexicons } from "../game/lexicons.ts";
import { splitName } from "../game/names.ts";
import { go } from "../game/route.ts";
import { ownerOf, useSession } from "../game/session.ts";
import type { SocketConstructor } from "../game/socket.ts";
import { playNudge } from "../game/sound.ts";
import { locative } from "../game/turkish.ts";
import { type OnlineGame, useOnlineGame } from "../game/useOnlineGame.ts";
import { Dots, GameScreen } from "./GameScreen.tsx";

const HUB = "#/cevrimici";
const TURN_TITLE = "(Sıra sende) harfiyen";
const NUDGE_TITLE = "(Dürtüldün!) harfiyen";
const CHAT_TITLE = "(Yeni mesaj) harfiyen";
const TITLES = [TURN_TITLE, NUDGE_TITLE, CHAT_TITLE];
/** How long the page shakes for a nudge; the class comes off after. */
export const SHAKE_MS = 650;
/** How long a word at the top stays: who nudged, or what the other player wrote. */
const NUDGE_TOAST_MS = 3500;
export const CHAT_TOAST_MS = 4000;
/** The longest a chat line runs in the word at the top; the rest is in the chat. */
const TOAST_CHARS = 90;

/** Whether the chat was left open, on a computer; a phone's always starts closed. */
const CHAT_OPEN_KEY = "harfiyen:chat-open:v1";
/** Wide enough for the chat to sit beside the game rather than take the screen. */
const WIDE = "(min-width: 881px)";

function isWide(): boolean {
  return window.matchMedia?.(WIDE).matches ?? true;
}

function useWide(): boolean {
  const [wide, setWide] = useState(isWide);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE);
    if (!query) return;
    const update = (): void => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/** Errors that leave nothing to show of the room. */
const ENDINGS: readonly ErrorCode[] = ["yok", "iptal", "dolu", "kapali", "surum"];

interface RoomProps {
  code: string;
  lexicons: Lexicons | null;
  failed: boolean;
  onRetry: () => void;
  onRules: () => void;
  blocked: boolean;
  waiting: number;
  /** For tests. */
  WebSocket?: SocketConstructor;
}

/**
 * One online game by its code: the invitation, the game, its end and a
 * rematch. Online play goes with an account: opened signed out, the room
 * offers the sign-in instead, and opens by itself once someone signs in.
 */
export function OnlineRoom(props: RoomProps): React.ReactElement {
  const session = useSession();
  if (session.status === "in" && session.user) {
    // Another account signing in here gets a room of its own: nothing of the last one's carries over.
    return <LiveRoom key={ownerOf(session.user)} name={session.user.name} {...props} />;
  }
  return (
    <>
      <RoomTop waiting={props.waiting} onRules={props.onRules} />
      {session.status === "out" ? <SignInCard code={props.code} /> : <RoomLoading code={props.code} connection="connecting" />}
    </>
  );
}

/** The top bar in a room: the chat (once there is one), the way back to the list, the rules. */
function RoomTop({ waiting, onRules, chat }: { waiting: number; onRules: () => void; chat?: React.ReactNode }): React.ReactElement {
  return (
    <TopBar section="online" waiting={waiting}>
      {chat}
      <a className="icon-button" href={HUB} aria-label="Oyunların" title="Oyunların">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1" />
          <circle cx="4.5" cy="12" r="1" />
          <circle cx="4.5" cy="18" r="1" />
        </svg>
      </a>
      <button type="button" className="icon-button" aria-label="Nasıl oynanır" title="Nasıl oynanır" onClick={onRules}>
        <RulesIcon />
      </button>
    </TopBar>
  );
}

function LiveRoom({ code, lexicons, failed, onRetry, onRules, blocked, waiting, WebSocket, name }: RoomProps & { name: string }): React.ReactElement {
  const api = useOnlineGame(code, lexicons, { name, WebSocket });
  const { room, error } = api;

  // A nudge or a chat line blinks the title of a tab in the background.
  const [blink, setBlink] = useState<Blink | null>(null);
  useEffect(() => {
    if (api.nudged) setBlink({ id: api.nudged.id, title: NUDGE_TITLE });
  }, [api.nudged]);
  useEffect(() => {
    if (api.chat.heard) setBlink({ id: Date.now(), title: CHAT_TITLE });
  }, [api.chat.heard]);
  useTurnTitle(api.yourTurn, blink);

  // The chat's drawer: the top bar's button and the word at the top open it. A computer remembers it
  // open; a phone, where it takes the whole screen, closes it when the screen turns narrow.
  const wide = useWide();
  const [chatOpen, setChatOpen] = useState(() => isWide() && readJson<boolean>(CHAT_OPEN_KEY) === true);
  const showChat = useCallback((open: boolean) => {
    setChatOpen(open);
    if (isWide()) writeJson(CHAT_OPEN_KEY, open);
  }, []);
  useEffect(() => {
    if (!wide) setChatOpen(false);
  }, [wide]);

  const top = (
    <RoomTop
      waiting={waiting}
      onRules={onRules}
      chat={api.chat.open && <ChatButton unread={api.chat.unread} open={chatOpen} onToggle={() => showChat(!chatOpen)} />}
    />
  );

  // Seated in a game that has begun: nobody else may take a seat, so a visitor here has come too late.
  const late = room !== null && room.phase !== "waiting" && room.you === null;
  if ((error && ENDINGS.includes(error)) || late) {
    return (
      <>
        {top}
        <RoomGone code={code} error={late ? "dolu" : error!} />
      </>
    );
  }
  if (!room) {
    return (
      <>
        {top}
        <RoomLoading code={code} connection={api.connection} />
      </>
    );
  }
  return (
    <>
      {top}
      <RoomGame
        api={api}
        code={code}
        lexicons={lexicons}
        failed={failed}
        onRetry={onRetry}
        blocked={blocked}
        chatOpen={chatOpen}
        wide={wide}
        onChat={showChat}
      />
    </>
  );
}

/** A word at the top for a few seconds: who nudged, or what the other player just wrote. */
type Toast = { kind: "nudge"; text: string } | { kind: "chat"; name: string; text: string };

function RoomGame({
  api,
  code,
  lexicons,
  failed,
  onRetry,
  blocked,
  chatOpen,
  wide,
  onChat,
}: {
  api: OnlineGame;
  code: string;
  lexicons: Lexicons | null;
  failed: boolean;
  onRetry: () => void;
  blocked: boolean;
  chatOpen: boolean;
  /** The chat sits beside the game, not over it. */
  wide: boolean;
  onChat: (open: boolean) => void;
}): React.ReactElement {
  const room = api.room!;
  const me = room.you ?? (room.host === null ? 0 : 1 - room.host);
  const them = 1 - me;
  const fullNames = room.seats.map((seat) => seat?.name ?? null);
  const names = useMemo(() => room.seats.map((seat) => (seat ? splitName(seat.name).base : "Rakip")), [room.seats]);
  const online = useMemo(() => room.seats.map((seat) => seat?.online ?? false), [room.seats]);
  const players = useMemo(() => onlinePlayers(me, names, online), [me, names, online]);
  const open = api.connection === "open";
  const down = useLater(!open, 1500);
  const table = api.table;
  const other = fullNames[them];

  let instead: React.ReactNode = undefined;
  if (room.phase === "waiting") {
    instead =
      room.you === null ? (
        <JoinCard host={fullNames[room.host ?? them]} onJoin={api.join} open={open} />
      ) : (
        <InviteCard code={code} onCancel={api.cancel} open={open} />
      );
  } else if (room.phase === "over" && !table.over) {
    instead = <ClosedCard api={api} me={me} them={them} other={other} />;
  }

  const meta = (
    <>
      <span>Çevrimiçi</span>
      <span aria-hidden="true">·</span>
      <span className="stage__code">{code}</span>
      {room.phase !== "waiting" && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {room.gameNo > 1 ? `${room.gameNo}. oyun, ` : ""}
            {table.log.length === 0 ? "ilk hamle" : `${table.log.length}. hamle`}
          </span>
        </>
      )}
    </>
  );

  const mine = room.rematch[me] ?? false;
  const theirs = room.rematch[them] ?? false;

  // A nudge from the other side: the page shakes, the phone buzzes, a knock sounds, and a word says who.
  const [toast, setToast] = useState<Toast | null>(null);
  const nudged = api.nudged;
  useEffect(() => {
    if (!nudged) return;
    shakePage();
    navigator.vibrate?.([120, 60, 120]);
    playNudge();
    const from = room.seats[nudged.from]?.name;
    setToast({ kind: "nudge", text: `${from ? splitName(from).base : "Rakibin"} seni dürttü!` });
    // Once per nudge; the room's names don't change it.
  }, [nudged]);

  // The other player's line, while the chat is out of sight: a word at the top that opens it. (It has popped already.)
  const heard = api.chat.heard;
  useEffect(() => {
    if (!heard || (chatOpen && document.visibilityState !== "hidden")) return;
    setToast({ kind: "chat", name: names[heard.from] ?? "Rakibin", text: heard.text });
    // Once per line.
  }, [heard]);
  // Opened, the chat has it all: the word at the top goes.
  useEffect(() => {
    if (chatOpen) setToast((now) => (now?.kind === "chat" ? null : now));
  }, [chatOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "nudge" ? NUDGE_TOAST_MS : CHAT_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);


  return (
    <div className={`room room--${room.phase}`}>
      {toast &&
        createPortal(
          toast.kind === "nudge" ? (
            <div className="toast" role="status" aria-live="assertive">
              <NudgeIcon />
              {toast.text}
            </div>
          ) : (
            <div className="toast toast--chat" role="status" aria-live="polite">
              <button
                type="button"
                className="toast__open"
                onClick={() => {
                  setToast(null);
                  onChat(true);
                }}
              >
                <ChatIcon />
                <span className="toast__text">
                  <strong>{toast.name}:</strong> {shorten(toast.text, TOAST_CHARS)}
                </span>
              </button>
            </div>
          ),
          document.body,
        )}
      <GameScreen
        api={api}
        lexicons={lexicons}
        failed={failed}
        onRetry={onRetry}
        players={players}
        blocked={blocked || (chatOpen && !wide && api.chat.open)}
        meta={meta}
        waitingStatus={
          <span className="status__waiting">
            <span>Sıra {other ? locative(other) : "rakibinde"}. Kapatabilirsin; oyun seni bekler.</span>
            {room.phase === "playing" && (
              <NudgeButton left={api.nudgesLeft} after={api.nudgeAfter} open={open} onNudge={api.nudge} />
            )}
          </span>
        }
        notice={
          !down ? undefined : (
            <span>
              Bağlantı koptu, yeniden bağlanıyor
              <Dots />
            </span>
          )
        }
        instead={instead}
        end={{
          againLabel: mine ? "Rövanş istendi" : theirs ? "Rövanşı kabul et" : "Rövanş iste",
          againDisabled: mine || !open,
          onAgain: api.rematch,
          newLabel: "Oyunlara dön",
          onNew: () => go(HUB),
        }}
        actions={
          <>
            {room.phase === "playing" && !api.yourTurn && <PushOffer compact />}
            <a className="button" href={HUB}>
              Oyunlara dön
            </a>
            {room.phase === "playing" && <GiveUp disabled={!open} onConfirm={api.resign} />}
          </>
        }
        overExtra={<Rematch mine={mine} theirs={theirs} other={other} />}
      />
      {api.chat.open &&
        createPortal(
          <ChatDrawer
            chat={api.chat}
            me={me}
            other={names[them]}
            otherOnline={online[them]}
            connected={open}
            open={chatOpen}
            wide={wide}
            onClose={() => onChat(false)}
          />,
          document.body,
        )}
    </div>
  );
}

/** `text`, cut to `max` characters (not halves of one) with an ellipsis if it's longer. */
function shorten(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

/** `flag`, once it has held for `ms`; false again at once. */
function useLater(flag: boolean, ms: number): boolean {
  const [later, setLater] = useState(false);
  useEffect(() => {
    if (!flag) {
      setLater(false);
      return;
    }
    const timer = setTimeout(() => setLater(true), ms);
    return () => clearTimeout(timer);
  }, [flag, ms]);
  return later;
}

let shakeTimer: ReturnType<typeof setTimeout> | undefined;

/** Shakes the whole page once (a flash instead, for those who'd rather nothing moved). */
export function shakePage(): void {
  const root = document.querySelector<HTMLElement>(".app");
  if (!root) return;
  root.classList.remove("is-nudged");
  // Read the layout so taking the class off and on again restarts the animation.
  void root.offsetWidth;
  root.classList.add("is-nudged");
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => root.classList.remove("is-nudged"), SHAKE_MS);
}

function NudgeIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3.5" width="8" height="17" rx="2" />
      <path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" />
    </svg>
  );
}

/** The time, ticking each second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/** "Dürt": a few a game, one every half minute, only while the other side has the move. */
function NudgeButton({ left, after, open, onNudge }: { left: number; after: number; open: boolean; onNudge: () => void }): React.ReactElement {
  const now = useNow(after > Date.now());
  const wait = Math.max(0, Math.ceil((after - now) / 1000));
  const label = left === 0 ? "Dürt, bu oyunda hakkın kalmadı" : wait > 0 ? "Dürt, biraz bekle" : `Dürt, ${left} hakkın kaldı`;
  return (
    <button type="button" className="nudge-button" onClick={onNudge} disabled={!open || left === 0 || wait > 0} aria-label={label} title={label}>
      <NudgeIcon />
      Dürt
      <span className={`nudge-button__count${wait > 0 ? " is-waiting" : ""}`} aria-hidden="true">
        {wait > 0 ? `${wait} sn` : left}
      </span>
    </button>
  );
}

/** Something that blinks the title of a tab in the background: a nudge, a chat line. `id` tells one from the next. */
interface Blink {
  id: number;
  title: string;
}

/**
 * While it's the player's turn and the tab is in the background, its title
 * says so; after a nudge or a chat line it blinks until the tab is looked at.
 */
function useTurnTitle(yourTurn: boolean, blink: Blink | null): void {
  // What the title says between blinks: whose turn it is, or the page's own.
  const usual = useRef<() => string>(() => TURN_TITLE);
  useEffect(() => {
    if (!blink || document.visibilityState !== "hidden") return;
    let on = true;
    document.title = blink.title;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? blink.title : usual.current();
    }, 1000);
    // Seen: the blinking stops; the title below puts the usual one back.
    const stop = (): void => {
      if (document.visibilityState === "visible") clearInterval(timer);
    };
    document.addEventListener("visibilitychange", stop);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [blink]);
  useEffect(() => {
    const before = TITLES.includes(document.title) ? "harfiyen" : document.title;
    const title = (): string => (yourTurn && document.visibilityState === "hidden" ? TURN_TITLE : before);
    usual.current = title;
    const update = (): void => {
      document.title = title();
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      document.title = before;
    };
  }, [yourTurn]);
}

function InviteCard({ code, onCancel, open }: { code: string; onCancel: () => void; open: boolean }): React.ReactElement {
  const link = `${window.location.origin}${window.location.pathname}#/oda/${code}`;
  const message = "harfiyen'de benimle bir el oynar mısın? Sırayla oynanır, acele yok:";
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // An older browser, or a page that may not write the clipboard: the old way.
      field.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
  };

  const share = (): void => {
    navigator.share({ title: "harfiyen", text: message, url: link }).catch(() => {});
  };

  return (
    <section className="invite" aria-label="Davet">
      <div className="invite__head">
        <div className="invite__heading">
          <p className="invite__kicker">Davet hazır</p>
          <h2 className="invite__title">Linki arkadaşına gönder</h2>
        </div>
        <div className="invite__code" role="img" aria-label={`Oda kodu: ${code.split("").join(" ")}`}>
          {code.split("").map((char, i) => (
            <span key={i} className="code-tile" style={{ animationDelay: `${i * 40}ms` }}>
              {char}
            </span>
          ))}
        </div>
      </div>

      <div className="invite__link">
        <input ref={field} className="invite__field" readOnly value={link} aria-label="Davet linki" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className={`button button--primary invite__copy${copied ? " is-done" : ""}`} onClick={copy}>
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
              Kopyalandı
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
                <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
              </svg>
              Kopyala
            </>
          )}
        </button>
      </div>

      <div className="invite__share">
        {canShare && (
          <button type="button" className="button" onClick={share}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15V4M8 8l4-4 4 4" />
              <path d="M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
            </svg>
            Paylaş
          </button>
        )}
        <a
          className="button invite__wa"
          href={`https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 19.5 5.6 16A7.5 7.5 0 1 1 8.4 18.6z" />
            <path d="M9.3 9.2c.3 2.2 2.3 4.4 4.9 5.3l1.1-1.2-1.6-.9-.7.6c-.9-.4-1.9-1.4-2.3-2.3l.6-.7-.8-1.6z" />
          </svg>
          WhatsApp
        </a>
      </div>

      <PushOffer invite compact />

      <div className="invite__foot">
        <p className="invite__hint">Arkadaşın katılınca oyun başlar; bu sayfayı kapatabilirsin.</p>
        {asking ? (
          <div className="invite__confirm" role="group" aria-label="Daveti geri al">
            <span>Link artık çalışmaz.</span>
            <button type="button" className="link-button" onClick={() => setAsking(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className="link-button invite__withdraw"
              disabled={!open}
              onClick={() => {
                onCancel();
                go(HUB);
              }}
            >
              Geri al
            </button>
          </div>
        ) : (
          <button type="button" className="link-button invite__withdraw" onClick={() => setAsking(true)}>
            Daveti geri al
          </button>
        )}
      </div>
    </section>
  );
}

function JoinCard({ host, onJoin, open }: { host: string | null; onJoin: () => void; open: boolean }): React.ReactElement {
  return (
    <section className="join" aria-label="Davet">
      <div className="join__who">
        <Monogram name={host} size="lg" />
        <div className="join__text">
          <p className="invite__kicker">Davet</p>
          <h2 className="join__title">
            <strong>{host ?? "Biri"}</strong> seninle oynamak istiyor
          </h2>
        </div>
      </div>
      <p className="join__hint">Sırayla oynanır, süre yok: hamleni yap, kapat; sıra sana gelince devam et.</p>
      <div className="join__actions">
        <a className="button" href={HUB}>
          Vazgeç
        </a>
        <button type="button" className="button button--primary" onClick={onJoin} disabled={!open}>
          Oyuna katıl
        </button>
      </div>
    </section>
  );
}

/** A game nobody moved in for a month: closed without a result. */
function ClosedCard({ api, me, them, other }: { api: OnlineGame; me: number; them: number; other: string | null }): React.ReactElement {
  const room = api.room!;
  const mine = room.rematch[me] ?? false;
  const theirs = room.rematch[them] ?? false;
  return (
    <section className="join" aria-label="Oyun kapandı">
      <p className="invite__kicker">Oyun kapandı</p>
      <h2 className="join__title">Uzun süre hamle yapılmadığı için bu oyun sonuçsuz kapandı.</h2>
      <div className="join__actions">
        <a className="button" href={HUB}>
          Oyunlara dön
        </a>
        <button type="button" className="button button--primary" onClick={api.rematch} disabled={mine || api.connection !== "open"}>
          {mine ? "Rövanş istendi" : theirs ? "Rövanşı kabul et" : "Yeniden oyna"}
        </button>
      </div>
      {theirs && !mine && other && <p className="join__hint">{splitName(other).base} yeniden oynamak istiyor.</p>}
    </section>
  );
}

function Rematch({ mine, theirs, other }: { mine: boolean; theirs: boolean; other: string | null }): React.ReactElement {
  const name = other ? splitName(other).base : "Rakibin";
  const text = mine
    ? theirs
      ? "Yeni oyun başlıyor…"
      : `Rövanş isteğin iletildi. ${name} kabul edince yeni oyun burada başlar.`
    : theirs
      ? `${name} rövanş istiyor.`
      : "Rövanş istersen aynı odada yeni bir oyun başlar.";
  return (
    <div className={`panel__rematch${theirs && !mine ? " is-asked" : ""}`} role="status">
      <h2 className="panel__title">Rövanş</h2>
      <p>{text}</p>
    </div>
  );
}

const GONE: Record<string, { title: string; text: string }> = {
  yok: {
    title: "Bu oda bulunamadı",
    text: "Kod yanlış olabilir ya da oda artık yok: kimsenin katılmadığı davetler ve biten oyunlar bir hafta sonra silinir.",
  },
  iptal: { title: "Davet geri alındı", text: "Bu daveti gönderen kişi geri aldı." },
  dolu: { title: "Bu oda dolu", text: "Bu oyunda iki oyuncu var; davete senden önce başka biri katılmış olabilir." },
  kapali: { title: "Çevrimiçi oyun şu an kapalı", text: "Biraz sonra yeniden dene. Bu arada bilgisayara karşı oynayabilirsin." },
  surum: { title: "harfiyen güncellendi", text: "Devam etmek için sayfayı yenile." },
};

function RoomGone({ code, error }: { code: string; error: ErrorCode }): React.ReactElement {
  const { title, text } = GONE[error] ?? GONE.yok;
  return (
    <main className="gone">
      <section className="gone__card" role="alert">
        <p className="invite__kicker">Oda {code}</p>
        <h2 className="gone__title">{title}</h2>
        <p className="gone__text">{text}</p>
        <div className="gone__actions">
          {error === "surum" ? (
            <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
              Sayfayı yenile
            </button>
          ) : (
            <a className="button button--primary" href={HUB}>
              Oyunlarına dön
            </a>
          )}
          <a className="button" href="#/">
            Bilgisayara karşı oyna
          </a>
        </div>
      </section>
    </main>
  );
}

/** Before the room answers: the game's shape, empty, so nothing jumps when it arrives. */
function RoomLoading({ code, connection }: { code: string; connection: string }): React.ReactElement {
  return (
    <main className="stage room-loading" aria-busy="true">
      <section className="stage__board">
        <div className="stage__meta only-wide">
          <p className="stage__when">
            <span>Çevrimiçi</span>
            <span aria-hidden="true">·</span>
            <span className="stage__code">{code}</span>
          </p>
        </div>
        <div className="frame">
          <div className="skeleton-board" />
        </div>
        <div className="play">
          <p className="status status--wait" role="status">
            <span className="status__loading">
              {connection === "closed" ? "Sunucuya ulaşılamadı, yeniden deneniyor…" : "Oda açılıyor…"}
            </span>
          </p>
        </div>
      </section>
      <aside className="panel room-loading__panel" aria-hidden="true">
        <span className="skeleton-line" style={{ width: "40%" }} />
        <span className="skeleton-block" />
        <span className="skeleton-line" style={{ width: "70%" }} />
        <span className="skeleton-line" style={{ width: "55%" }} />
      </aside>
    </main>
  );
}
