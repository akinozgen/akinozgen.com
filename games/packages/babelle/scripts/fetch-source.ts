import { mkdir, writeFile } from "node:fs/promises";

/**
 * Downloads the NorthEuraLex word lists (Dellert et al. 2020, CC BY 4.0) in
 * their CLDF form. The raw files are large and stay out of git; build-data
 * keeps only what the game uses.
 */
const BASE = "https://raw.githubusercontent.com/lexibank/northeuralex/master/cldf/";
const DIR = new URL("../source/", import.meta.url);

await mkdir(DIR, { recursive: true });
for (const file of ["languages.csv", "parameters.csv", "forms.csv"]) {
  const response = await fetch(BASE + file);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  await writeFile(new URL(file, DIR), await response.text());
  console.log(`fetched ${file}`);
}
