import { describe, expect, it } from "vitest";
import { cleanName, defaultName, displayName, NAME_WORDS, nameTag, newSecret, playerName, publicId, randomName } from "../src/names.ts";
import { seeded } from "../src/rng.ts";

describe("player names", () => {
  it("keep the device's number whatever the name", async () => {
    const pub = await publicId(newSecret());
    expect(nameTag(pub)).toMatch(/^\d{4}$/);
    expect(playerName(pub)).toBe(`${defaultName(pub)} #${nameTag(pub)}`);
    expect(displayName("Akın", pub)).toBe(`Akın #${nameTag(pub)}`);
  });

  it("roll two words at random, every pair a fit name", () => {
    const random = seeded("dice");
    const names = new Set(Array.from({ length: 50 }, () => randomName(random)));
    expect(names.size).toBeGreaterThan(40);
    for (const name of names) expect(cleanName(name)).toBe(name);
    for (const adjective of NAME_WORDS.adjectives) {
      for (const noun of NAME_WORDS.nouns) expect(cleanName(`${adjective} ${noun}`), `${adjective} ${noun}`).not.toBeNull();
    }
  });

  it("are cleaned: trimmed, squeezed, 2–24 letters and digits and a few marks", () => {
    expect(cleanName("  Akın   Özgen ")).toBe("Akın Özgen");
    expect(cleanName("Ayşe-Nur")).toBe("Ayşe-Nur");
    expect(cleanName("O'Neil 2")).toBe("O'Neil 2");
    expect(cleanName("Иван")).toBe("Иван");
    expect(cleanName("Ali\nCan")).toBe("Ali Can");
    for (const bad of ["A", "", "   ", "x".repeat(25), "<script>", "Ali😀", "1234", 42, null]) {
      expect(cleanName(bad), String(bad)).toBeNull();
    }
  });

  it("keep insults and impersonation out, whole words only, so the words they hide in pass", () => {
    for (const bad of ["Orospu Çocuğu", "s1kt1r git", "Amk", "Pezevenk", "HARFIYEN", "Admin", "Kahpe", "siiiiktir", "Orospular", "Ş e r e f s i z", "AVEL", "Avel Kedi", "a v e l", "Aveller"]) {
      expect(cleanName(bad), bad).toBeNull();
    }
    // Teasing names a player may give themself.
    for (const nick of ["Atkafası", "ATKAFASI", "Salak Kedi", "Mal Ahmet", "Öküz"]) expect(cleanName(nick), nick).toBe(nick);
    const fine = ["Koç", "Ali Koç", "Malatyalı", "Cesur Tukan", "Sıkı Fıkı", "Sikke", "Ananas", "Ana Arı", "Abaza", "Amasya", "Gotham", "Picasso", "Bokser", "Salkım", "Penisilin", "Silikon"];
    for (const name of fine) expect(cleanName(name), name).toBe(name);
  });
});
