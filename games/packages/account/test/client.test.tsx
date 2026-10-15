// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountButton, resetAccountCache } from "../src/client/index.ts";
import type { User } from "../src/protocol.ts";

/**
 * The client against a fake server (fetch) and a fake Firebase (both
 * modules mocked). The mocks count their own loading, so the tests can see
 * that Firebase stays undownloaded until someone opens the sign-in.
 */

const firebase = vi.hoisted(() => ({
  loaded: { app: 0, auth: 0 },
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("firebase/app", () => {
  firebase.loaded.app++;
  return { initializeApp: () => ({ name: "app" }), getApps: () => [], getApp: () => ({ name: "app" }) };
});

vi.mock("firebase/auth", () => {
  firebase.loaded.auth++;
  return {
    getAuth: () => ({ languageCode: null }),
    GoogleAuthProvider: class {
      setCustomParameters(): void {}
    },
    signInWithPopup: (...args: unknown[]) => firebase.signInWithPopup(...args),
    signInWithRedirect: (...args: unknown[]) => firebase.signInWithRedirect(...args),
    getRedirectResult: (...args: unknown[]) => firebase.getRedirectResult(...args),
    signInWithEmailAndPassword: (...args: unknown[]) => firebase.signInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args: unknown[]) => firebase.createUserWithEmailAndPassword(...args),
    sendEmailVerification: (...args: unknown[]) => firebase.sendEmailVerification(...args),
    sendPasswordResetEmail: (...args: unknown[]) => firebase.sendPasswordResetEmail(...args),
    signOut: (...args: unknown[]) => firebase.signOut(...args),
    deleteUser: (...args: unknown[]) => firebase.deleteUser(...args),
  };
});

const ME: User = {
  name: "Neşeli Kirpi #4821",
  base: "Neşeli Kirpi",
  tag: "4821",
  chosen: null,
  email: "oyuncu@example.com",
  provider: "google.com",
  createdAt: 1,
};

/** A Firebase user as the page sees one. */
function firebaseUser(email = ME.email!, emailVerified = true) {
  return {
    email,
    emailVerified,
    getIdToken: vi.fn(async () => "id-token-1"),
    reload: vi.fn(async () => {}),
  };
}

type Call = { path: string; headers: Headers; order: number };
let order = 0;
let calls: Call[] = [];
/** The fake server: what each endpoint answers, as [status, body]. */
let answers: Record<string, () => [number, unknown] | Promise<[number, unknown]>> = {};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  answers = {
    ben: () => [200, { user: null }],
    giris: () => [200, { user: ME }],
    cikis: () => [200, { ok: true }],
    sil: () => [200, { ok: true }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const path = url.pathname.replace(/^\/api\/hesap\//, "");
      calls.push({ path: `${path}${url.search}`, headers: new Headers(init?.headers), order: order++ });
      const answer = answers[path];
      return answer ? json(...(await answer())) : json(404, { error: "yok" });
    }),
  );
  for (const mock of Object.values(firebase)) if (typeof mock === "function") mock.mockReset();
  firebase.signOut.mockImplementation(async () => {
    calls.push({ path: "firebase:signOut", headers: new Headers(), order: order++ });
  });
  firebase.sendEmailVerification.mockResolvedValue(undefined);
  firebase.sendPasswordResetEmail.mockResolvedValue(undefined);
  firebase.deleteUser.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetAccountCache();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

const button = (name: string | RegExp) => screen.findByRole("button", { name });
/** The form's own button, named like the switch above it. */
const submit = (sheet: HTMLElement) => sheet.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const dialog = () => screen.findByRole("dialog");

async function openSignIn(): Promise<HTMLElement> {
  render(<AccountButton />);
  fireEvent.click(await button("Giriş yap"));
  return dialog();
}

describe("the account button", () => {
  it("says Giriş yap when nobody is signed in, without downloading Firebase", async () => {
    render(<AccountButton />);
    expect(await button("Giriş yap")).toBeTruthy();
    expect(calls.map((call) => call.path)).toEqual(["ben"]);
    expect(calls[0].headers.get("X-Hesap")).toBe("1");
    expect(firebase.loaded).toEqual({ app: 0, auth: 0 });
  });

  it("shows the initial of a signed-in player's name", async () => {
    answers.ben = () => [200, { user: ME }];
    render(<AccountButton />);
    const avatar = await button(ME.name);
    expect(avatar.textContent).toBe("N");
    expect(avatar.getAttribute("title")).toBe(ME.name);
  });

  it("keeps keys typed in the sheet from the game, closes on Escape and gives the focus back", async () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    try {
      render(<AccountButton />);
      const opener = await button("Giriş yap");
      opener.focus();
      fireEvent.click(opener);
      const sheet = await dialog();
      fireEvent.keyDown(within(sheet).getByLabelText("E-posta"), { key: "a" });
      expect(heard).not.toHaveBeenCalled();
      fireEvent.keyDown(sheet, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.activeElement).toBe(opener);
    } finally {
      window.removeEventListener("keydown", heard);
    }
  });

  it("treats a missing API (404) as signed out", async () => {
    delete answers.ben;
    render(<AccountButton />);
    expect(await button("Giriş yap")).toBeTruthy();
  });

  it("paints the player kept for the visit before the server answers", async () => {
    sessionStorage.setItem("hesap:ben:v1", JSON.stringify(ME));
    resetAccountCache();
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    answers.ben = async () => {
      await held;
      return [200, { user: null }];
    };
    render(<AccountButton />);
    expect(screen.getByRole("button", { name: ME.name })).toBeTruthy();
    answer();
    expect(await button("Giriş yap")).toBeTruthy();
    expect(sessionStorage.getItem("hesap:ben:v1")).toBeNull();
  });
});

describe("signing in with Google", () => {
  it("trades the token for a session, signs out of Firebase, and shows the player", async () => {
    const found = firebaseUser();
    firebase.signInWithPopup.mockResolvedValue({ user: found });
    const sheet = await openSignIn();
    fireEvent.click(within(sheet).getByRole("button", { name: "Google ile devam et" }));

    expect(await screen.findByRole("heading", { name: "Hesabın" })).toBeTruthy();
    const giris = calls.find((call) => call.path === "giris")!;
    expect(giris.headers.get("Authorization")).toBe("Bearer id-token-1");
    expect(giris.headers.get("X-Hesap")).toBe("1");
    const out = calls.find((call) => call.path === "firebase:signOut")!;
    expect(out.order).toBeGreaterThan(giris.order);
    expect(screen.getByRole("button", { name: ME.name })).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("hesap:ben:v1")!)).toEqual(ME);
    expect(firebase.loaded.auth).toBe(1);
  });

  it("goes to Google by redirect when the popup is blocked, and finishes on the next load", async () => {
    firebase.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    firebase.signInWithRedirect.mockResolvedValue(undefined);
    const sheet = await openSignIn();
    fireEvent.click(within(sheet).getByRole("button", { name: "Google ile devam et" }));
    await waitFor(() => expect(firebase.signInWithRedirect).toHaveBeenCalled());
    expect(sessionStorage.getItem("hesap:redirect:v1")).not.toBeNull();

    // The page comes back from Google.
    cleanup();
    resetAccountCache();
    calls = [];
    firebase.getRedirectResult.mockResolvedValue({ user: firebaseUser() });
    render(<AccountButton />);
    expect(await button(ME.name)).toBeTruthy();
    expect(calls.some((call) => call.path === "giris")).toBe(true);
    expect(sessionStorage.getItem("hesap:redirect:v1")).toBeNull();
  });

  it("says nothing when the player closes the popup", async () => {
    firebase.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    const sheet = await openSignIn();
    const google = within(sheet).getByRole("button", { name: "Google ile devam et" });
    fireEvent.click(google);
    await waitFor(() => expect(google.hasAttribute("disabled")).toBe(false));
    expect(within(sheet).queryByRole("alert")).toBeNull();
    expect(firebase.signInWithRedirect).not.toHaveBeenCalled();
  });
});

