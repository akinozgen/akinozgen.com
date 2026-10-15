import { useEffect, useState } from "react";
import { Avatar, PersonIcon } from "./avatar.tsx";
import { useAccount } from "./store.ts";

type SheetModule = typeof import("./AccountSheet.tsx");

/**
 * The sheet is most of the account's code, and most visits never open it:
 * it comes in its own small file, asked for when the pointer reaches the
 * button and certainly by the click.
 */
let sheet: SheetModule | null = null;
let sheetLoading: Promise<SheetModule> | null = null;

function loadSheet(): Promise<SheetModule> {
  sheetLoading ??= import("./AccountSheet.tsx").then(
    (loaded) => (sheet = loaded),
    (error: unknown) => {
      sheetLoading = null;
      throw error;
    },
  );
  return sheetLoading;
}

const prefetchSheet = (): void => void loadSheet().catch(() => {});

const OPEN_EVENT = "hesap:ac";

/**
 * Opens the account sheet from anywhere on the page — a game's "sign in to
 * play online" card, say — through the top bar's button, which owns it.
 */
export function openAccountSheet(): void {
  prefetchSheet();
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The account in a game's top bar, in the bar's own round button: a person
 * while nobody is signed in, the player's initial once they are. Either way
 * it opens the account sheet.
 */
export function AccountButton(): React.ReactElement {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [, setLoaded] = useState<SheetModule | null>(sheet);

  const show = (): void => {
    setOpen(true);
    if (!sheet) loadSheet().then(setLoaded, () => setOpen(false));
  };

  // A sign-in that went off to Google and came back wrong: the sheet says why.
  useEffect(() => {
    if (account.notice) show();
  }, [account.notice]);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  const user = account.status === "in" ? account.user : null;
  const label = user ? user.name : "Giriş yap";
  const Sheet = open ? sheet?.AccountSheet : undefined;
  return (
    <>
      <button
        type="button"
        className={`icon-button account-button${user ? " account-button--in" : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-busy={account.status === "loading" || (open && !Sheet) || undefined}
        onPointerEnter={prefetchSheet}
        onFocus={prefetchSheet}
        onClick={show}
      >
        {user ? <Avatar user={user} /> : <PersonIcon />}
      </button>
      {Sheet && <Sheet onClose={() => setOpen(false)} />}
    </>
  );
}
