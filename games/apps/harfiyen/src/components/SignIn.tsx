import { openAccountSheet } from "@akinozgen/account/client";
import { encode, VALUES } from "@harfiyen/engine";
import { Tile } from "./Tile.tsx";

const TILES = "giriş".split("").map((c) => encode(c)![0]);

/**
 * Online play needs an account: the card that says so, in place of the hub
 * or of a room opened by its link (the room's code on tiles, so it's clear
 * which one). The button opens the account's sign-in; once someone is
 * signed in, the screen behind the card carries on by itself.
 */
export function SignInCard({ code }: { code?: string }): React.ReactElement {
  return (
    <main className="gone signin">
      <section className="gone__card signin__card" aria-labelledby="signin-title">
        {code ? (
          <div className="signin__room">
            <p className="invite__kicker">Oda</p>
            <div className="invite__code" role="img" aria-label={`Oda kodu: ${code.split("").join(" ")}`}>
              {code.split("").map((char, i) => (
                <span key={i} className="code-tile" style={{ animationDelay: `${i * 40}ms` }}>
                  {char}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="games__tiles signin__tiles" aria-hidden="true">
            {TILES.map((letter, i) => (
              <Tile key={i} letter={letter} joker={false} value={VALUES[letter]} style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        )}
        <h2 id="signin-title" className="gone__title">
          {code ? "Bu oyunu oynamak için giriş yap" : "Çevrimiçi oynamak için giriş yap"}
        </h2>
        <p className="gone__text">Oyunların ve geçmişin hesabında saklanır; hangi cihazdan girersen gir seninle gelir.</p>
        <div className="gone__actions">
          <button type="button" className="button button--primary" onClick={openAccountSheet}>
            Giriş yap
          </button>
          <a className="button" href="#/">
            Bilgisayara karşı oyna
          </a>
        </div>
      </section>
    </main>
  );
}
