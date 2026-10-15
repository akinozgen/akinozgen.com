import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seeded } from "../src/rng.ts";
import { CODE_PATTERN, newCode, normalizeCode } from "../src/server/codes.ts";
import {
  CHAT_MAX,
  codesOf,
  isSecret,
  MAX_MESSAGE,
  MAX_SUMMARY,
  parseLobbyRequest,
  parseRoomRequest,
  PROTOCOL,
  versionOf,
} from "../src/server/protocol.ts";

const room = (value: unknown) => parseRoomRequest(JSON.stringify(value));

describe("room requests", () => {
  it("take well-formed messages", () => {
    // The player is the session's account: whatever a hello says about identity is dropped.
    expect(room({ t: "hello", v: PROTOCOL, secret: "0123456789abcdef0123456789abcdef", name: "x" })).toEqual({ t: "hello", v: PROTOCOL });
    expect(room({ t: "play", n: 3, p: [[112, 5, 0], [113, 14, 1]] })).toEqual({ t: "play", n: 3, p: [[112, 5, 0], [113, 14, 1]] });
    expect(room({ t: "swap", n: 0, tiles: [3, 29] })).toEqual({ t: "swap", n: 0, tiles: [3, 29] });
    expect(room({ t: "pass", n: 7 })).toEqual({ t: "pass", n: 7 });
    for (const t of ["join", "resign", "rematch", "cancel", "nudge"]) expect(room({ t, extra: "ignored" })).toEqual({ t });
    expect(room({ t: "say", text: "Merhaba!" })).toEqual({ t: "say", text: "Merhaba!" });
    expect(room({ t: "mute", on: true })).toEqual({ t: "mute", on: true });

    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B".padEnd(87, "A"), auth: "A".repeat(22) } };
    expect(room({ t: "push", sub: { ...sub, extra: 1 } })).toEqual({ t: "push", sub });
    expect(room({ t: "push", sub: null })).toEqual({ t: "push", sub: null });
    expect(room({ t: "push", sub: { ...sub, endpoint: "http://evil.example" } })).toBeNull();
    expect(room({ t: "push" })).toBeNull();
  });

  it("turn away anything else", () => {
    const bad = [
      "not json",
      "[]",
      "null",
      { t: "hello" },
      { t: "hello", v: "2" },
      { t: "play", n: 0, p: [] },
      { t: "play", n: 0, p: [[225, 0, 0]] },
      { t: "play", n: 0, p: [[0, 29, 0]] },
      { t: "play", n: 0, p: [[0, 0, true]] },
      { t: "play", n: 0, p: Array.from({ length: 8 }, (_, i) => [i, 0, 0]) },
      { t: "play", n: -1, p: [[0, 0, 0]] },
      { t: "play", n: 1.5, p: [[0, 0, 0]] },
      { t: "swap", n: 0, tiles: [] },
      { t: "swap", n: 0, tiles: [30] },
      { t: "pass" },
      { t: "chat", text: "merhaba" },
      { t: "say" },
      { t: "say", text: 42 },
      { t: "say", text: "x".repeat(CHAT_MAX * 4 + 1) },
      { t: "mute", on: "yes" },
    ];
    for (const value of bad) expect(typeof value === "string" ? parseRoomRequest(value) : room(value)).toBeNull();
    expect(parseRoomRequest("x".repeat(MAX_MESSAGE + 1))).toBeNull();
    expect(parseRoomRequest(new ArrayBuffer(8))).toBeNull();
  });
});

describe("other requests", () => {
  it("are checked the same way", () => {
    expect(parseLobbyRequest(JSON.stringify({ t: "seek", v: 2, secret: "0123456789abcdef0123456789abcdef" }))).toEqual({ t: "seek", v: 2 });
    expect(parseLobbyRequest(JSON.stringify({ t: "seek" }))).toBeNull();
    const query = (text: string) => new URLSearchParams(text);
    expect(versionOf(query("v=2"))).toBe(2);
    expect(versionOf(query(""))).toBeNull();
    expect(versionOf(query("v=x"))).toBeNull();
    expect(codesOf(query("v=2&k=K7Q2XM,K7Q2XM"))).toEqual(["K7Q2XM"]);
    expect(codesOf(query("v=2"))).toEqual([]);
    expect(codesOf(query("k=k7q2xm"))).toBeNull();
    const many = Array.from({ length: MAX_SUMMARY + 1 }, (_, i) => newCode(seeded(`c${i}`)));
    expect(codesOf(query(`k=${many.join(",")}`))).toBeNull();
    expect(isSecret("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isSecret("0123456789ABCDEF0123456789ABCDEF")).toBe(false);
  });
});

describe("room codes", () => {
  it("are six unambiguous characters, typed in any case", () => {
    const random = seeded("codes");
    for (let i = 0; i < 500; i++) expect(newCode(random)).toMatch(CODE_PATTERN);
    expect(normalizeCode(" k7q2xm ")).toBe("K7Q2XM");
    for (const typo of ["K7Q2X", "K7Q2XM1", "K7Q2X0", "K7Q2XI", "K7Q2XL", "K7Q2XU"]) expect(normalizeCode(typo)).toBeNull();
    // A Turkish keyboard's dotted i must not slip through as İ.
    expect(normalizeCode("k7q2xi")).toBeNull();
  });
});

describe("the server's own files", () => {
  it("import only by relative path, as the site's build requires", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk(fileURLToPath(new URL("../src", import.meta.url)));
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec.startsWith(".") || spec === "cloudflare:workers", `${file} imports ${spec}`).toBe(true);
      }
    }
  });
});
