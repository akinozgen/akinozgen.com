import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seeded } from "../src/rng.ts";
import { CODE_PATTERN, newCode, normalizeCode } from "../src/server/codes.ts";
import {
  MAX_MESSAGE,
  MAX_SUMMARY,
  parseCreate,
  parseLobbyRequest,
  parseRoomRequest,
  parseSummaryRequest,
  PROTOCOL,
} from "../src/server/protocol.ts";

const secret = "0123456789abcdef0123456789abcdef";
const room = (value: unknown) => parseRoomRequest(JSON.stringify(value));

describe("room requests", () => {
  it("take well-formed messages", () => {
    expect(room({ t: "hello", v: PROTOCOL, secret })).toEqual({ t: "hello", v: PROTOCOL, secret });
    expect(room({ t: "play", n: 3, p: [[112, 5, 0], [113, 14, 1]] })).toEqual({ t: "play", n: 3, p: [[112, 5, 0], [113, 14, 1]] });
    expect(room({ t: "swap", n: 0, tiles: [3, 29] })).toEqual({ t: "swap", n: 0, tiles: [3, 29] });
    expect(room({ t: "pass", n: 7 })).toEqual({ t: "pass", n: 7 });
    for (const t of ["join", "resign", "rematch", "cancel"]) expect(room({ t, extra: "ignored" })).toEqual({ t });

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
      { t: "hello", v: PROTOCOL, secret: "short" },
      { t: "hello", v: PROTOCOL, secret: secret.toUpperCase() },
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
    ];
    for (const value of bad) expect(typeof value === "string" ? parseRoomRequest(value) : room(value)).toBeNull();
    expect(parseRoomRequest("x".repeat(MAX_MESSAGE + 1))).toBeNull();
    expect(parseRoomRequest(new ArrayBuffer(8))).toBeNull();
  });
});

describe("other requests", () => {
  it("are checked the same way", () => {
    expect(parseLobbyRequest(JSON.stringify({ t: "seek", v: 1, secret }))).toEqual({ t: "seek", v: 1, secret });
    expect(parseLobbyRequest(JSON.stringify({ t: "seek", v: 1 }))).toBeNull();
    expect(parseCreate(JSON.stringify({ v: 1, secret }))).toEqual({ v: 1, secret });
    expect(parseCreate("{}")).toBeNull();
    expect(parseSummaryRequest(JSON.stringify({ v: 1, secret, codes: ["K7Q2XM", "K7Q2XM"] }))).toEqual({ v: 1, secret, codes: ["K7Q2XM"] });
    expect(parseSummaryRequest(JSON.stringify({ v: 1, secret, codes: ["k7q2xm"] }))).toBeNull();
    const many = Array.from({ length: MAX_SUMMARY + 1 }, (_, i) => newCode(seeded(`c${i}`)));
    expect(parseSummaryRequest(JSON.stringify({ v: 1, secret, codes: many }))).toBeNull();
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
