import { randomName } from "@harfiyen/engine/name-words";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "../protocol.ts";
import { Avatar } from "./avatar.tsx";
import { BackIcon, CloseIcon, DiceIcon, EyeIcon, GoogleMark, MailIcon, Spinner } from "./icons.tsx";
import { loadedFirebase, loadFirebase, preloadFirebase } from "./load.ts";
import { accountMessage, MIN_PASSWORD, problemOf } from "./messages.ts";
import { CONSENT_VERSION, MIN_AGE } from "../protocol.ts";
import { cancelConsent, clearNotice, finishSignIn, useAccount } from "./store.ts";

/**
 * The account, in a sheet over the game: signing in (Google first, or an
 * email and a password), the email check a new password account goes
 * through, and once signed in the name, signing out and deleting it all.
 * Full-screen on a phone, a card in the middle elsewhere.
 */

type Banner = { tone: "info" | "error"; text: string };
type View =
  | { name: "start" }
  | { name: "reset" }
  | { name: "verify"; pending: FirebaseUser; banner: Banner | null; fresh: boolean; agreed: boolean }
  | { name: "delete" };

const PURPOSE = "Skorların ve oyunların cihazlar arasında seninle gelir.";
/** harfiyen's longest name (NAME_MAX); the server has the last word. */
const NAME_MAX = 24;

export function AccountSheet({ onClose }: { onClose: () => void }): React.ReactElement {
  const account = useAccount();
  const [view, setView] = useState<View>({ name: "start" });
  const [email, setEmail] = useState("");
  const [banner, setBanner] = useState<Banner | null>(null);

  // A redirect sign-in that came back wrong: said once, here.
  useEffect(() => {
    if (!account.notice) return;
    setBanner({ tone: "error", text: account.notice });
    clearNotice();
  }, [account.notice]);

  const user = account.status === "in" ? account.user : null;
  // Signed in, the account; signed out, wherever the sign-in had got to (a deletion just done ends at the start).
  const screen = user
    ? view.name === "delete"
      ? "delete"
      : "profile"
    : account.consent
      ? "consent"
      : account.status === "loading"
      ? "loading"
      : view.name === "delete"
        ? "start"
        : view.name;

  // Signing in may follow; Firebase starts downloading now so the click doesn't wait on it.
  useEffect(() => {
    if (screen === "start" || screen === "delete") preloadFirebase();
  }, [screen]);

  const title =
    screen === "profile"
      ? "Hesabın"
      : screen === "delete"
        ? "Hesabı sil"
        : screen === "verify"
          ? "E-postanı doğrula"
          : screen === "consent"
            ? "Hesap aç"
          : screen === "reset"
            ? "Şifreni sıfırla"
            : "Hesap";

  const back = (): void => {
    setBanner(null);
    setView({ name: "start" });
  };

  return (
    <Dialog title={title} screen={screen} onClose={onClose}>
      {screen === "loading" && (
        <div className="account-loading" role="status">
          <Spinner />
          <span>Hesap yükleniyor…</span>
        </div>
      )}
      {screen === "start" && (
        <SignIn
          email={email}
          setEmail={setEmail}
          banner={banner}
          onReset={() => {
            setBanner(null);
            setView({ name: "reset" });
          }}
          onVerify={(pending, note, fresh, agreed) => setView({ name: "verify", pending, banner: note, fresh, agreed })}
        />
      )}
      {screen === "reset" && <Reset email={email} setEmail={setEmail} onBack={back} />}
      {view.name === "verify" && screen === "verify" && (
        <Verify pending={view.pending} banner={view.banner} fresh={view.fresh} agreed={view.agreed} onBack={back} />
      )}
      {screen === "consent" && account.consent && <Consent pending={account.consent} />}
      {screen === "profile" && user && (
        <Profile user={user} onDelete={() => setView({ name: "delete" })} onSignedOut={onClose} />
      )}
      {screen === "delete" && user && (
        <Delete
          user={user}
          onCancel={() => setView({ name: "start" })}
          onDeleted={() => {
            setView({ name: "start" });
            setBanner({ tone: "info", text: "Hesabın silindi." });
          }}
        />
      )}
    </Dialog>
  );
}

