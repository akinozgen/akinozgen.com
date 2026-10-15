import { type BoardKind, type Table, JOKER, letterIndex, LETTERS, type Level, nextIdleEnds, upper, VALUES } from "@harfiyen/engine";
import { useState } from "react";
import { BagView } from "./BagView.tsx";
import { LEVEL_NAME } from "./Scores.tsx";
import { Sheet } from "./Sheet.tsx";
import { Tile, tileName } from "./Tile.tsx";

/** A joker goes down as any letter; this asks which. */
export function JokerPicker({ onPick, onCancel }: { onPick: (letter: number) => void; onCancel: () => void }): React.ReactElement {
  return (
    <Sheet title="Joker hangi harf olsun?" onClose={onCancel}>
      <p className="muted">Joker istediğin harfin yerine geçer, ama puanı sıfırdır.</p>
      <div className="letters">
        {LETTERS.map((letter, i) => (
          <button key={letter} type="button" className="letters__one" aria-label={upper(letter)} onClick={() => onPick(i)}>
            <Tile letter={i} joker={false} value={0} className="tile--plain" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Pick tiles to put back in the bag for new ones; the turn goes with them. */
export function SwapSheet({
  view,
  free,
  values,
  bag,
  ends,
  onSwap,
  onClose,
}: {
  view: readonly number[];
  free: readonly number[];
  values: readonly number[];
  bag: number;
  /** This swap would be the idle turn that ends the game. */
  ends: boolean;
  onSwap: (slots: number[]) => void;
  onClose: () => void;
}): React.ReactElement {
  const [chosen, setChosen] = useState<number[]>([]);
  const allowed = bag >= 7;
  const everything = chosen.length === free.length;
  return (
    <Sheet
      title="Harf değiştir"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="button"
            disabled={!allowed}
            onClick={() => setChosen(everything ? [] : [...free])}
          >
            {everything ? "Hiçbiri" : "Hepsi"}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!allowed || chosen.length === 0}
            onClick={() => onSwap(chosen)}
          >
            {chosen.length > 0 ? `${chosen.length} harfi değiştir` : "Harf seç"}
          </button>
        </>
      }
    >
      {allowed ? (
        <>
          <p className="muted">Değiştirmek istediklerine dokun. Torbaya dönerler, yerlerine yenileri gelir; sıran da geçer.</p>
          {ends && (
            <p className="notice">
              Dikkat: bu, art arda dördüncü pas ya da değiştirme olur. Oyun burada biter, puanlar olduğu gibi kalır.
            </p>
          )}
        </>
      ) : (
        <p className="notice">Torbada 7'den az taş kaldı, artık değiştirilemez.</p>
      )}
      <div className="swap">
        {free.map((slot) => {
          const tile = view[slot];
          const on = chosen.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              className={`swap__tile${on ? " is-on" : ""}`}
              aria-pressed={on}
              aria-label={tileName(tile === JOKER ? -1 : tile, tile === JOKER, tile === JOKER ? 0 : values[tile])}
              disabled={!allowed}
              onClick={() => setChosen((before) => (on ? before.filter((s) => s !== slot) : [...before, slot]))}
            >
              <Tile letter={tile === JOKER ? -1 : tile} joker={tile === JOKER} value={tile === JOKER ? 0 : values[tile]} />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** The tiles you haven't seen yet: the bag and the computer's rack together. */
export function BagSheet({ game, onClose }: { game: Table; onClose: () => void }): React.ReactElement {
  return (
    <Sheet title="Torba" onClose={onClose}>
      <BagView game={game} />
    </Sheet>
  );
}

const LEVELS: { id: Level; text: string; bars: number }[] = [
  { id: "kolay", text: "Kısa, gündelik kelimeler; çoğu zaman en iyisini kaçırır.", bars: 1 },
  { id: "orta", text: "İyi hamleler bulur, ara sıra fırsat kaçırır.", bars: 2 },
  { id: "zor", text: "Bildiği kelimelerle en yüksek puanı oynar.", bars: 3 },
];

/** A little picture of a board: the fixed one, or a different one every game. */
function BoardPicture({ kind }: { kind: BoardKind }): React.ReactElement {
  const classic = ["k3", "", "h2", "", "k3", "", "k2", "", "k2", "", "h2", "", "s", "", "h2", "", "k2", "", "k2", "", "k3", "", "h2", "", "k3"];
  const mixed = ["", "h3", "", "k2", "", "k3", "", "h2", "", "", "", "h2", "s", "h2", "", "", "", "h2", "", "k3", "", "k2", "", "h3", ""];
  return (
    <span className="boardpic" aria-hidden="true">
      {(kind === "klasik" ? classic : mixed).map((c, i) => (
        <i key={i} className={c ? `boardpic--${c}` : ""} />
      ))}
    </span>
  );
}

export function NewGameSheet({
  level,
  kind,
  playing,
  onStart,
  onClose,
}: {
  level: Level;
  kind: BoardKind;
  playing: boolean;
  onStart: (level: Level, kind: BoardKind) => void;
  onClose: () => void;
}): React.ReactElement {
  const [choice, setChoice] = useState<Level>(level);
  const [board, setBoard] = useState<BoardKind>(kind);
  return (
    <Sheet
      title="Yeni oyun"
      onClose={onClose}
      footer={
        <button type="button" className="button button--primary" onClick={() => onStart(choice, board)}>
          Başla
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      }
    >
      {playing && <p className="notice newgame__notice">Süren oyun kapanır, istatistiğe sayılmaz.</p>}
      <h3>Rakip</h3>
      <div className="choices" role="radiogroup" aria-label="Rakip">
        {LEVELS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choice === option.id}
            className={`choice${choice === option.id ? " is-on" : ""}`}
            onClick={() => setChoice(option.id)}
          >
            <span className="choice__bars" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= option.bars ? "is-on" : ""} />
              ))}
            </span>
            <span className="choice__text">
              <strong>{LEVEL_NAME[option.id]}</strong>
              <span>{option.text}</span>
            </span>
          </button>
        ))}
      </div>
      <h3>Tahta</h3>
      <div className="choices choices--two" role="radiogroup" aria-label="Tahta">
        {(
          [
            ["klasik", "Klasik tahta", "Herkesin bildiği sabit dizilim."],
            ["karisik", "Karışık tahta", "Her oyunda yeni, simetrik bir dizilim; renkli karelerin sayısı aynı."],
          ] as const
        ).map(([id, title, text]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={board === id}
            className={`choice choice--board${board === id ? " is-on" : ""}`}
            onClick={() => setBoard(id)}
          >
            <BoardPicture kind={id} />
            <span className="choice__text">
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="muted">Bilgisayar yalnızca gündelik kelimeleri oynar; sen sözlükteki her kelimeyi oynayabilirsin.</p>
    </Sheet>
  );
}

/** KALEM across, YAZ coming down through its A: the move a turn is. */
function Demo(): React.ReactElement {
  const tiles = new Map<number, { char: string; fresh: boolean }>();
  [..."kalem"].forEach((char, i) => tiles.set(2 * 7 + 1 + i, { char, fresh: false }));
  tiles.set(1 * 7 + 2, { char: "y", fresh: true });
  tiles.set(3 * 7 + 2, { char: "z", fresh: true });
  const premium: Record<number, string> = { 0: "k3", 3: "h2", 6: "k3", 12: "h3", 21: "h2", 25: "k2", 28: "k3", 31: "h3", 34: "k3" };
  return (
    <div className="demo" aria-hidden="true">
      {Array.from({ length: 35 }, (_, i) => {
        const tile = tiles.get(i);
        const kind = premium[i];
        return (
          <span key={i} className={`demo__cell${kind ? ` cell--${kind}` : ""}`}>
            {tile ? (
              <Tile
                letter={letterIndex(tile.char)}
                joker={false}
                value={VALUES[letterIndex(tile.char)]}
                className={tile.fresh ? "demo__drop" : ""}
                style={tile.fresh ? { animationDelay: i > 14 ? "180ms" : "0ms" } : undefined}
              />
            ) : kind === "k2" ? (
              "K²"
            ) : kind === "k3" ? (
              "K³"
            ) : kind === "h2" ? (
              "H²"
            ) : kind === "h3" ? (
              "H³"
            ) : null}
            {i === 3 * 7 + 2 && <span className="bubble bubble--ok bubble--down demo__bubble">{[..."yaz"].reduce((sum, char) => sum + VALUES[letterIndex(char)], 0)}</span>}
          </span>
        );
      })}
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <Sheet
      title="Nasıl oynanır"
      onClose={onClose}
      footer={
        <button type="button" className="button button--primary" onClick={onClose}>
          Anladım
        </button>
      }
    >
      <p className="rules__lead">
        Elindeki yedi harfle tahtaya kelime kur, tahtadakilere bağla. Torba bitip biri elini bitirince oyun biter; puanı çok olan
        kazanır.
      </p>
      <Demo />
      <h3>Harf koymak</h3>
      <p>
        Bir harfe dokun, sonra bir kareye; ya da sürükle. Bu tur koyduğun harfe dokunursan ele döner. Harfler tek satırda ya da tek
        sütunda, aralarında boşluk olmadan durmalı. İlk kelime ortadaki başlangıç karesinden geçer, sonrakiler tahtadaki bir harfe değer. Puan
        kelimenin ucunda belirir: yeşilse geçerli, kırmızıysa sözlükte yok.
      </p>
      <h3>Renkli kareler</h3>
      <ul className="legend">
        <li>
          <span className="legend__cell cell--h2">H²</span> üstüne konan harfin puanı iki kat
        </li>
        <li>
          <span className="legend__cell cell--h3">H³</span> harfin puanı üç kat
        </li>
        <li>
          <span className="legend__cell cell--k2">K²</span> bütün kelimenin puanı iki kat
        </li>
        <li>
          <span className="legend__cell cell--k3">K³</span> bütün kelimenin puanı üç kat
        </li>
        <li>
          <span className="legend__cell cell--star">★</span> hamleye 25 puan ekler; her oyunda başka bir yerde çıkar
        </li>
      </ul>
      <p>Kareler yalnızca üstüne ilk harf konduğu turda sayılır. Yedi harfin hepsini bir hamlede koyarsan +30.</p>
      <h3>Joker</h3>
      <p>Torbada iki joker (?) var: istediğin harf olur ama puanı sıfırdır.</p>
      <h3>Sıkışınca</h3>
      <p>
        Harflerini torbadakilerle değiştirebilir ya da pas geçebilirsin; ikisi de sıranı harcar. Torbada 20'den az taş varken art
        arda dört pas ya da değiştirme olursa oyun olduğu gibi biter. Biri elini bitirince, rakibin elinde kalan harflerin puanı
        ondan düşülüp bitirene eklenir.
      </p>
      <h3>Klavyeyle</h3>
      <p className="muted">
        Tahtada bir kareye gel (ok tuşlarıyla gezilir) ve harfleri yaz: elindeki taşlar sırayla dizilir. Boşluk yönü çevirir,
        Backspace son harfi geri alır, Enter oynar, Esc hepsini geri alır.
      </p>
    </Sheet>
  );
}

/** Passing, confirmed — and said plainly when this pass would end the game. */
export function PassSheet({
  game,
  onPass,
  onClose,
}: {
  game: Table;
  onPass: () => void;
  onClose: () => void;
}): React.ReactElement {
  const idle = game.idle + 1;
  const ends = nextIdleEnds(game.idle, game.bagCount);
  const lead = game.scores[game.seat] - game.scores[1 - game.seat];
  return (
    <Sheet
      title={ends ? "Bu pas oyunu bitirir" : "Pas geçilsin mi?"}
      onClose={onClose}
      footer={
        <div className="sheet__buttons">
          <button type="button" className="button" onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className={`button ${ends ? "button--danger" : "button--primary"}`} onClick={onPass}>
            {ends ? "Pas geç ve bitir" : "Pas geç"}
          </button>
        </div>
      }
    >
      {ends ? (
        <p>
          Art arda {idle}. pas ya da değiştirme olur; oyun burada biter ve puanlar olduğu gibi kalır.{" "}
          {lead > 0 ? `Şu an ${lead} puan öndesin.` : lead < 0 ? `Şu an ${-lead} puan geridesin.` : "Şu an berabersiniz."}
        </p>
      ) : (
        <p>Sıra bilgisayara geçer, bu tur puan almazsın.</p>
      )}
    </Sheet>
  );
}
