// Ortak tipler: içerik şeması (cards.ts), oyun durumu ve motorun ürettikleri (engine.ts).
// Yalnız tip; derlemede hiçbir şey üretmez.

/** Göstergeler: h halk, k kasa, e esnaf, a Ankara */
export type Meter = "h" | "k" | "e" | "a";
export type Meters = Record<Meter, number>;
/** Dört göstergeye etki, METERS sırasıyla [halk, kasa, esnaf, ankara] */
export type Effect = number[];
export type Rng = () => number;
/** Tek değer ya da liste (bayrak, karar, etiket adları) */
export type OneOrMany = string | string[];
/** Sayaç ya da ilişki eşiği: en az n ya da [en az, en çok] */
export type Range = number | [number, number];

/** Ortak koşul dili (engine.ts'teki condOK) */
export interface Cond {
  req?: OneOrMany;
  not?: OneOrMany;
  cnt?: Record<string, Range>;
  pol?: OneOrMany;
  nopol?: OneOrMany;
  tag?: OneOrMany;
  notag?: OneOrMany;
  rel?: Record<string, Range>;
}

/** Zincir: [kart, ay] ya da { id, in: ay | [en az, en çok], if, else } */
export type Next =
  [string, number | [number, number]] | { id: string; in?: number | [number, number]; if?: Cond; else?: string };

/** Yan etki: karar yürürlükteyken her ay p olasılıkla bir evrak doğurur (karar başına bir kez) */
export interface YanDef {
  card: string;
  /** her ay olasılık; 0,10-0,20 önerilir (0,15 ile 12 ayda gelme olasılığı %86) */
  p: number;
  /** en erken kaçıncı ayında (varsayılan 3) */
  min?: number;
  if?: Cond;
}

/** Sandık defterine giren kalem: eksi skandal, artı akılda kalan iş (özür de artı yazılır) */
export interface Kalem {
  ad: string;
  puan: number;
}

/** Yürürlüğe giren karar: her ay e kadar işler, ay dolunca done ve doneCard gelir */
export interface PolDef {
  id: string;
  ad: string;
  e?: Effect;
  ay?: number;
  done?: Effect;
  msg?: string;
  doneCard?: string;
  tags?: string[];
  yan?: YanDef[];
  /** aylık etkisi olmayan kararın "Yürürlükte" şeridindeki kısa açıklaması */
  ozet?: string;
}

/** Kart seçeneği (içerikte yazıldığı hâliyle) */
export interface SideDef {
  t: string;
  e: Effect;
  rel?: Record<string, number>;
  set?: OneOrMany;
  clr?: OneOrMany;
  inc?: string | Record<string, number>;
  dec?: string | Record<string, number>;
  next?: Next;
  pol?: PolDef;
  cut?: OneOrMany;
  /** seçilince oyunu bitiren son (ENDINGS anahtarı): yay finalleri ve Ankara davetinin kabulü */
  son?: string;
  /** sandık defterine kalem: anketi etkiler, seçim gecesinde adıyla anılır */
  anket?: Kalem;
  /** kaydırınca çıkan hafıza notu ("Hacı Bekir bunu unutmayacak.") */
  not?: string;
  /** riskli seçenek: p olasılıkla iyi, yoksa kötü uç işler (oran düğmede görünür) */
  zar?: { p: number; iyi: ZarSonuc; kotu: ZarSonuc };
  /** kampanya anketine kesin etki (kampanya evrakının güvenli seçeneği) */
  oy?: number;
}

export type CardKind =
  | "normal"
  | "intro"
  | "kriz"
  | "ending"
  | "tekir"
  | "sonuc"
  | "cay"
  | "secim"
  | "adaylar"
  | "davet"
  | "acilis"
  | "kampanya";

/** Kart (içerik ya da motorun ürettiği özel evrak) */
export interface CardDef {
  id: string;
  who: string;
  konu: string;
  text: string;
  L: SideDef;
  R: SideDef;
  kind?: CardKind;
  chain?: boolean;
  once?: boolean;
  cd?: number;
  w?: number;
  months?: number[];
  minM?: number;
  pre?: boolean;
  req?: OneOrMany;
  not?: OneOrMany;
  reqCnt?: Record<string, Range>;
  reqPol?: OneOrMany;
  notPol?: OneOrMany;
  reqTag?: OneOrMany;
  notTag?: OneOrMany;
  relMin?: Record<string, number>;
  relMax?: Record<string, number>;
  fav?: "L" | "R";
  norel?: boolean;
  alt?: { req?: OneOrMany; if?: Cond; text: string }[];
  /** kampanya evrakının aşaması: 0 açılış, 1 saha, 2 medya, 3 son hafta */
  asama?: number;
  // motorun özel evraklarında
  key?: string;
  restore?: Meters;
  oy?: string;
}

