import { useState } from "react";
import { disablePush, type EnableResult, enablePush, snoozePush, usePush } from "../game/push.ts";

function BellIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

const DENIED = "Bildirimlere izin verilmedi. Açmak istersen adres çubuğundaki site ayarlarından bu siteye bildirim izni ver.";
const INSTALL = "Bildirim için önce harfiyen'i ana ekrana ekle: Paylaş → Ana Ekrana Ekle.";

/**
 * The offer to send a notice when it's the player's turn: asked only from
 * a tap, put away for two weeks by "Şimdi değil", and gone once answered.
 */
export function PushOffer({ invite = false, compact = false }: { invite?: boolean; compact?: boolean }): React.ReactElement | null {
  const push = usePush();
  const [result, setResult] = useState<EnableResult | null>(null);
  const [asking, setAsking] = useState(false);

  if (result === "denied") {
    return (
      <section className={`push-offer${compact ? " push-offer--compact" : ""}`} aria-label="Bildirimler">
        <span className="push-offer__icon" aria-hidden="true">
          <BellIcon />
        </span>
        <div className="push-offer__body">
          <p className="push-offer__text">{DENIED}</p>
          <div className="push-offer__actions">
            <button type="button" className="button" onClick={() => snoozePush()}>
              Tamam
            </button>
          </div>
        </div>
      </section>
    );
  }
  if (!push.available || push.on || push.snoozed || push.support === "none" || push.permission === "denied") return null;

  const enable = async (): Promise<void> => {
    setAsking(true);
    setResult(await enablePush());
    setAsking(false);
  };

  const text =
    push.support === "install"
      ? INSTALL
      : result === "failed"
        ? "Bildirimler açılamadı. Biraz sonra yeniden dene."
        : compact
          ? null
          : invite
            ? "Arkadaşın katılınca da haber veririz; sayfayı kapatsan bile."
            : "Sayfa kapalıyken de rakibin oynayınca haber veririz.";

  return (
    <section className={`push-offer${compact ? " push-offer--compact" : ""}`} aria-label="Bildirimler">
      <span className="push-offer__icon" aria-hidden="true">
        <BellIcon />
      </span>
      <div className="push-offer__body">
        <p className="push-offer__title">{invite ? "Arkadaşın katılınca haber verelim mi?" : "Sıra sana gelince haber verelim mi?"}</p>
        {text && <p className="push-offer__text">{text}</p>}
        <div className="push-offer__actions">
          {push.support === "ok" && (
            <button type="button" className="button button--primary" onClick={enable} disabled={asking}>
              Bildirimleri aç
            </button>
          )}
          <button type="button" className="button" onClick={() => snoozePush()}>
            Şimdi değil
          </button>
        </div>
      </div>
    </section>
  );
}

/** One line in the identity card: whether notices are on here, and the switch. `offered`: the offer card is on the page too. */
export function PushStatus({ offered = false }: { offered?: boolean }): React.ReactElement | null {
  const push = usePush();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!push.available || push.support === "none") return null;
  // The card already asks; one question at a time.
  if (offered && !push.on && !push.snoozed && push.permission !== "denied") return null;

  let text: string;
  let action: React.ReactNode = null;
  if (push.support === "install") {
    text = "Bildirim için: Paylaş → Ana Ekrana Ekle";
  } else if (push.on) {
    text = "Bildirimler açık";
    action = (
      <button type="button" className="link-button" onClick={() => void disablePush()}>
        Kapat
      </button>
    );
  } else if (push.permission === "denied") {
    text = "Bildirimler tarayıcıda engelli; site ayarlarından izin verebilirsin.";
  } else {
    text = failed ? "Bildirimler açılamadı." : "Bildirimler kapalı";
    action = (
      <button
        type="button"
        className="link-button"
        disabled={asking}
        onClick={async () => {
          setAsking(true);
          const result = await enablePush();
          setFailed(result === "failed");
          setAsking(false);
        }}
      >
        Aç
      </button>
    );
  }

  return (
    <p className={`push-status${push.on ? " is-on" : ""}`}>
      <BellIcon />
      <span>{text}</span>
      {action}
    </p>
  );
}
