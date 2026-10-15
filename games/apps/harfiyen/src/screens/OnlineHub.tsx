import type { User } from "@akinozgen/account";
import { useAccount } from "@akinozgen/account/client";
import { CODE_PATTERN, cleanName, encode, NAME_MAX, NAME_MIN, VALUES } from "@harfiyen/engine";
import { randomName } from "@harfiyen/engine/name-words";
import { useEffect, useMemo, useRef, useState } from "react";
import { HistoryCard } from "../components/History.tsx";
import { Monogram } from "../components/Monogram.tsx";
import { PushOffer, PushStatus } from "../components/PushOffer.tsx";
import { SignInCard } from "../components/SignIn.tsx";
import { Tile } from "../components/Tile.tsx";
import { RulesIcon, TopBar } from "../components/TopBar.tsx";
import { ApiError, callApi } from "../game/api.ts";
import { useHistory } from "../game/history.ts";
import { groupGames, isYourTurn, type MyGame, type MyGamesApi, rememberGame } from "../game/myGames.ts";
import { splitName } from "../game/names.ts";
import { go } from "../game/route.ts";
import { ownerOf, type Session } from "../game/session.ts";
import { reloadForNewVersion } from "../game/socket.ts";
import { ago } from "../game/turkish.ts";
import { FALLBACK_AFTER, type Seek, useSeek } from "../game/useSeek.ts";
import type { SocketConstructor } from "../game/socket.ts";

/** A new invitation: the server makes the room and seats the signed-in account in it. */
export async function createInvite(): Promise<string> {
  const body = await callApi<{ code?: unknown }>("oda");
  if (typeof body.code !== "string" || !CODE_PATTERN.test(body.code)) throw new ApiError("bozuk", 200);
  rememberGame(body.code);
  return body.code;
}

function inviteProblem(code: string): string {
  if (code === "kapali") return "Çevrimiçi oyun şu an kapalı. Biraz sonra yeniden dene.";
  if (code === "surum") return "harfiyen güncellendi; sayfa yenileniyor…";
  return "Davet oluşturulamadı. Bağlantını kontrol edip yeniden dene.";
}

/**
 * The online games. Signed in: who you are, a way into a new game, the
 * games under way and the record of finished ones. Signed out: the card
 * that offers the sign-in, since online play goes with an account.
 */
export function OnlineHub({
  session,
  games,
  onRules,
  waiting,
  WebSocket,
}: {
  session: Session;
  games: MyGamesApi;
  onRules: () => void;
  waiting: number;
  /** For tests. */
  WebSocket?: SocketConstructor;
}): React.ReactElement {
  return (
    <>
      <TopBar section="online" waiting={waiting}>
        <button type="button" className="icon-button" aria-label="Nasıl oynanır" title="Nasıl oynanır" onClick={onRules}>
          <RulesIcon />
        </button>
      </TopBar>
      {session.status === "in" && session.user ? (
        <Hub key={ownerOf(session.user)} user={session.user} games={games} WebSocket={WebSocket} />
      ) : session.status === "out" ? (
        <SignInCard />
      ) : (
        // Asking who is signed in: a moment, with nothing on screen to jump about.
        <main className="hub" aria-busy="true" />
      )}
    </>
  );
}