/**
 * The modal frame: focus kept inside and given back on the way out, Esc and
 * the backdrop close it, the page behind stays still. Keys pressed in it go
 * no further than its own layer, so a game listening on the window (harfiyen
 * types letters onto its board) doesn't hear what's typed here.
 */
function Dialog({
  title,
  screen,
  onClose,
  children,
}: {
  title: string;
  screen: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const titleId = useId();
  const [layer] = useState(() => document.createElement("div"));
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  const pressedOutside = useRef(false);

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    layer.className = "account-layer";
    document.body.append(layer);
    closeRef.current?.focus({ preventScroll: true });
    const { body } = document;
    const overflow = body.style.overflow;
    body.style.overflow = "hidden";

    // After React has seen it (it listens on the layer), the key stops here.
    const onKey = (event: KeyboardEvent): void => {
      event.stopPropagation();
      const sheet = sheetRef.current;
      if (!sheet || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closing.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...sheet.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (document.activeElement === sheet) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Focus that wanders out (a click on the page behind can't, but a script might) comes back.
    const onFocus = (event: FocusEvent): void => {
      if (!layer.contains(event.target as Node)) sheetRef.current?.focus({ preventScroll: true });
    };
    layer.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      layer.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      layer.remove();
      body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [layer]);

  // A new view takes the focus with it when the old one held it.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
  }, [screen]);

  return createPortal(
    <div
      className="account-overlay"
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOutside.current) onClose();
      }}
    >
      <div
        className="account-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-screen={screen}
      >
        <header className="account-sheet__head">
          <h2 className="account-sheet__title" id={titleId}>
            {title}
          </h2>
          <button ref={closeRef} type="button" className="account-sheet__close" aria-label="Kapat" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="account-sheet__body">{children}</div>
      </div>
    </div>,
    layer,
  );
}