export interface Person {
  ad: string;
  unvan: string;
  pos?: string[];
  neg?: string[];
}
export interface Baskan {
  ad: string;
  lakap: string;
  bio: string;
  cins: "k" | "e";
}

/** Seçimde karşınıza çıkabilecek aday */
export interface Aday {
  /** ana rakip sırası (küçük önce) */
  ana?: number;
  etiket: string;
  slogan: string;
  /** seçmen gruplarındaki ağırlığı, BLOKLAR sırasıyla */
  blok: number[];
  p?: number;
  pSart?: number;
  sart?: (s: State) => boolean;
  guc?: (s: State) => number;
  /** oyunun ne kadarını sizden çaldığı (kalanı ana rakipten) */
  beta?: number;
}

export interface SynRule {
  id: string;
  a: string;
  b: string;
  e?: Effect;
  card?: string;
  ad?: string;
  msg?: string;
}

export interface Ending {
  who: string;
  konu: string;
  text: string;
  manset: string;
  spot: string;
  kisa: string;
  win?: boolean;
  legacy?: boolean;
  /** son evrağının düğmeleri [sol, sağ]; yoksa kazanç ya da kayba göre varsayılan */
  btn?: [string, string];
  /** yay sonlarının türü: gönüllü (istifa, terfi), ceza (görevden alma: yalnız bir yayın sonunda), komik */
  tur?: "gonullu" | "ceza" | "komik";
}

/** Seçim beyannamesindeki vaat: anketi büyütür, ilk dönemde hesabı sorulur (kart) */
export interface VaatDef {
  id: string;
  /** beyannamedeki başlık, en çok 26 */
  ad: string;
  /** beyannamedeki kısa söz, en çok 110 */
  soz: string;
  /** açılış seçiminde kazanma şansına katkı (yüzde puan) */
  guc: number;
  /** hesabın sorulduğu evrak (zincir) ve kaçıncı aylar arasında geldiği */
  kart: string;
  ay: [number, number];
  /** vaat verilince konan bayrak (örn. metro_soz: mevcut evraklar bu sözü tanısın) */
  set?: string;
  /** sandığa gidince hemen etkisi: söz meydanı ısıtır [halk, kasa, esnaf, Ankara] */
  hemen?: Effect;
}

/** Göreve başlayış: sessiz kampanya, sandıkta ezici ya da rahat zafer, kıl payı zafer */
export type Acilis = "sessiz" | "ezici" | "zafer" | "kilpayi";

/** Zarlı seçeneğin bir ucu: tutarsa (iyi) ya da tutmazsa (kötü) ne olur */
export interface ZarSonuc {
  e?: Effect;
  /** kampanya anketine etki (yalnız kampanya evrakında) */
  oy?: number;
  set?: OneOrMany;
  rel?: Record<string, number>;
  kalem?: Kalem;
  /** kaydırınca çıkan haber, en çok 90 */
  msg?: string;
}

/** Oyun sonu gazetesinde başkanın neyle anılacağı: koşulu tutan ilk ikisi yazılır */
export interface MirasDef {
  if: Cond;
  text: string;
  /** yalnız bu sonlarda (ENDINGS anahtarı) */
  son?: OneOrMany;
}

// ── Oyun durumu
export interface Ongoing {
  id: string;
  ad: string;
  e: Effect;
  left: number | null;
  total: number | null;
  done: Effect | null;
  msg: string | null;
  doneCard: string | null;
  proj: boolean;
  tags: string[];
  /** henüz doğmamış yan etkiler ve kararın kaç aydır yürürlükte olduğu */
  yan?: YanDef[];
  age?: number;
  ozet?: string;
}
export interface QueueItem {
  id: string;
  at: number;
  if?: Cond;
  else?: string;
}
export interface LogEntry {
  m: number;
  who: string;
  konu: string;
  t: string;
  e: Effect;
}
export interface Field {
  term: number;
  main: string;
  extras: string[];
}