function Hub({ user, games, WebSocket }: { user: User; games: MyGamesApi; WebSocket?: SocketConstructor }): React.ReactElement {
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seek = useSeek(
    (code) => {
      rememberGame(code);
      go(`#/oda/${code}`);
    },
    { WebSocket },
  );

  // Relative times move on while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // The record is asked for again once a game in the list has ended since.
  const ended = useMemo(
    () =>
      games.games
        .filter((game) => game.summary?.phase === "over")
        .map((game) => `${game.code}:${game.summary!.updatedAt}`)
        .sort()
        .join(","),
    [games.games],
  );
  const history = useHistory(ownerOf(user), ended);
  useEffect(() => setNow(Date.now()), [games.games, history.history]);

  const invite = async (): Promise<void> => {
    seek.stop();
    setProblem(null);
    setCreating(true);
    try {
      const code = await createInvite();
      go(`#/oda/${code}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "ag";
      // A session that's gone: the sign-in takes the screen.
      if (code !== "oturum") setProblem(inviteProblem(code));
      if (code === "surum") reloadForNewVersion();
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="hub">
      <div className="hub__side">
        <Me user={user} offered={games.games.length > 0} />
        <section className="hub-card start" aria-label="Yeni oyun">
          {seek.searching ? (
            <Searching seek={seek} creating={creating} onInvite={invite} />
          ) : (
            <>
              <h2 className="panel__title">Yeni oyun</h2>
              <button type="button" className="start__option start__option--primary" onClick={seek.start}>
                <span className="start__icon" aria-hidden="true">
                  <DiceIcon />
                </span>
                <span className="start__text">
                  <strong>Rastgele rakip</strong>
                  <small>Şu an arayan biriyle eşleş</small>
                </span>
                <Chevron />
              </button>
              <button type="button" className="start__option" onClick={invite} disabled={creating}>
                <span className="start__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
                    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1" />
                  </svg>
                </span>
                <span className="start__text">
                  <strong>{creating ? "Davet hazırlanıyor…" : "Arkadaşını çağır"}</strong>
                  <small>Link oluştur, istediğine gönder</small>
                </span>
                <Chevron />
              </button>
            </>
          )}
          {problem && (
            <p className="hub__problem" role="alert">
              {problem}
            </p>
          )}
        </section>
        {games.games.length > 0 && <PushOffer />}
        <p className="hub__fine muted">Oyunların ve geçmişin hesabında saklanır; başka bir cihazda giriş yapınca da seni bekler.</p>
      </div>

      <div className="hub__main">
        <Games games={games} now={now} />
        <HistoryCard state={history} now={now} />
      </div>
    </main>
  );
}

function Chevron(): React.ReactElement {
  return (
    <svg className="start__chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

const NAME_REFUSED = "Bu ad kullanılamaz.";

/** Why a name won't do, in a few words. */
function nameProblem(text: string): string {
  const length = [...text].length;
  if (length < NAME_MIN) return `Ad en az ${NAME_MIN} harf olmalı.`;
  if (length > NAME_MAX) return `Ad en çok ${NAME_MAX} harf olabilir.`;
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(text) || !/\p{L}/u.test(text)) return "Adda harf, rakam ve boşluk olabilir.";
  return NAME_REFUSED;
}

function DiceIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.3" />
      <circle cx="15.5" cy="15.5" r="1.3" />
      <circle cx="15.5" cy="8.5" r="1.3" />
      <circle cx="8.5" cy="15.5" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
    </svg>
  );
}

/**
 * Who you are online: the badge and the account's name — the words yours
 * to change, typed or rolled, the number fixed — and notices. The name is
 * the account's, the same in every game.
 */
function Me({ user, offered }: { user: User; offered: boolean }): React.ReactElement {
  const account = useAccount();
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rolled, setRolled] = useState(0);
  const dropping = useRef(false);

  const value = draft ?? user.base;
  /** Checked here for what's plain to see; the server has the last word. An empty name puts the default back. */
  const save = async (text: string): Promise<void> => {
    const typed = text.replace(/\s+/g, " ").trim();
    if (typed === user.base) {
      setDraft(null);
      setProblem(null);
      return;
    }
    if (typed !== "" && !cleanName(typed)) {
      setProblem(nameProblem(typed));
      return;
    }
    setProblem(null);
    setSaving(true);
    const error = await account.rename(typed);
    setSaving(false);
    if (!error) setDraft(null);
    // Signed out meanwhile: the sign-in takes the screen.
    else if (error !== "oturum") setProblem(error === "ad" ? NAME_REFUSED : "Ad kaydedilemedi. Bağlantını kontrol edip yeniden dene.");
  };

  return (
    <section className="hub-card me" aria-label="Adın">
      <Monogram name={draft === null ? user.name : `${value} #${user.tag}`} size="lg" />
      <div className="me__text">
        <div className={`me__name${problem ? " is-bad" : ""}`}>
          <input
            className="me__input"
            value={value}
            size={Math.max(3, [...value].length + 1)}
            maxLength={NAME_MAX + 8}
            title="Adını değiştirmek için yaz"
            aria-label="Adın"
            aria-invalid={problem !== null}
            aria-describedby={problem ? "me-problem" : undefined}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            readOnly={saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                dropping.current = true;
                setDraft(null);
                setProblem(null);
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              if (dropping.current) dropping.current = false;
              else if (draft !== null && !saving) void save(draft);
            }}
          />
          <span className="me__number">#{user.tag}</span>
          <button
            type="button"
            className="me__dice"
            aria-label="Rastgele ad"
            title="Rastgele ad"
            disabled={saving}
            style={{ rotate: `${rolled * 90}deg` }}
            onClick={() => {
              const words = randomName();
              setRolled((n) => n + 1);
              setDraft(words);
              void save(words);
            }}
          >
            <DiceIcon />
          </button>
        </div>
        {problem ? (
          <p className="me__problem" id="me-problem" role="alert">
            {problem}
          </p>
        ) : (
          <p className="me__caption">{saving ? "Kaydediliyor…" : "Hesabındaki adın"}</p>
        )}
        <PushStatus offered={offered} />
      </div>
    </section>
  );
}

function Searching({ seek, creating, onInvite }: { seek: Seek; creating: boolean; onInvite: () => void }): React.ReactElement {
  const { seekers, elapsed } = seek;
  const count =
    seek.connection !== "open" && seekers === null
      ? "Sunucuya bağlanıyor…"
      : seekers === null
        ? "Lobiye girdin…"
        : seekers <= 1
          ? "Şu an arayan yalnız sensin"
          : `Şu an ${seekers} kişi arıyor`;
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="seek">
      <div className="seek__head" role="status" aria-live="polite">
        <span className="seek__spinner" aria-hidden="true">
          <span />
        </span>
        <div className="seek__text">
          <p className="seek__title">Rakip aranıyor…</p>
          <p className="seek__count">{count}</p>
        </div>
        <span className="seek__time" aria-hidden="true">
          {time}
        </span>
      </div>
      {elapsed * 1000 >= FALLBACK_AFTER && (
        <div className="seek__fallback">
          <p>Şu an pek arayan yok. Aramaya devam ederken istersen:</p>
          <div className="seek__ways">
            <button type="button" className="button" onClick={onInvite} disabled={creating}>
              Oda kur, linki paylaş
            </button>
            <a className="button" href="#/">
              Bilgisayara karşı oyna
            </a>
          </div>
        </div>
      )}
      <button type="button" className="button seek__cancel" onClick={seek.stop}>
        Vazgeç
      </button>
    </div>
  );
}