function Message({ banner }: { banner: Banner | null }): React.ReactElement | null {
  if (!banner) return null;
  return (
    <p className={`account-message account-message--${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"}>
      {banner.text}
    </p>
  );
}

function Fine(): React.ReactElement {
  return (
    <p className="account-fine">
      Hesap; adını, e-postanı ve oyun kayıtlarını tutar. İstediğin an silebilirsin.{" "}
      <a href="/gizlilik/">Gizlilik</a>
    </p>
  );
}

function SignIn({
  email,
  setEmail,
  banner,
  onReset,
  onVerify,
}: {
  email: string;
  setEmail: (email: string) => void;
  banner: Banner | null;
  onReset: () => void;
  onVerify: (pending: FirebaseUser, note: Banner | null, fresh: boolean, agreed: boolean) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [problem, setProblem] = useState<Banner | null>(banner);
  /** Which part of the sheet a complaint belongs under. */
  const [about, setAbout] = useState<"google" | "email">("google");
  const ids = useId();

  useEffect(() => {
    setProblem(banner);
    setAbout("google");
  }, [banner]);

  const complain = (where: "google" | "email", text: string): void => {
    setAbout(where);
    setProblem({ tone: "error", text });
  };

  const google = async (): Promise<void> => {
    setProblem(null);
    setBusy("google");
    let redirecting = false;
    try {
      // Straight through when Firebase is here already: a popup opens only close to the click.
      const kit = loadedFirebase() ?? (await loadFirebase());
      const outcome = await kit.signInWithGoogle();
      if (outcome.kind === "redirecting") redirecting = true;
      if (outcome.kind !== "user") return;
      const result = await finishSignIn(kit, outcome.user);
      if (result.kind === "error") complain("google", result.message);
    } catch (error) {
      complain("google", problemOf(error));
    } finally {
      if (!redirecting) setBusy(null);
    }
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return complain("email", "E-posta adresini yaz.");
    if (!password) return complain("email", "Şifreni yaz.");
    if (mode === "up" && password.length < MIN_PASSWORD) {
      return complain("email", `Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    }
    if (mode === "up" && !agreed) return complain("email", AGREE_FIRST);
    setProblem(null);
    setBusy("email");
    try {
      const kit = await loadFirebase();
      if (mode === "up") {
        const created = await kit.signUpWithPassword(address, password);
        let note: Banner | null = null;
        await kit.sendVerification(created).catch((error: unknown) => {
          note = { tone: "error", text: problemOf(error) };
        });
        onVerify(created, note, true, true);
        return;
      }
      const found = await kit.signInWithPassword(address, password);
      if (!found.emailVerified) return onVerify(found, null, false, false);
      const result = await finishSignIn(kit, found);
      if (result.kind === "verify") onVerify(found, null, false, false);
      else if (result.kind === "error") complain("email", result.message);
    } catch (error) {
      complain("email", problemOf(error));
    } finally {
      setBusy(null);
    }
  };

  const switchTo = (next: "in" | "up"): void => {
    setMode(next);
    setProblem(null);
  };

  return (
    <div className="account-signin">
      <p className="account-lead">{PURPOSE}</p>
      {problem?.tone === "info" && <Message banner={problem} />}

      <button
        type="button"
        className="account-btn account-google"
        onClick={google}
        disabled={busy !== null}
        aria-busy={busy === "google" || undefined}
      >
        {busy === "google" ? <Spinner /> : <GoogleMark />}
        <span>Google ile devam et</span>
      </button>
      {problem?.tone === "error" && about === "google" && <Message banner={problem} />}

      <div className="account-or" role="separator">
        <span>ya da</span>
      </div>

      <div className="account-switch" role="group" aria-label="E-postayla">
        <button
          type="button"
          aria-pressed={mode === "in"}
          className={`account-switch__tab${mode === "in" ? " is-on" : ""}`}
          onClick={() => switchTo("in")}
        >
          Giriş yap
        </button>
        <button
          type="button"
          aria-pressed={mode === "up"}
          className={`account-switch__tab${mode === "up" ? " is-on" : ""}`}
          onClick={() => switchTo("up")}
        >
          Hesap aç
        </button>
      </div>

      <form className="account-form" onSubmit={submit} noValidate>
        <label className="account-field">
          <span className="account-field__label">E-posta</span>
          <input
            className="account-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="account-field">
          <div className="account-field__row">
            <label className="account-field__label" htmlFor={`${ids}-password`}>
              Şifre
            </label>
            {mode === "in" ? (
              <button type="button" className="account-link" onClick={onReset}>
                Şifremi unuttum
              </button>
            ) : (
              <span className="account-field__hint" id={`${ids}-hint`}>
                En az {MIN_PASSWORD} karakter
              </span>
            )}
          </div>
          <div className="account-password">
            <input
              id={`${ids}-password`}
              className="account-input"
              type={shown ? "text" : "password"}
              name="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              aria-describedby={mode === "up" ? `${ids}-hint` : undefined}
              minLength={mode === "up" ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="account-password__toggle"
              aria-label={shown ? "Şifreyi gizle" : "Şifreyi göster"}
              title={shown ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={shown}
              onClick={() => setShown((on) => !on)}
            >
              <EyeIcon open={!shown} />
            </button>
          </div>
        </div>
        {mode === "up" && <AgreeBox checked={agreed} onChange={setAgreed} />}
        {problem?.tone === "error" && about === "email" && <Message banner={problem} />}
        <button
          type="submit"
          className="account-btn account-btn--primary"
          disabled={busy !== null}
          aria-busy={busy === "email" || undefined}
        >
          {busy === "email" && <Spinner />}
          {mode === "in" ? "Giriş yap" : "Hesap aç"}
        </button>
      </form>

      <Fine />
    </div>
  );
}

function Reset({
  email,
  setEmail,
  onBack,
}: {
  email: string;
  setEmail: (email: string) => void;
  onBack: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return setBanner({ tone: "error", text: "E-posta adresini yaz." });
    setBusy(true);
    setBanner(null);
    try {
      const kit = await loadFirebase();
      await kit.resetPassword(address);
      setBanner({ tone: "info", text: "E-posta gönderildi (böyle bir hesap varsa). Gelen kutuna bak." });
    } catch (error) {
      setBanner({ tone: "error", text: problemOf(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-reset">
      <p className="account-lead">Hesabının e-posta adresini yaz; şifreni yenilemen için bir bağlantı gönderelim.</p>
      <Message banner={banner} />
      <form className="account-form" onSubmit={submit} noValidate>
        <label className="account-field">
          <span className="account-field__label">E-posta</span>
          <input
            className="account-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit" className="account-btn account-btn--primary" disabled={busy} aria-busy={busy || undefined}>
          {busy && <Spinner />}
          Bağlantı gönder
        </button>
      </form>
      <button type="button" className="account-back" onClick={onBack}>
        <BackIcon />
        Girişe dön
      </button>
    </div>
  );
}

function Verify({
  pending,
  banner,
  fresh,
  agreed,
  onBack,
}: {
  pending: FirebaseUser;
  banner: Banner | null;
  /** Just made: the email is on its way. Otherwise an older account that never got verified. */
  fresh: boolean;
  /** The player agreed when signing up: the account opens as soon as the address checks out. */
  agreed: boolean;
  onBack: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [message, setMessage] = useState<Banner | null>(banner);
  const busyRef = useRef(false);

  const check = async (quiet: boolean): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("check");
    if (!quiet) setMessage(null);
    const notYet: Banner = { tone: "error", text: "Adresin henüz doğrulanmamış. E-postadaki bağlantıya tıklayıp yeniden dene." };
    try {
      const kit = await loadFirebase();
      if (!(await kit.reload(pending))) {
        if (!quiet) setMessage(notYet);
        return;
      }
      const result = await finishSignIn(kit, pending, true, agreed);
      if (result.kind === "verify") setMessage(notYet);
      else if (result.kind === "error") setMessage({ tone: "error", text: result.message });
    } catch (error) {
      if (!quiet) setMessage({ tone: "error", text: problemOf(error) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  // Back from the email in this same tab: look again without being asked.
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void checkRef.current(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const resend = async (): Promise<void> => {
    setBusy("send");
    setMessage(null);
    try {
      const kit = await loadFirebase();
      await kit.sendVerification(pending);
      setMessage({ tone: "info", text: "Doğrulama e-postası yeniden gönderildi." });
    } catch (error) {
      setMessage({ tone: "error", text: problemOf(error) });
    } finally {
      setBusy(null);
    }
  };

  const leave = async (): Promise<void> => {
    const kit = loadedFirebase();
    await kit?.leave().catch(() => {});
    onBack();
  };

  return (
    <div className="account-verify">
      <span className="account-verify__icon" aria-hidden="true">
        <MailIcon />
      </span>
      <p className="account-verify__text">
        {fresh ? (
          <>
            Doğrulama bağlantısını <strong>{pending.email}</strong> adresine gönderdik. Bağlantıya tıkla, sonra buraya dönüp
            “Doğruladım”a bas.
          </>
        ) : (
          <>
            <strong>{pending.email}</strong> adresi henüz doğrulanmamış. Gönderdiğimiz e-postadaki bağlantıya tıkla, sonra
            “Doğruladım”a bas.
          </>
        )}
      </p>
      <p className="account-verify__hint">E-posta gelmediyse gereksiz klasörüne de bak.</p>
      <Message banner={message} />
      <div className="account-stack">
        <button
          type="button"
          className="account-btn account-btn--primary"
          onClick={() => void check(false)}
          disabled={busy !== null}
          aria-busy={busy === "check" || undefined}
        >
          {busy === "check" && <Spinner />}
          Doğruladım
        </button>
        <button
          type="button"
          className="account-btn"
          onClick={resend}
          disabled={busy !== null}
          aria-busy={busy === "send" || undefined}
        >
          {busy === "send" && <Spinner />}
          Doğrulama e-postasını yeniden gönder
        </button>
      </div>
      <button type="button" className="account-back" onClick={leave}>
        <BackIcon />
        Başka bir yolla giriş yap
      </button>
    </div>
  );
}

const AGREE_FIRST = `Hesap açmak için ${MIN_AGE} yaşından büyük olduğunu ve gizlilik metnini okuduğunu onayla.`;

/** The say-so a new account is opened on: age and the notice, one box, never ticked for the player. */
function AgreeBox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }): React.ReactElement {
  return (
    <label className="account-agree">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {MIN_AGE} yaşından büyüğüm ve{" "}
        <a href="/gizlilik/" target="_blank" rel="noopener">
          gizlilik metnini
        </a>{" "}
        okudum.
      </span>
    </label>
  );
}

/**
 * A first sign-in, with Google or an address signed up elsewhere: Firebase
 * knows the player, the site has no account for them yet, and opens one
 * only once they agree.
 */
function Consent({ pending }: { pending: FirebaseUser }): React.ReactElement {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<"open" | "cancel" | null>(null);
  const [message, setMessage] = useState<Banner | null>(null);

  const open = async (): Promise<void> => {
    if (!agreed) return setMessage({ tone: "error", text: AGREE_FIRST });
    setBusy("open");
    setMessage(null);
    try {
      const kit = loadedFirebase() ?? (await loadFirebase());
      const result = await finishSignIn(kit, pending, true, true);
      if (result.kind === "error") setMessage({ tone: "error", text: result.message });
    } catch (error) {
      setMessage({ tone: "error", text: problemOf(error) });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (): Promise<void> => {
    setBusy("cancel");
    await cancelConsent();
  };

  return (
    <div className="account-consent" data-version={CONSENT_VERSION}>
      <p className="account-lead">
        {pending.email ? (
          <>
            <strong>{pending.email}</strong> ile ilk kez giriş yapıyorsun. akinozgen.com'da senin için bir hesap açılacak:
            adın, e-postan ve oyun kayıtların burada tutulur.
          </>
        ) : (
          <>İlk kez giriş yapıyorsun. akinozgen.com'da senin için bir hesap açılacak: adın, e-postan ve oyun kayıtların burada tutulur.</>
        )}
      </p>
      <AgreeBox checked={agreed} onChange={setAgreed} />
      <Message banner={message} />
      <div className="account-stack">
        <button
          type="button"
          className="account-btn account-btn--primary"
          onClick={open}
          disabled={busy !== null || !agreed}
          aria-busy={busy === "open" || undefined}
        >
          {busy === "open" && <Spinner />}
          Hesabı aç
        </button>
        <button type="button" className="account-btn" onClick={cancel} disabled={busy !== null}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

function Profile({
  user,
  onDelete,
  onSignedOut,
}: {
  user: User;
  onDelete: () => void;
  onSignedOut: () => void;
}): React.ReactElement {
  const account = useAccount();
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rolled, setRolled] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [leaveProblem, setLeaveProblem] = useState<string | null>(null);
  const dropping = useRef(false);
  const ids = useId();

  const value = draft ?? user.base;
  const save = async (words: string): Promise<void> => {
    const typed = words.replace(/\s+/g, " ").trim();
    if (typed === user.base) {
      setDraft(null);
      setProblem(null);
      return;
    }
    setSaving(true);
    const error = await account.rename(typed);
    setSaving(false);
    if (error) {
      setProblem(accountMessage(error));
    } else {
      setDraft(null);
      setProblem(null);
    }
  };

  const signOut = async (): Promise<void> => {
    setLeaving(true);
    setLeaveProblem(null);
    const error = await account.signOut();
    setLeaving(false);
    if (error) setLeaveProblem(accountMessage(error));
    else onSignedOut();
  };

  const google = user.provider === "google.com";
  return (
    <div className="account-profile">
      <div className="account-card">
        <div className="account-me">
          <Avatar user={draft === null ? user : { ...user, base: value || user.base }} size="lg" />
          <div className="account-me__text">
            <div className={`account-me__name${problem ? " is-bad" : ""}`}>
              <input
                className="account-me__input"
                value={value}
                size={Math.max(3, [...value].length + 1)}
                maxLength={NAME_MAX + 8}
                title="Adını değiştirmek için yaz"
                aria-label="Adın"
                aria-invalid={problem !== null}
                aria-describedby={`${ids}-caption`}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                disabled={saving}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setProblem(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    // Drops the edit; the sheet stays open.
                    event.preventDefault();
                    dropping.current = true;
                    setDraft(null);
                    setProblem(null);
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (dropping.current) dropping.current = false;
                  else if (draft !== null) void save(draft);
                }}
              />
              <span className="account-me__number">#{user.tag}</span>
              <button
                type="button"
                className="account-me__dice"
                aria-label="Rastgele ad"
                title="Rastgele ad"
                disabled={saving}
                style={{ rotate: `${rolled * 90}deg` }}
                onClick={() => {
                  const words = randomName();
                  setRolled((n) => n + 1);
                  setDraft(words);
                  setProblem(null);
                  void save(words);
                }}
              >
                <DiceIcon />
              </button>
            </div>
            {problem ? (
              <p className="account-me__problem" id={`${ids}-caption`} role="alert">
                {problem}
              </p>
            ) : (
              <p className="account-me__caption" id={`${ids}-caption`}>
                {saving ? "Kaydediliyor…" : "Bütün oyunlarda bu adla görünürsün."}
              </p>
            )}
          </div>
        </div>

        <div className="account-who">
          <span className="account-who__icon" aria-hidden="true">
            {google ? <GoogleMark /> : <MailIcon />}
          </span>
          <div className="account-who__text">
            <span className="account-who__email">{user.email ?? "E-posta yok"}</span>
            <span className="account-who__how">{google ? "Google hesabıyla" : "E-posta ve şifreyle"}</span>
          </div>
        </div>
      </div>

      <Message banner={leaveProblem ? { tone: "error", text: leaveProblem } : null} />
      <div className="account-actions">
        <button type="button" className="account-btn" onClick={signOut} disabled={leaving} aria-busy={leaving || undefined}>
          {leaving && <Spinner />}
          Çıkış yap
        </button>
        <button type="button" className="account-btn account-btn--quiet-danger" onClick={onDelete} disabled={leaving}>
          Hesabı sil
        </button>
      </div>

      <Fine />
    </div>
  );
}

function Delete({
  user,
  onCancel,
  onDeleted,
}: {
  user: User;
  onCancel: () => void;
  onDeleted: () => void;
}): React.ReactElement {
  const account = useAccount();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const google = user.provider === "google.com";
  const ids = useId();

  const confirm = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!google && !password) return setProblem("Şifreni yaz.");
    setBusy(true);
    setProblem(null);
    try {
      // Firebase deletes only after a fresh sign-in, so the player signs in once more.
      const kit = loadedFirebase() ?? (await loadFirebase());
      let found: FirebaseUser;
      if (google) {
        const outcome = await kit.signInWithGoogle({ hint: user.email, redirect: false });
        if (outcome.kind !== "user") return;
        found = outcome.user;
      } else {
        found = await kit.signInWithPassword(user.email ?? "", password);
      }
      // The same account as the session's, or nothing is deleted.
      if (user.email && found.email?.toLowerCase() !== user.email.toLowerCase()) {
        await kit.leave().catch(() => {});
        setProblem(`Bu, açık olan hesap değil. ${user.email} ile onayla.`);
        return;
      }
      const error = await account.remove();
      if (error) {
        await kit.leave().catch(() => {});
        setProblem(accountMessage(error));
        return;
      }
      // The site's half is gone; Firebase's follows. If that fails, a later sign-in just starts a new account.
      await kit.removeUser(found).catch(() => kit.leave().catch(() => {}));
      onDeleted();
    } catch (error) {
      setProblem(problemOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-delete" onSubmit={confirm} noValidate>
      <div className="account-warning">
        <strong>Bu geri alınamaz.</strong> Hesabın, adın ve bütün oyun kayıtların kalıcı olarak silinir.
      </div>
      {google ? (
        <p className="account-lead">Onaylamak için Google ile bir kez daha giriş yapacaksın.</p>
      ) : (
        <label className="account-field">
          <span className="account-field__label">Onaylamak için şifreni yaz</span>
          <input
            id={`${ids}-password`}
            className="account-input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      <Message banner={problem ? { tone: "error", text: problem } : null} />
      <div className="account-actions">
        <button type="button" className="account-btn" onClick={onCancel} disabled={busy}>
          Vazgeç
        </button>
        <button type="submit" className="account-btn account-btn--danger" disabled={busy} aria-busy={busy || undefined}>
          {busy && <Spinner />}
          Hesabı sil
        </button>
      </div>
    </form>
  );
}
