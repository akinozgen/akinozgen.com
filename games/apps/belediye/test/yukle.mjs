// Testler için taze modüller: her çağrı src/ modüllerini baştan yükler. Bir testin CARDS'a ya da SYN'e eklediği
// deneme kartları yalnız o kopyada kalır, öbür testlere sızmaz. Dönen nesne istenen modüllerin bütün dışa açık adlarıdır.
import { vi } from "vitest";

export async function yukle(...mods) {
  vi.resetModules();
  const ms = await Promise.all(mods.map(m => import(`../src/${m}.js`)));
  return Object.assign({}, ...ms);
}
