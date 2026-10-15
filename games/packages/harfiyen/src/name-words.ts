/**
 * The words players' default names are made of, and the dice that rolls
 * new ones: apart from the rest of names.ts so a page can roll a name
 * without carrying the blocklist that checks one.
 */

export const ADJECTIVES = [
  "Neşeli", "Meraklı", "Sakin", "Cesur", "Çalışkan", "Sevimli", "Uykucu", "Hızlı", "Kibar", "Şakacı",
  "Dalgın", "Becerikli", "Cömert", "Sabırlı", "Tatlı", "Yaramaz", "Utangaç", "Akıllı", "Güleryüzlü", "Dürüst",
  "Hayalperest", "Düşünceli", "Sessiz", "Konuşkan", "Çevik", "Uslu", "Neşesi Bol", "Yumuşak", "Parlak", "Bilge",
  "Gezgin", "Titiz", "Sabahçı", "Gececi", "Çılgın", "Ağırbaşlı", "Şirin", "Zarif", "Esnek", "Atik",
  "Hevesli", "Kararlı", "Huzurlu", "Hünerli", "Çekirdekçi", "Kurnaz", "Pırıl Pırıl", "Uyanık", "Romantik", "Afacan",
  "Keyifli", "Mütevazı", "Dikkatli", "Yaratıcı", "İnatçı", "Telaşsız", "Cıvıl Cıvıl", "Gümüş", "Altın", "Bulutlu",
  "Rüzgârlı", "Güneşli", "Yıldızlı", "Kadife",
];

export const NOUNS = [
  "Kirpi", "Sincap", "Baykuş", "Martı", "Kaplumbağa", "Tilki", "Kedi", "Köpek", "Yunus", "Penguen",
  "Serçe", "Leylek", "Arı", "Uğur Böceği", "Kelebek", "Tavşan", "Ceylan", "Panda", "Koala", "Zürafa",
  "Fil", "Kunduz", "Gelincik", "Ahtapot", "Denizatı", "Flamingo", "Papağan", "Bülbül", "Kanarya", "Karınca",
  "Salyangoz", "Kurbağa", "Su Samuru", "Kartal", "Şahin", "Turna", "Pelikan", "Lama", "Deve", "At",
  "Aslan", "Kaplan", "Ayı", "Kurt", "Geyik", "Kuzu", "Oğlak", "Kanguru", "Tukan", "Saksağan",
  "Kumru", "Güvercin", "Ördek", "Kaz", "Hamsi", "Lüfer", "Palamut", "Çınar", "Lale", "Papatya",
  "Menekşe", "Zeytin", "İncir", "Nar",
];

/** Two words drawn at random, for the dice beside the name. */
export const randomName = (random: () => number = Math.random): string =>
  `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]}`;

export const NAME_WORDS = { adjectives: ADJECTIVES, nouns: NOUNS };