export interface Tally {
  cands: { id: string; pct: number }[];
  blocs: { ad: string; w: number; pay: number[] }[];
  winner: string;
  win: boolean;
  you: number;
  margin: number;
  month: number;
  term: number;
  order: string[];
  p0: number;
  steal: { id: string; v: number }[];
  vaat: number;
  rel: number;
  fatigue: number;
  /** sandık defterinin ankete net etkisi ve en ağır kalemleri */
  defter?: number;
  kalem?: Kalem[];
  /** göreve başlamadan önceki seçim (açılış): aday etiketi ve "yeniden seçildi" satırları buna göre */
  ilk?: boolean;
  /** açılış seçiminde verilen vaatlerin adları ve kazanma şansı */
  vaatler?: string[];
  sans?: number;
  /** açılış seçiminin sonucu: ezici, rahat ya da kıl payı zafer */
  acilis?: Acilis;
}

export type Pending =
  | { type: "ending"; key: string; oy?: string; rakip?: string }
  | { type: "tekir"; restore: Meters; cause: string }
  | { type: "davet" }
  | { type: "oda" }
  /** eski kayıt: erken seçim kalktı, esnaf teklifine döner */
  | { type: "erken" }
  | { type: "acilis" }
  | { type: "sonuc"; oy: string; win: boolean; big?: boolean; res?: Tally };

/** Masaya gelmiş, o ana göre somutlaşmış seçenek */
export interface Side extends Omit<SideDef, "rel"> {
  rel: Record<string, number>;
}
/** Masadaki evrak (materialize) */
export interface Cur {
  id: string;
  kind: CardKind;
  key?: string;
  restore?: Meters;
  oy?: string;
  who: string;
  konu: string;
  text: string;
  L: Side;
  R: Side;
  flip: boolean;
  rel: number | null;
  sayi: string;
  tarih: string;
  seed: number;
}

/** Olay günlüğü kaydı (ui.ts) */
export interface JournalEntry {
  m: number;
  who: string;
  konu: string;
  side: "L" | "R";
  t: string;
  e: Effect;
  notes: { html: string; cls?: string }[];
}

export interface State {
  v: number;
  gid: string;
  m: Meters;
  month: number;
  term: number;
  electionTerm: number;
  fieldTerm?: number;
  flags: Record<string, boolean>;
  cnt: Record<string, number>;
  last: Record<string, number>;
  used: Record<string, boolean>;
  queue: QueueItem[];
  log: LogEntry[];
  rel: Record<string, number>;
  ongoing: Ongoing[];
  bitti: string[];
  cay: number;
  signed: number;
  tekirUsed: boolean;
  danis: number;
  danisTerm: number;
  intro: number;
  lastWho: string | null;
  pending: Pending | null;
  cur: Cur | null;
  over: { key: string; months: number; term: number } | null;
  field?: Field | null;
  syn?: Record<string, number>;
  dropped?: string[];
  /** kampanya turu (sandığa giden, göreve başlamadan önce): anket, sözler, evrak sırası */
  kampanya?: { oy: number; vaatler: string[]; sira: string[]; i: number };
  /** göreve başlayış ve beyannamede verilen vaatler (VAATLER id'leri) */
  acilis?: Acilis;
  vaatler?: string[];
  /** açılış seçiminin sonucu (açılış evrakı farkı anar) */
  acilisSecim?: Tally;
  /** sandık defteri: m kalemin yazıldığı ay */
  defter?: (Kalem & { m: number })[];
  /** son yan etkinin doğduğu ay (ilçede 3 ayda en çok bir yan etki) */
  lastYan?: number;
  lastElection?: Tally;
  journal?: JournalEntry[];
}

/** Motorun bir kararın ardından döndürdüğü */
export interface TickEvent {
  ad: string;
  msg: string;
  e?: Effect | null;
  syn?: boolean;
}
export interface ChooseOut {
  d: Effect;
  td: Effect;
  events: TickEvent[];
  rel: Record<string, number>;
  over?: boolean;
  dead?: Meter;
  /** mühür basıldıysa: hangi göstergenin ne kadarlık kaybı silindi */
  muhur?: { k: Meter; v: number };
  /** zarlı seçeneğin sonucu */
  zar?: { iyi: boolean; msg?: string; oy?: number };
  /** kampanya evrakının ankete etkisi ve turun bitişi */
  oy?: number;
  kampanyaBitti?: boolean;
}
