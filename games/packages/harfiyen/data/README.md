# harfiyen's word lists

Built by `scripts/build-lexicon.ts`; one lower-case word per line.

| File            | Words  | What it is                                                                    |
| --------------- | ------ | ----------------------------------------------------------------------------- |
| `kelimeler.txt` | 62,654 | Every word a player may put down                                              |
| `zor.txt`       | 12,019 | A wider everyday vocabulary, commonest first: the computer's on the hard level |
| `yaygin.txt`    | 8,448  | Everyday words, commonest first: the computer's on medium                      |
| `kolay.txt`     | 4,456  | The commonest of those: the computer's on the easy level                       |

## Where they come from

**`kelimeler.txt`** follows the rules Turkish word games go by: headwords of the
Türk Dil Kurumu's *Güncel Türkçe Sözlük* — single words only, verbs in the
infinitive (`gelmek`, never `gel`), no inflected forms — plus one-word
country names and three short words such games have long accepted (go, jak,
pi). Circumflexes fold into the plain letter (`kâr` → `kar`), since the game
has 29 tiles, and anything outside 2–15 letters is dropped (no single letters;
nothing longer than the board). The headwords were read from the dictionary's
JSON as collected in [ogun/guncel-turkce-sozluk](https://github.com/ogun/guncel-turkce-sozluk)
(v12); the dictionary's content is TDK's. Country names come from
[i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) (MIT).

**`zor.txt`, `yaygin.txt` and `kolay.txt`** rank those headwords by how
often they're used: counts from
[FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(OpenSubtitles 2018, Hermit Dave) and
[wordfreq](https://github.com/rspeer/wordfreq) (Robyn Speer) are credited to
their headwords — Turkish inflects, so `geldi` and `gelecek` count for
`gelmek` — and a word ranks by the worse of its two places, so it must be
common in both. Words used only as proper nouns, only in archaic, dialect or
slang senses, the `-abilmek`/`-ıvermek` derivations and swear words were
left out; the top 15,000 make `zor.txt`, the top 10,000 `yaygin.txt`, the
top 5,000 `kolay.txt`. The build then drops words whose count belongs to
something else — typed without Turkish letters (`yakin` for `yakın`),
plurals of words that are words themselves (`kuşlar`) — and a hand-picked
list of letter and note names, names, inflected forms that happen to be
headwords (`kapıda`, `kaçta`) and odd short words (`BOT_SKIP` in the
script), and words a friendly opponent shouldn't play — sex, drugs, suicide,
terror (`BOT_TACT`); players may still play them. The three files are
derived from CC BY-SA 4.0 data and are themselves under [CC BY-SA
4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Rebuilding

The inputs aren't kept here. To rebuild: the headword list from the GTS JSON
(single words, circumflexes folded), i18n-iso-countries' `langs/tr.json`, the
two ranked everyday lists and the lemma ranks, then

```sh
node scripts/build-lexicon.ts --words gts.txt --countries tr.json \
  --wide common_15k.txt --common common_10k.txt --easy common_5k.txt --rank lemma_rank.tsv
```

Changing a list changes what the computer plays and which words count; saved
games keep working, since a game stores its board, not its dictionary.

## Names online

Players choose the names others see online; the server checks each with
`cleanName` (`src/names.ts`). Its word list, `src/blocklist.ts`, is made by
`scripts/build-blocklist.ts` from two published Turkish lists —
[ooguz/turkce-kufur-karaliste](https://github.com/ooguz/turkce-kufur-karaliste)
(CC BY-SA 4.0) and the Turkish file of
[LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
(CC BY 4.0) — less a few everyday words they hold for one sense ("çıkar",
"dolu", "oğlan", "Abaza") and the teasing ones a player may well take for a
nickname ("Atkafası", "Salak Kedi"); swearing, sex, slurs and heavy insults
stay out. Names are matched word by word, never inside a
word, and Turkish letters stay Turkish, so "Koç", "Sıkı Fıkı" and
"Malatyalı" pass:

```sh
node scripts/build-blocklist.ts karaliste.txt tr
```