describe("signing in with an email", () => {
  const fill = (sheet: HTMLElement, email: string, password: string): void => {
    fireEvent.change(within(sheet).getByLabelText("E-posta"), { target: { value: email } });
    fireEvent.change(within(sheet).getByLabelText("Şifre"), { target: { value: password } });
  };

  it("asks for the email check when the server says the address isn't verified", async () => {
    answers.giris = () => [403, { error: "dogrulanmadi" }];
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: firebaseUser("yeni@example.com", true) });
    const sheet = await openSignIn();
    fill(sheet, "yeni@example.com", "uzun-bir-sifre");
    fireEvent.click(submit(sheet));
    expect(await screen.findByRole("heading", { name: "E-postanı doğrula" })).toBeTruthy();
    expect(screen.getByText("yeni@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Doğruladım" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Doğrulama e-postasını yeniden gönder" })).toBeTruthy();
    // Still signed in to Firebase, for asking again.
    expect(firebase.signOut).not.toHaveBeenCalled();
  });

  it("goes straight to the email check for an unverified address, and in once it is verified", async () => {
    const found = firebaseUser("yeni@example.com", false);
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: found });
    const sheet = await openSignIn();
    fill(sheet, "yeni@example.com", "uzun-bir-sifre");
    fireEvent.click(submit(sheet));
    expect(await screen.findByRole("heading", { name: "E-postanı doğrula" })).toBeTruthy();
    expect(calls.some((call) => call.path === "giris")).toBe(false);

    found.reload.mockImplementation(async () => {
      found.emailVerified = true;
    });
    fireEvent.click(screen.getByRole("button", { name: "Doğruladım" }));
    expect(await screen.findByRole("heading", { name: "Hesabın" })).toBeTruthy();
    expect(found.getIdToken).toHaveBeenCalledWith(true);
  });

  it("opens an account and sends the verification email", async () => {
    const created = firebaseUser("yeni@example.com", false);
    firebase.createUserWithEmailAndPassword.mockResolvedValue({ user: created });
    const sheet = await openSignIn();
    fireEvent.click(within(sheet).getByRole("button", { name: "Hesap aç" }));

    fill(sheet, "yeni@example.com", "kisa");
    fireEvent.click(submit(sheet));
    expect((await within(sheet).findByRole("alert")).textContent).toContain("en az 8 karakter");
    expect(firebase.createUserWithEmailAndPassword).not.toHaveBeenCalled();

    fill(sheet, "yeni@example.com", "uzun-bir-sifre");
    fireEvent.click(submit(sheet));
    expect(await screen.findByRole("heading", { name: "E-postanı doğrula" })).toBeTruthy();
    expect(firebase.createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), "yeni@example.com", "uzun-bir-sifre");
    expect(firebase.sendEmailVerification).toHaveBeenCalledWith(created, { url: location.href });
  });

  it("maps Firebase's complaints to short Turkish ones", async () => {
    firebase.signInWithEmailAndPassword.mockRejectedValue({ code: "auth/invalid-credential" });
    const sheet = await openSignIn();
    fill(sheet, "biri@example.com", "yanlis-sifre");
    fireEvent.click(submit(sheet));
    expect((await within(sheet).findByRole("alert")).textContent).toBe("E-posta ya da şifre yanlış.");
  });

  it("says the reset email went out whether or not the account exists", async () => {
    const sheet = await openSignIn();
    fireEvent.change(within(sheet).getByLabelText("E-posta"), { target: { value: "kimse@example.com" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Şifremi unuttum" }));
    expect(await screen.findByRole("heading", { name: "Şifreni sıfırla" })).toBeTruthy();

    firebase.sendPasswordResetEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });
    fireEvent.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    const sent = await screen.findByRole("status");
    expect(sent.textContent).toContain("E-posta gönderildi (böyle bir hesap varsa)");
    expect(firebase.sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), "kimse@example.com", { url: location.href });

    fireEvent.click(screen.getByRole("button", { name: "Bağlantı gönder" }));
    await waitFor(() => expect(firebase.sendPasswordResetEmail).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole("status")).textContent).toContain("böyle bir hesap varsa");
  });
});