const TILES = "sıra".split("").map((c) => encode(c)![0]);

function Games({ games, now }: { games: MyGamesApi; now: number }): React.ReactElement {
  const groups = groupGames(games.games);
  const active = groups.yours.length + groups.theirs.length + groups.invites.length;
  const [showOver, setShowOver] = useState<boolean | null>(null);
  const overOpen = showOver ?? active === 0;

  return (
    <section className="hub-card games" aria-labelledby="games-title">
      <header className="games__head">
        <h2 id="games-title" className="games__title">
          Oyunların
        </h2>
        {games.stale && <span className="games__stale">Liste güncellenemedi</span>}
      </header>

      {games.games.length === 0 ? (
        <div className="games__empty">
          <div className="games__tiles" aria-hidden="true">
            {TILES.map((letter, i) => (
              <Tile key={i} letter={letter} joker={false} value={VALUES[letter]} style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <p className="games__empty-title">Henüz çevrimiçi oyunun yok</p>
          <p className="games__empty-text">
            Çevrimiçi oyunlar sırayla oynanır, süre yok: hamleni yap, kapat, sıra sana gelince devam et.
          </p>
        </div>
      ) : (
        <>
          <Group title="Sıra sende" kind="yours" games={groups.yours} now={now} />
          <Group title="Sıra onda" kind="theirs" games={groups.theirs} now={now} />
          <Group title="Davet bekliyor" kind="invites" games={groups.invites} now={now} />
          {groups.over.length > 0 && (
            <section className="group group--over">
              <h3 className="group__title">
                <button type="button" className="group__toggle" aria-expanded={overOpen} onClick={() => setShowOver(!overOpen)}>
                  Bitenler <span className="group__count">{groups.over.length}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </button>
              </h3>
              {overOpen && <Rows games={groups.over} now={now} />}
            </section>
          )}
        </>
      )}
    </section>
  );
}

function Group({ title, kind, games, now }: { title: string; kind: string; games: MyGame[]; now: number }): React.ReactElement | null {
  if (games.length === 0) return null;
  return (
    <section className={`group group--${kind}`}>
      <h3 className="group__title">
        {title} <span className="group__count">{games.length}</span>
      </h3>
      <Rows games={games} now={now} />
    </section>
  );
}

function Rows({ games, now }: { games: MyGame[]; now: number }): React.ReactElement {
  return (
    <ul className="rows">
      {games.map((game) => (
        <li key={game.code}>
          <GameRow game={game} now={now} />
        </li>
      ))}
    </ul>
  );
}

function GameRow({ game, now }: { game: MyGame; now: number }): React.ReactElement {
  const s = game.summary;
  const you = s?.you ?? 0;
  const them = 1 - you;
  const opponent = s && s.phase !== "waiting" ? (s.names[them] ?? null) : null;
  const name = opponent ? splitName(opponent) : null;

  let chip: string;
  let tone: string;
  if (!s || s.phase === "waiting") {
    chip = "Davet";
    tone = "invite";
  } else if (s.phase === "over" && s.abandoned) {
    chip = "Kapandı";
    tone = "draw";
  } else if (s.phase === "over" && s.rematch?.[them] && !s.rematch?.[you]) {
    chip = "Rövanş istiyor";
    tone = "turn";
  } else if (s.phase === "over") {
    chip = s.winner === null ? "Berabere" : s.winner === you ? "Kazandın" : "Kaybettin";
    tone = s.winner === null ? "draw" : s.winner === you ? "won" : "lost";
  } else if (isYourTurn(s)) {
    chip = "Sıra sende";
    tone = "turn";
  } else {
    chip = "Sıra onda";
    tone = "wait";
  }

  return (
    <a className={`row row--${tone}`} href={`#/oda/${game.code}`}>
      <Monogram name={opponent} />
      <span className="row__name">
        {name ? (
          <>
            {name.base} <span className="row__number">#{name.number}</span>
          </>
        ) : (
          "Davet linki"
        )}
      </span>
      {s && s.phase !== "waiting" ? (
        <span className="row__score" aria-label={`Sen ${s.scores[you]}, rakip ${s.scores[them]}`}>
          <b>{s.scores[you]}</b>
          <i aria-hidden="true">–</i>
          <span>{s.scores[them]}</span>
        </span>
      ) : (
        <span className="row__code" aria-label={`Kod ${game.code}`}>
          {game.code}
        </span>
      )}
      <span className="row__when">{ago(s?.updatedAt ?? game.added, now)}</span>
      <span className={`chip chip--${tone}`}>{chip}</span>
    </a>
  );
}
