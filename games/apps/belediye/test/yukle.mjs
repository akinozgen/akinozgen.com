// Testler için taze modüller: her çağrı src/ modüllerini baştan yükler. Bir testin CARDS'a ya da SYN'e eklediği
// deneme kartları yalnız o kopyada kalır, öbür testlere sızmaz. Dönen nesne istenen modüllerin bütün dışa açık adlarıdır.
import { existsSync } from "node:fs";
import { vi } from "vitest";

// TypeScript'e geçiş dosya dosya: modül .ts'ye çevrildiyse o, değilse .js
const yol = m => (existsSync(new URL(`../src/${m}.ts`, import.meta.url)) ? `../src/${m}.ts` : `../src/${m}.js`);

export async function yukle(...mods) {
  vi.resetModules();
  const ms = await Promise.all(mods.map(m => import(yol(m))));
  return Object.assign({}, ...ms);
}
