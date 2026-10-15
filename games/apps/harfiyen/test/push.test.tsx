import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushOffer, PushStatus } from "../src/components/PushOffer.tsx";
import { disablePush, enablePush, fromBase64Url, pushMessage, pushSupport, syncPush } from "../src/game/push.ts";
import { api } from "./fakes.ts";

const KEY = "BKRmgAbYHNVmfR5qScCkSG6W2SiEbqT4oevvVJwykYM8tql0PMzQZLSGxah48IuDYIVCtB-LIiam9tkLjjAdnkU";
const SUB = { endpoint: "https://push.example/send/abc", keys: { p256dh: "pub-key", auth: "auth-secret" } };

/** The browser's push machinery, recorded. */
let log: string[];
let permission: NotificationPermission;
let answer: NotificationPermission;
let current: { options: { applicationServerKey: ArrayBuffer }; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null;

function fakeSubscription(key: Uint8Array) {
  return {
    options: { applicationServerKey: key.slice().buffer },
    toJSON: () => SUB,
    unsubscribe: vi.fn(async () => {
      log.push("unsubscribe");
      current = null;
      return true;
    }),
  };
}

class FakeNotification {
  static get permission(): NotificationPermission {
    return permission;
  }
  static async requestPermission(): Promise<NotificationPermission> {
    log.push("permission");
    permission = answer;
    return answer;
  }
}

const registration = {
  pushManager: {
    getSubscription: async () => current,
    subscribe: vi.fn(async (options: { applicationServerKey: Uint8Array; userVisibleOnly: boolean }) => {
      log.push(`subscribe:${options.userVisibleOnly}`);
      current = fakeSubscription(options.applicationServerKey);
      return current;
    }),
  },
};

beforeEach(() => {
  log = [];
  permission = "default";
  answer = "granted";
  current = null;
  api.set("GET /api/harfiyen/vapid", () => {
    log.push("vapid");
    return { body: { key: KEY } };
  });
  Object.assign(globalThis, { Notification: FakeNotification, PushManager: class {} });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async (url: URL, options: { scope: string }) => {
        log.push(`register:${new URL(url).pathname}:${options.scope}`);
        return registration;
      }),
      ready: Promise.resolve(registration),
      getRegistration: async () => registration,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
});

afterEach(() => {
  // Only these: the setup's own stubs (fetch, WebSocket) stay.
  delete (globalThis as { Notification?: unknown }).Notification;
  delete (globalThis as { PushManager?: unknown }).PushManager;
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("notices", () => {
  it("asks for permission first, straight from the tap, then subscribes with the server's key", async () => {
    expect(pushSupport()).toBe("ok");
    expect(await enablePush()).toBe("on");
    expect(log[0]).toBe("permission");
    expect(log).toContain("subscribe:true");
    expect(log.find((l) => l.startsWith("register:"))).toBe("register:/sw.js:./");
    const [options] = registration.pushManager.subscribe.mock.calls.at(-1)!;
    expect(Array.from(options.applicationServerKey)).toEqual(Array.from(fromBase64Url(KEY)));
    expect(options.applicationServerKey).toHaveLength(65);
    expect(JSON.parse(localStorage.getItem("harfiyen:push:v1")!).sub).toEqual(SUB);
    expect(pushMessage()).toEqual({ t: "push", sub: SUB });
  });

  it("a refusal stores nothing and says nothing to the rooms", async () => {
    answer = "denied";
    expect(await enablePush()).toBe("denied");
    expect(log).not.toContain("subscribe:true");
    expect(pushMessage()).toBeNull();
  });

  it("turned off: the subscription goes, and rooms are told to stop", async () => {
    await enablePush();
    await disablePush();
    expect(log).toContain("unsubscribe");
    expect(pushMessage()).toEqual({ t: "push", sub: null });
  });

  it("a permission taken back in the browser's settings turns notices off here too", async () => {
    await enablePush();
    permission = "denied";
    await syncPush();
    expect(pushMessage()).toEqual({ t: "push", sub: null });
  });

  it("offers notices with a tap, and remembers 'not now'", async () => {
    const { unmount } = render(<PushOffer />);
    expect(await screen.findByText("Sıra sana gelince haber verelim mi?")).toBeTruthy();
    expect(log).toEqual(["vapid"]);
    fireEvent.click(screen.getByRole("button", { name: "Şimdi değil" }));
    expect(screen.queryByText("Sıra sana gelince haber verelim mi?")).toBeNull();
    unmount();
    render(<PushOffer />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("Sıra sana gelince haber verelim mi?")).toBeNull();
  });

  it("turns them on from the offer, and the identity card says so", async () => {
    render(
      <>
        <PushOffer />
        <PushStatus />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Bildirimleri aç" }));
    await waitFor(() => expect(screen.queryByText("Sıra sana gelince haber verelim mi?")).toBeNull());
    expect(screen.getByText("Bildirimler açık")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    await waitFor(() => expect(screen.getByText("Bildirimler kapalı")).toBeTruthy());
  });

  it("explains a refusal: how to allow them again", async () => {
    answer = "denied";
    render(<PushOffer />);
    fireEvent.click(await screen.findByRole("button", { name: "Bildirimleri aç" }));
    expect(await screen.findByText(/site ayarlarından bu siteye bildirim izni ver/)).toBeTruthy();
  });

  it("on an iPhone, outside the home screen, says how to get there instead", async () => {
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
    expect(pushSupport()).toBe("install");
    render(<PushOffer />);
    expect(await screen.findByText(/Paylaş → Ana Ekrana Ekle/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bildirimleri aç" })).toBeNull();
    agent.mockRestore();
    delete (navigator as { standalone?: boolean }).standalone;
  });

  it("nothing at all when the server has no key", async () => {
    api.set("GET /api/harfiyen/vapid", () => ({ status: 404, body: { error: "yok" } }));
    const { container } = render(
      <>
        <PushOffer />
        <PushStatus />
      </>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });
});