describe("signed in", () => {
  async function openAccount(): Promise<HTMLElement> {
    answers.ben = () => [200, { user: ME }];
    render(<AccountButton />);
    fireEvent.click(await button(ME.name));
    return dialog();
  }

  it("says a name that won't do can't be used", async () => {
    answers.ad = () => [400, { error: "ad" }];
    const sheet = await openAccount();
    const input = within(sheet).getByLabelText("Adın");
    fireEvent.change(input, { target: { value: "Kaba Söz" } });
    fireEvent.blur(input);
    expect((await within(sheet).findByRole("alert")).textContent).toBe("Bu ad kullanılamaz.");
    expect(calls.some((call) => call.path === "ad" && call.headers.get("X-Hesap-Ad") === encodeURIComponent("Kaba Söz"))).toBe(true);
  });

  it("takes a new name from the dice", async () => {
    answers.ad = () => [200, { user: { ...ME, base: "Sakin Martı", name: "Sakin Martı #4821", chosen: "Sakin Martı" } }];
    const sheet = await openAccount();
    fireEvent.click(within(sheet).getByRole("button", { name: "Rastgele ad" }));
    expect(await screen.findByRole("button", { name: "Sakin Martı #4821" })).toBeTruthy();
    expect(calls.some((call) => call.path === "ad" && !!call.headers.get("X-Hesap-Ad"))).toBe(true);
  });

  it("signs out through /cikis", async () => {
    const sheet = await openAccount();
    fireEvent.click(within(sheet).getByRole("button", { name: "Çıkış yap" }));
    expect(await button("Giriş yap")).toBeTruthy();
    expect(calls.some((call) => call.path === "cikis")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes the account after a fresh Google sign-in, then Firebase's user", async () => {
    const found = firebaseUser();
    firebase.signInWithPopup.mockResolvedValue({ user: found });
    const sheet = await openAccount();
    fireEvent.click(within(sheet).getByRole("button", { name: "Hesabı sil" }));
    expect(await screen.findByRole("heading", { name: "Hesabı sil" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hesabı sil" }));

    expect((await screen.findByRole("status")).textContent).toBe("Hesabın silindi.");
    expect(calls.some((call) => call.path === "sil")).toBe(true);
    expect(firebase.deleteUser).toHaveBeenCalledWith(found);
    expect(document.querySelector(".account-button")?.getAttribute("aria-label")).toBe("Giriş yap");
  });

  it("deletes nothing when the fresh sign-in is another account", async () => {
    firebase.signInWithPopup.mockResolvedValue({ user: firebaseUser("baska@example.com") });
    const sheet = await openAccount();
    fireEvent.click(within(sheet).getByRole("button", { name: "Hesabı sil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hesabı sil" }));
    expect((await screen.findByRole("alert")).textContent).toContain("açık olan hesap değil");
    expect(calls.some((call) => call.path === "sil")).toBe(false);
    expect(firebase.deleteUser).not.toHaveBeenCalled();
  });

  it("asks again when another tab says something changed", async () => {
    answers.ben = () => [200, { user: ME }];
    render(<AccountButton />);
    await button(ME.name);
    answers.ben = () => [200, { user: null }];
    await act(async () => {
      new BroadcastChannel("hesap").postMessage("changed");
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await button("Giriş yap")).toBeTruthy();
  });
});
