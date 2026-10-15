import { CHAT_MAX, type ChatLine } from "@harfiyen/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Chat } from "../game/useOnlineGame.ts";

/** Ready-made lines, sent with one tap. */
export const PHRASES = [
  "Merhaba!",
  "İyi oyunlar!",
  "Güzel hamle!",
  "Vay be!",
  "Şanslısın :)",
  "Bir düşüneyim…",
  "Hadi, sıra sende",
  "Tebrikler!",
  "İyi oyundu",
  "Rövanş?",
  "Sağ ol",
  "Kusura bakma",
] as const;

/** How long "nothing left of it" stays under the box. */
const EMPTY_NOTE_MS = 3000;
/** A typed line turned down this soon after it went comes back into the box, to send again. */
const RESTORE_WITHIN = 5000;
/** Scrolled this close to the end, the list keeps to the newest line. */
const STICK_WITHIN = 48;

const clock = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" });
const dateWithYear = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

const dayOf = (at: number): number => new Date(at).setHours(0, 0, 0, 0);

/** "Bugün", "Dün", or the date, for the line between days. */
function dayLabel(day: number, today: number): string {
  if (day === today) return "Bugün";
  if (day === new Date(today).setDate(new Date(today).getDate() - 1)) return "Dün";
  return new Date(day).getFullYear() === new Date(today).getFullYear() ? date.format(day) : dateWithYear.format(day);
}

