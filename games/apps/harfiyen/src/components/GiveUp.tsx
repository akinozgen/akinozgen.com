import { useState } from "react";

/** Resigning, with a second press to be sure. */
export function GiveUp({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }): React.ReactElement {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="button giveup" disabled={disabled} onClick={() => setAsking(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
        </svg>
        Pes et
      </button>
    );
  }
  return (
    <div className="giveup giveup--asking" role="group" aria-label="Pes etmek istiyor musun?">
      <p className="giveup__ask">Pes etmek istiyor musun? Oyun kaybedilmiş sayılır.</p>
      <div className="giveup__row">
        <button type="button" className="button" onClick={() => setAsking(false)} autoFocus>
          Vazgeç
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          Pes et
        </button>
      </div>
    </div>
  );
}