/** Whether the page is in view: a hidden tab sees nothing. */
function usePageShown(): boolean {
  const [shown, setShown] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const update = (): void => setShown(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return shown;
}

/** The drawer's id, for the button that opens it. */
export const CHAT_ID = "harfiyen-sohbet";

/**
 * The chat with the other player, in a drawer of its own: down the right
 * edge beside the game on a computer (the board stays in play), the whole
 * screen on a phone. The lines so far fill it; the ready-made lines and the
 * box to type in sit at the bottom. Lines are only shown once the server
 * sends them back, so what's on screen is what was said. It stays mounted
 * while closed, so a half-typed line waits for the next time.
 */
export function ChatDrawer({
  chat,
  me,
  other,
  otherOnline,
  connected,
  open,
  wide,
  onClose,
}: {
  chat: Chat;
  /** This player's seat. */
  me: number;
  /** The other player's name. */
  other: string;
  otherOnline: boolean;
  /** The line to the server is up. */
  connected: boolean;
  open: boolean;
  /** Beside the game (a computer) rather than over it (a phone). */
  wide: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { lines, refused, see } = chat;
  const lastId = lines.length > 0 ? lines[lines.length - 1].id : 0;
  const [text, setText] = useState("");
  const typed = useRef<{ text: string; at: number } | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // Seen: the drawer open in a page in view, marked before the screen is drawn so no count flashes up.
  const pageShown = usePageShown();
  const shown = open && pageShown;
  useLayoutEffect(() => {
    if (shown && lastId > 0) see(lastId);
  }, [shown, lastId, see]);

  // Opened by the player, focus goes in: the box on a computer, the way back on a phone (no keyboard
  // pops up unasked). Closed, it goes back where it came from. Open from the start, it stays put.
  const returnTo = useRef<HTMLElement | null>(null);
  const was = useRef(open);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const drawer = drawerRef.current;
    if (open) {
      const active = document.activeElement as HTMLElement | null;
      returnTo.current = active && !drawer?.contains(active) && active !== document.body ? active : null;
      (wide ? inputRef.current : backRef.current)?.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || drawer?.contains(active)) {
      const back = returnTo.current?.isConnected ? returnTo.current : document.querySelector<HTMLElement>(`[aria-controls="${CHAT_ID}"]`);
      back?.focus({ preventScroll: true });
    }
    returnTo.current = null;
  }, [open]);

  // Beside the game on a wide screen, the page makes room for it (see the styles); on a phone it is the
  // screen: the page behind it holds still and takes no taps or keys.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    if (wide) {
      root.classList.add("has-chat-drawer");
      return () => root.classList.remove("has-chat-drawer");
    }
    const app = document.querySelector(".app");
    root.classList.add("is-chat-full");
    app?.setAttribute("inert", "");
    return () => {
      root.classList.remove("is-chat-full");
      app?.removeAttribute("inert");
    };
  }, [open, wide]);

  // On a phone the keyboard takes the bottom of the screen: the drawer keeps to what's left of it,
  // so the box stays above the keys.
  useEffect(() => {
    const viewport = window.visualViewport;
    const drawer = drawerRef.current;
    if (!open || wide || !viewport || !drawer) return;
    const fit = (): void => {
      drawer.style.setProperty("--chat-top", `${viewport.offsetTop}px`);
      drawer.style.setProperty("--chat-height", `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      drawer.style.removeProperty("--chat-top");
      drawer.style.removeProperty("--chat-height");
    };
  }, [open, wide]);

  // The list keeps to the newest line, unless the player has scrolled up to read; their own line
  // brings it down, and so does the list getting shorter (a keyboard coming up).
  const stick = useRef(true);
  const toEnd = (): void => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const onScroll = (): void => {
    const el = logRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_WITHIN;
  };
  useLayoutEffect(() => {
    if (stick.current || lines[lines.length - 1]?.from === me) toEnd();
    // Only when a line is added.
  }, [lastId]);
  useLayoutEffect(() => {
    if (open && stick.current) toEnd();
  }, [open]);
  useEffect(() => {
    const el = logRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stick.current) toEnd();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Lines that arrive while the chat is open come in with a little movement; the ones already there don't.
  const firstNew = useRef(lastId + 1);

  // A refusal says so under the box: how long to wait, counted down, or that nothing was left of the line.
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!refused) {
      setNote(null);
      return;
    }
    if (refused.until === 0) {
      setNote("Mesaj boş kaldı");
      const timer = setTimeout(() => setNote(null), EMPTY_NOTE_MS);
      return () => clearTimeout(timer);
    }
    const tick = (): boolean => {
      const left = Math.ceil((refused.until - Date.now()) / 1000);
      setNote(left > 0 ? `Biraz yavaş — ${left} sn` : null);
      return left > 0;
    };
    if (!tick()) return;
    const timer = setInterval(() => {
      if (!tick()) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [refused]);
  // Typed words turned down for haste aren't lost: they come back into the empty box.
  useEffect(() => {
    const last = typed.current;
    typed.current = null;
    if (!refused || refused.until === 0 || !last || Date.now() - last.at > RESTORE_WITHIN) return;
    setText((now) => (now === "" ? last.text : now));
  }, [refused]);
  const waiting = note !== null && refused !== null && refused.until > 0;
  const canSend = connected && !waiting;

  const send = (): void => {
    if (!canSend || !text.trim()) return;
    if (chat.say(text)) {
      typed.current = { text, at: Date.now() };
      setText("");
    }
  };
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    send();
  };
  // Enter sends, unless a keyboard is still composing a letter.
  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  const sayPhrase = (phrase: string): void => {
    if (canSend && chat.say(phrase)) typed.current = null;
  };
  // Keys pressed in the drawer are the drawer's: Escape closes it, and none of them reach the board.
  const onKey = (event: React.KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  // A mouse wheel scrolls the row of ready-made lines sideways.
  const phrasesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = phrasesRef.current;
    if (!row) return;
    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      const next = Math.max(0, Math.min(max, row.scrollLeft + event.deltaY));
      if (next === row.scrollLeft) return;
      event.preventDefault();
      row.scrollLeft = next;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  // A line between days, once the chat reaches back past today.
  const today = dayOf(Date.now());
  const days = lines.length > 0 && dayOf(lines[0].at) !== today;
  const left = CHAT_MAX - text.length;

  return (
    <aside
      ref={drawerRef}
      id={CHAT_ID}
      className={`chat-drawer${open ? " is-open" : ""}${wide ? "" : " is-full"}`}
      role="dialog"
      aria-modal={wide ? undefined : true}
      aria-labelledby={`${CHAT_ID}-title`}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={onKey}
    >
      <header className="chat-drawer__head">
        {!wide && (
          <button ref={backRef} type="button" className="chat-drawer__icon chat-drawer__back" aria-label="Sohbeti kapat" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5.5 8.5 12l6.5 6.5" />
            </svg>
          </button>
        )}
        <div className="chat-drawer__who">
          <h2 className="chat-drawer__title" id={`${CHAT_ID}-title`}>
            Sohbet
          </h2>
          <p className="chat-drawer__name">
            <span className={`chat-drawer__dot ${otherOnline ? "is-online" : "is-away"}`} aria-hidden="true" />
            <span className="chat-drawer__other">{other}</span>
            <span className="sr-only">{otherOnline ? ", burada" : ", şu an burada değil"}</span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={chat.muted}
          className={`chat-drawer__icon chat__mute${chat.muted ? " is-on" : ""}`}
          aria-label="Rakibin mesajlarını gizle"
          title={chat.muted ? "Rakibin mesajları gizli" : "Rakibin mesajlarını gizle"}
          disabled={!connected}
          onClick={() => chat.mute(!chat.muted)}
        >
          <MuteIcon />
        </button>
        {wide && (
          <button type="button" className="chat-drawer__icon" aria-label="Sohbeti kapat" title="Kapat" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        )}
      </header>

      <div ref={logRef} className="chat__log" role="log" aria-live="polite" aria-label="Mesajlar" tabIndex={0} onScroll={onScroll}>
        {lines.length === 0 ? (
          <div className="chat__empty">
            <ChatIcon />
            <p>{chat.muted ? "Gösterilecek mesaj yok." : "Henüz mesaj yok."}</p>
            {!chat.muted && <p className="muted">Bir selam ver; aşağıdaki hazır mesajlar tek dokunuşla gider.</p>}
          </div>
        ) : (
          <ol className="chat__lines">
            {lines.map((line, i) => {
              const day = dayOf(line.at);
              const newDay = days && (i === 0 || dayOf(lines[i - 1].at) !== day);
              return (
                <ChatRow
                  key={line.id}
                  line={line}
                  who={line.from === me ? null : other}
                  fresh={line.id >= firstNew.current}
                  day={newDay ? dayLabel(day, today) : null}
                />
              );
            })}
          </ol>
        )}
      </div>

      <footer className="chat-drawer__foot">
        <div ref={phrasesRef} className="chat__phrases" role="group" aria-label="Hazır mesajlar">
          {PHRASES.map((phrase) => (
            <button key={phrase} type="button" className="phrase" disabled={!canSend} onClick={() => sayPhrase(phrase)}>
              {phrase}
            </button>
          ))}
        </div>
        <form className="chat__form" onSubmit={submit}>
          <input
            ref={inputRef}
            className={`chat__input${left <= 20 ? " is-long" : ""}`}
            type="text"
            value={text}
            maxLength={CHAT_MAX}
            placeholder="Bir şey yaz…"
            aria-label="Mesaj"
            autoComplete="off"
            enterKeyHint="send"
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={onInputKey}
          />
          {left <= 20 && (
            <span className="chat__left" aria-hidden="true">
              {left}
            </span>
          )}
          <button type="submit" className="chat__send" aria-label="Gönder" title="Gönder" disabled={!canSend || !text.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.5 3.5 10.6 13.4M20.5 3.5l-6.3 17-3.6-7.1-7.1-3.6z" />
            </svg>
          </button>
        </form>
        {/* Always there, so what it says is read out when it changes. */}
        <p className={`chat__note${waiting ? " is-waiting" : ""}`} role="status">
          {note}
        </p>
        {chat.muted && <p className="chat__muted">Rakibinin mesajları gizli; bundan haberi olmaz.</p>}
      </footer>
    </aside>
  );
}

/** One line, its time, and — when it starts a new day — the day above it. `who` is null for the player's own. */
function ChatRow({ line, who, fresh, day }: { line: ChatLine; who: string | null; fresh: boolean; day: string | null }): React.ReactElement {
  return (
    <>
      {day && (
        <li className="chat__day">
          <span>{day}</span>
        </li>
      )}
      <li className={`chat__line chat__line--${who === null ? "you" : "them"}${fresh ? " is-new" : ""}`}>
        <span className="sr-only">{who ?? "Sen"}: </span>
        {line.text}
        <time className="chat__time" dateTime={new Date(line.at).toISOString()}>
          {clock.format(line.at)}
        </time>
      </li>
    </>
  );
}

export function ChatIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 19.5V7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v6.5A2.5 2.5 0 0 1 17 16H8z" />
      <path d="M8.75 10.25h.01M12 10.25h.01M15.25 10.25h.01" />
    </svg>
  );
}

/** The chat's bubble, struck through: the other's lines hidden. */
function MuteIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 19.5V7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v6.5A2.5 2.5 0 0 1 17 16H8z" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

/** The chat's way in from the top bar, and out again, with what's unread on it. */
export function ChatButton({ unread, open, onToggle }: { unread: number; open: boolean; onToggle: () => void }): React.ReactElement {
  const label = unread > 0 ? `Sohbet, ${unread} okunmamış mesaj` : "Sohbet";
  return (
    <button
      type="button"
      className={`icon-button room-chat${open ? " is-on" : ""}`}
      aria-label={label}
      title={open ? "Sohbeti kapat" : "Sohbet"}
      aria-expanded={open}
      aria-controls={CHAT_ID}
      onClick={onToggle}
    >
      <ChatIcon />
      {unread > 0 && (
        <span key={unread} className="room-chat__badge" aria-hidden="true">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
