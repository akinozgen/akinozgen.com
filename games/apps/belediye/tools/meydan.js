// Ana menü arka planı: Karakavak meydanı (belediye binası, çay ocağı, Tekir, tavlacı amcalar)
// meydanSVG(): 1920×1080 SVG metni (slice ile kırpılır). Harici dosya yok; sınıflar, kimlikler ve animasyonlar "md-" önekli.
// meydan(kök, { hour }): sahne denetimi → { enter, pause, resume, stop, setHour }
// Güvenli alan: yatayda sol %36 menünün altında kalır (sakin taraf). Dikey telefonda yalnız x≈710-1210 ve üst %45 görünür:
// cephe, makam penceresi ve Tekir bu kutudadır. Ultra genişte üst ve alt ~%12 kırpılır, orada önemli bir şey yok.
let MD_N = 0;
const MD_HOUR = h => (h >= 21 || h < 6 ? "gece" : h < 17 ? "gun" : "aksam"); // 21-5 gece, 6-16 gündüz, 17-20 akşamüstü

function meydanSVG() {
  const p = "md" + ++MD_N + "-", u = n => `url(#${p}${n})`; // gradyan kimlikleri her kopyada ayrı
  const S = (o, c, a) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`;
  const V = (o, v, a) => `<stop offset="${o}" class="md-s${v}"${a != null ? ` stop-opacity="${a}"` : ""}/>`; // renk paletten
  const L = (n, ...s) => `<linearGradient id="${p}${n}" x2="0" y2="1">${s.join("")}</linearGradient>`;
  const H = (n, ...s) => `<linearGradient id="${p}${n}">${s.join("")}</linearGradient>`;
  const RG = (n, ...s) => `<radialGradient id="${p}${n}">${s.join("")}</radialGradient>`;
  const rep = (xs, f) => xs.map(f).join("");
  const ln = (d, c, w, k = "") => `<path class="md-r${k}" d="${d}" stroke="${c}" stroke-width="${w}"/>`; // yuvarlak uçlu çizgi
  const lv = (d, v, w, k = "") => `<path class="md-r md-k${v}${k}" d="${d}" stroke-width="${w}"/>`; // paletten çizgi
  const f = (v, d, k = "") => `<path class="md-f${v}${k}" d="${d}"/>`; // paletten dolgu
  const P = (d, c, k = "") => `<path${k ? ` class="${k}"` : ""} d="${d}" fill="${c}"/>`;
  const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
  const O = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`; // yol içinde daire
  const arch = (x, y, w, h) => `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}z`;
  const q = v => Math.round(v * 10) / 10;
  let sd = 20240917; const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647; // her çağrıda aynı dizilim
  const SK = "#f7cba6", SKD = "#e8a883", INK = "#2b1a17", LIT = "#ffd772", GRN = "#1b3a2e", BR = "#c9a54c";

  // ── Gökyüzü: yıldızlar, bulut şeritleri (2400 birimde bir tekrar eder, kesintisiz kayar)
  const dots = n => { let d = ""; for (let i = 0; i < n; i++) d += `M${Math.round(rnd() * 1980 - 30)} ${Math.round(24 + rnd() * rnd() * 320)}h0`; return d; };
  const spark = (x, y, r) => `M${x} ${y - r}Q${x + r * .2} ${y - r * .2} ${x + r} ${y}Q${x + r * .2} ${y + r * .2} ${x} ${y + r}Q${x - r * .2} ${y + r * .2} ${x - r} ${y}Q${x - r * .2} ${y - r * .2} ${x} ${y - r}z`;
  const cloud = O(16, -16, 16) + O(42, -26, 24) + O(74, -20, 19) + O(98, -11, 12) + "M0 0h110a9 9 0 0 0 0 -18h-110a9 9 0 0 0 0 18z"; // defs'te bir kez
  const strip = cs => rep(cs, ([x, y, s]) => rep([0, 2400], o => `<use href="#${p}cld" class="md-fcl2" transform="translate(${x + o} ${y}) scale(${s})"/><use href="#${p}cld" class="md-fcl" transform="translate(${q(x + o + 5 * s)} ${q(y - 6 * s)}) scale(${Math.round(s * 93) / 100})"/>`));

  // ── Tepeler ve çevre yolu (traktör bu doğru üzerinde gider)
  const rY = x => q(394 - (x + 60) * 38 / 2050);
  const rows = rep([10, 21, 34, 50], d => `M-60 ${394 + d}L1990 ${356 + d}`), melons = rep([15, 27, 42], d => `M-60 ${394 + d}L1990 ${356 + d}`);
  const bushes = [...[20, 90, 170, 250, 330, 420, 500, 590, 660], ...[1236, 1290, 1350, 1440, 1520, 1610, 1700, 1790, 1880, 1950]].map(x => `M${x} ${rY(x) - 6}h0`).join("");

  // ── Arka sıra evler (anchor.ts'teki Karakavak silueti): gövdeler renk renk tek yol
  const B1 = 490, body = ["", "", ""];
  let roofs = "", caps = "", wins = "", lw1 = "";
  [[-40, 76, 70, 0, 1], [40, 90, 96, 1, 0], [134, 70, 78, 2, 1], [210, 96, 112, 0, 0], [312, 74, 82, 1, 1], [392, 88, 100, 2, 0], [486, 70, 76, 0, 1],
    [562, 92, 108, 1, 0], [658, 72, 84, 2, 1], [1198, 86, 96, 0, 1], [1288, 72, 118, 2, 0], [1364, 82, 86, 1, 1], [1500, 84, 90, 0, 1], [1706, 76, 100, 2, 1]]
    .forEach(([x, w, h, c, pitched], i) => {
      const t = B1 - h;
      body[c] += R(x, t, w, h);
      if (pitched) roofs += `M${x - 6} ${t}L${x + w / 2} ${t - 24}L${x + w + 6} ${t}z`;
      else caps += R(x - 3, t - 7, w + 6, 8);
      for (let r = 0; r < (h > 84 ? 2 : 1); r++) for (const fx of [.28, .72]) {
        const d = R(Math.round(x + w * fx - 6), t + 16 + r * 30, 12, 16);
        wins += d; if (!((i + r + (fx > .5)) % 3)) lw1 += d;
      }
    });
  const poplar = (x, h, w, b = B1) => `M${x} ${b - h}C${x + w} ${q(b - h * .72)} ${q(x + w * .9)} ${q(b - h * .2)} ${x + 2} ${b - 8}H${x - 2}C${q(x - w * .9)} ${q(b - h * .2)} ${x - w} ${q(b - h * .72)} ${x} ${b - h}z`;
  const plit = (x, h, w, b = B1) => `M${x} ${b - h}C${x - w} ${q(b - h * .72)} ${q(x - w * .9)} ${q(b - h * .2)} ${x - 2} ${b - 8}H${x}z`;
  const POP = [[62, 150, 15], [118, 118, 13], [262, 168, 16], [302, 128, 13], [454, 150, 15], [604, 176, 16], [690, 140, 14], [1510, 150, 14], [1760, 128, 13]];

  // ── Belediye binası
  const COLS = [862, 918, 1002, 1058], WU = [746, 798, 1092, 1144];
  const upG = rep(WU, x => arch(x, 268, 30, 66)) + arch(877, 274, 26, 60) + arch(1017, 274, 26, 60);
  const dnG = rep(WU, x => R(x, 384, 30, 56)) + R(877, 386, 26, 52) + R(1017, 386, 26, 52);
  const frames = rep(WU, x => arch(x - 4, 264, 38, 70) + R(x - 6, 334, 42, 5) + `M${x + 11} 262h8l-1 7h-6z` + R(x - 4, 380, 38, 62) + R(x - 7, 374, 44, 6) + R(x - 6, 440, 42, 5))
    + arch(874, 271, 32, 63) + arch(1014, 271, 32, 63) + R(874, 383, 32, 56) + R(1014, 383, 32, 56);
  const mull = rep(WU, x => `M${x + 15} 270V334M${x} 300H${x + 30}M${x + 15} 384V440M${x} 404H${x + 30}`) + "M890 276V334M877 302H903M1030 276V334M1017 302H1043M890 386V438M1030 386V438";
  const refl = rep([...WU, 877, 1017], x => `M${x + 3} 330L${x + 13} 306V318L${x + 7} 330zM${x + 3} 436L${x + 13} 412V424L${x + 7} 436z`);
  const n13 = [...Array(13).keys()], balc = rep(n13, i => R(911 + i * 8, 320, 3.6, 21)), roofB = rep(n13, i => R(732 + i * 8, 191, 3.5, 12) + R(1091 + i * 8, 191, 3.5, 12));
  const quoin = rep([...Array(10)], (_, i) => R(728, 256 + i * 20, 13, 10) + R(1179, 256 + i * 20, 13, 10));
  const rust = rep([370, 384, 398, 412, 426, 440], y => `M728 ${y}H846M1074 ${y}H1192`);
  const STEPS = [[840, 470, 240, 5], [828, 478, 264, 7], [816, 488, 288, 7], [804, 498, 312, 8]];
  // Türk bayrağı (G = en): ay dış çember merkezi 0,5G r 0,25G; iç çember 0,5625G r 0,2G; yıldız merkezi 0,8208G r 0,125G, bir kolu göndere bakar
  const G = 36, FL = 54, fx = v => q(v * G);
  const flagD = `M0 0C${FL * .3} -3 ${FL * .62} 3 ${FL} 0V${G}C${FL * .62} ${G + 3} ${FL * .3} ${G - 3} 0 ${G}z`;
  const star = [180, 324, 108, 252, 36].map((a, i) => `${i ? "L" : "M"}${q(.82083 * G + .125 * G * Math.cos(a * Math.PI / 180))} ${q(.5 * G + .125 * G * Math.sin(a * Math.PI / 180))}`).join("") + "z";
  const cres = `M${fx(.71125)} ${fx(.63369)}A${fx(.25)} ${fx(.25)} 0 1 1 ${fx(.71125)} ${fx(.36631)}A${fx(.2)} ${fx(.2)} 0 1 0 ${fx(.71125)} ${fx(.63369)}z`;

  // bayrak dizisi: ip + üçgen flamalar (kırmızı, beyaz, pirinç)
  const bunting = (x0, y0, x1, y1, sag, n, k) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + sag * 2, fl = ["", "", ""];
    for (let i = 1; i < n; i++) {
      const t = i / n, x = q((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1), y = q((1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1);
      fl[i % 3 === 2 ? 2 : i % 2] += `M${q(x - 7)} ${y}h14l-7 17z`;
    }
    return `<g class="md-bn${k}">${ln(`M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}`, "#3b2a20", 1.6)}${P(fl[0], "#c8321e")}${P(fl[1], "#f3f2ec")}${P(fl[2], "#e0b64e")}</g>`;
  };
  // kavun biçimli sokak lambası (anchor.ts'teki gibi); ışığı ayrı katmanda
  const lamp = (x, b, t, s) => P(`M${x - 12 * s} ${b}h${24 * s}l${-6 * s} ${-14 * s}h${-12 * s}z`, "#26302b") + `<path d="M${x} ${b - 12 * s}V${t + 10 * s}" stroke="#26302b" stroke-width="${5 * s}"/>`
    + ln(`M${x - 8 * s} ${t + 20 * s}Q${x} ${t + 12 * s} ${x + 8 * s} ${t + 20 * s}`, "#26302b", 2.2 * s)
    + P(`M${x - 6 * s} ${t - 9 * s}h${12 * s}l${-3 * s} ${-6 * s}h${-6 * s}z`, "#26302b") + `<ellipse class="md-glb" cx="${x}" cy="${t}" rx="${14 * s}" ry="${11 * s}"/>`
    + ln(`M${x - 13 * s} ${t}Q${x} ${t - 10 * s} ${x + 13 * s} ${t}M${x - 13 * s} ${t}Q${x} ${t + 10 * s} ${x + 13 * s} ${t}M${x} ${t - 10 * s}V${t + 10 * s}`, "#8fae45", 2 * s);
  const glow = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${u("gy")}"/>`;
  const tulip = (x, y, s = 1) => `M${x - 3 * s} ${y}C${x - 3 * s} ${y + 3 * s} ${x - 1.5 * s} ${y + 4 * s} ${x - 1.5 * s} ${y + 5.5 * s}C${x - 1.5 * s} ${y + 7 * s} ${x - 3 * s} ${y + 8 * s} ${x - 3 * s} ${y + 10 * s}H${x + 3 * s}C${x + 3 * s} ${y + 8 * s} ${x + 1.5 * s} ${y + 7 * s} ${x + 1.5 * s} ${y + 5.5 * s}C${x + 1.5 * s} ${y + 4 * s} ${x + 3 * s} ${y + 3 * s} ${x + 3 * s} ${y}z`;
  const awning = (x, y, w, h, c) => { let a = R(x, y, w, h), b = "", sc = ["", ""]; for (let i = 0; i * 8 < w; i++) { if (i % 2) b += R(x + i * 8, y, 8, h); sc[i % 2] += `M${x + i * 8} ${y + h}a4 4 0 0 0 8 0z`; } return P(a, "#f3f2ec") + P(b + sc[1], c) + P(sc[0], "#f3f2ec"); };

  // lale tarhı: elips içinde sıra sıra lale (sap, kırmızı ve sarı taç)
  const tul = { st: "", r: "", y: "" };
  for (const cx of [1300, 622]) for (let r = 0; r < 3; r++) for (let i = 0; i < 9 - r; i++) {
    const x = q(cx - 84 + r * 10 + i * (168 - r * 20) / (8 - r)), y = 894 + r * 7;
    tul.st += `M${x} ${y}v8`; tul[(i + r) % 3 ? "r" : "y"] += `M${x} ${y - 2}v-2`;
  }
  // güvercin (sola bakar, ayakları 0,0'da)
  const pigeon = (x, y, s, flip, i) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><g class="md-pg md-pg${i % 3 + 1}"><g class="md-pgf">
${ln("M-3 -4v4M1 -4v4", "#d9747a", 1.5)}${P("M-10 -10C-10 -16 -2 -18 6 -15L17 -12L16 -9L6 -5C0 -3 -8 -4 -10 -10z", "#9aa1b3")}
<g class="md-pgw">${P("M-3 -13C3 -15 10 -13 14 -10C9 -8 2 -8 -3 -10z", "#7a8194")}${ln("M3 -11.6l3 1M7 -11.6l3 1", "#4b5061", 1.2)}</g>
<g class="md-pgh">${P("M-11 -10C-12.5 -15 -11.5 -19 -8 -20C-5.5 -17 -5.5 -13 -6.5 -10z", "#6fa58f")}${P(O(-11, -20, 4), "#8a92a6")}${P("M-14.6 -20.4l-3.4 1.2 3.3 1z", "#e0c29a")}${P(O(-12.4, -21, 1), "#f4d7a0")}</g>
</g></g></g>`;

  // oturan amca (sağa bakar); B yansıtılarak çizilir
  const man = o => `${P(`M1534 794h14a6 5 0 0 1 0 8h-18z`, "#1f1612")}${ln("M1488 745H1528L1532 796", "#3a3a44", 19)}
${P(`M1540 797h14a6 5 0 0 1 0 8h-18z`, "#231913")}${ln("M1492 749H1535L1540 798", o.pants, 21)}
${P("M1470 752C1463 724 1467 694 1482 682H1510C1523 694 1525 724 1520 752z", o.coat)}${P("M1488 681h16l-8 11z", o.shirt)}${ln("M1497 700v0M1498 714v0M1499 728v0", o.btn, 3.4)}
<path d="M1491 673h14v10h-14z" fill="${SKD}"/>
${P(O(1498, 658, 19.5), SK)}<ellipse cx="1487" cy="661" rx="4" ry="5.5" fill="${SKD}"/>${P(O(1518, 662, 5.5), "#eea27f")}${P(O(1510, 666, 3.4), "#f2a49a")}
${o.hat ? P("M1477 655C1474 634 1492 625 1511 630C1520 633 1525 640 1527 647L1535 650C1530 655 1516 655 1507 653L1477 657z", "#57524b") + ln("M1479 650C1492 646 1510 646 1526 648", "#3f3b36", 2)
      : ln("M1481 648C1478 662 1482 672 1489 676", "#f1efe9", 5) + P("M1484 646C1488 640 1494 638 1500 639C1494 641 1489 645 1486 650z", "#f9dcc2")}
${o.hat ? "" : `<circle cx="1510" cy="656" r="5.2" fill="#fff" fill-opacity=".25" stroke="#2b2b2b" stroke-width="1.6"/>${ln("M1504.8 656L1490 659", "#2b2b2b", 1.3)}`}
${P(O(1509, 656, 1.9), INK)}${ln(o.hat ? "M1504 650q5 -3 10 0" : "M1503 648q6 -4 12 0", "#f1efe9", o.hat ? 2.6 : 3.6)}
${P(o.hat ? "M1504 670C1511 664 1522 664 1527 670C1522 675 1512 675 1504 670z" : "M1502 670C1510 662 1524 663 1530 671C1524 677 1511 677 1502 670z", "#f4f1ea")}
${o.tea ? P(tulip(1454, 738, 1.1), "#b8461c") + ln("M1450.7 738h6.6", "#fff", 1, "") : ""}
${o.cane ? ln("M1444 800L1454 706q2 -8 9 -5", "#5a3a22", 4) : ""}
<g class="${o.arm}">${ln(o.up, o.shirt, 12)}${ln(o.fore, o.shirt, 11)}${P(O(...o.hand, 6), SK)}${o.tsp || ""}</g>`;

    return `<svg class="md-root md-t-aksam" viewBox="0 0 1920 1080" width="100%" height="100%" style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Karakavak meydanı: belediye binası, makam penceresinde ışık, çay ocağı, tavla oynayan amcalar ve basamaklarda kedi Tekir" xmlns="http://www.w3.org/2000/svg">
<style>${meydanCSS()}</style>
<defs>
<linearGradient id="${p}sky" gradientUnits="userSpaceOnUse" x1="0" y1="-60" x2="0" y2="520">${V(0, "sk0")}${V(.42, "sk1")}${V(.78, "sk2")}${V(1, "sk3")}</linearGradient>
<linearGradient id="${p}hz" gradientUnits="userSpaceOnUse" x1="0" y1="250" x2="0" y2="500">${V(0, "sk3", 0)}${V(1, "sk3", .55)}</linearGradient>
<linearGradient id="${p}gd" gradientUnits="userSpaceOnUse" x1="0" y1="540" x2="0" y2="1080">${V(0, "sh", 0)}${V(1, "sh", .42)}</linearGradient>
<linearGradient id="${p}col">${V(0, "ws")}${V(.3, "wt")}${V(.65, "wc")}${V(1, "ws")}</linearGradient>
${RG("gy", S(0, "#fff3a0", .7), S(.35, "#ffd98a", .28), S(1, "#ffd98a", 0))}${RG("sun", S(0, "#fffbe6", .9), S(.3, "#fff2b8", .35), S(1, "#fff2b8", 0))}
${RG("dusk", S(0, "#ffe6a0", .95), S(.18, "#ffb36b", .5), S(.55, "#ff8a5c", .16), S(1, "#ff8a5c", 0))}${RG("moon", S(0, "#e8efff", .45), S(1, "#e8efff", 0))}
${RG("mkg", S(0, "#fff0bf", 1), S(.3, "#ffd27a", .5), S(1, "#ffb04a", 0))}${RG("mkl", S(0, "#fffdf0", .95), S(.45, "#fff3c8", .55), S(1, "#fff3c8", 0))}${RG("gold", S(0, "#fff3c0"), S(.4, "#e8c664"), S(1, "#9a7428"))}${RG("fld", S(0, "#ffd98a", .34), S(1, "#ffd98a", 0))}
${L("mkw", S(0, "#ffd88c"), S(1, "#e0914a"))}${L("br", S(0, "#f3dc97"), S(.5, "#c9a54c"), S(1, "#8a6a26"))}${L("kin", S(0, "#ffd58a"), S(1, "#c0703a"))}
${H("lsh", S(0, "#08111f", .55), S(1, "#08111f", 0))}${H("rip", S(0, "#fff", .14), S(.25, "#000", .2), S(.5, "#fff", .14), S(.75, "#000", .2), S(1, "#fff", .14))}
<radialGradient id="${p}vig" cx=".56" cy=".44" r=".78">${S(.55, "#060a18", 0)}${S(1, "#060a18", .5)}</radialGradient>
<path id="${p}cld" d="${cloud}"/><clipPath id="${p}fc"><path d="${flagD}"/></clipPath><clipPath id="${p}mk"><path d="${arch(934, 264, 52, 82)}"/></clipPath>
</defs>
<g class="md-cam">
<rect x="-60" y="-700" width="2040" height="1840" fill="${u("sky")}"/>

<g class="md-l0">
<g class="md-xd"><circle cx="1660" cy="206" r="170" fill="${u("sun")}"/><circle cx="1660" cy="206" r="38" fill="#fffae0"/></g>
<g class="md-xe"><circle cx="1330" cy="296" r="560" fill="${u("dusk")}"/><circle cx="1330" cy="296" r="44" fill="#ffeab0"/></g>
<g class="md-xn"><circle cx="1650" cy="196" r="150" fill="${u("moon")}"/><circle cx="1650" cy="196" r="33" fill="#fff4d2"/><path d="${O(1640, 188, 6) + O(1661, 206, 4.5) + O(1660, 182, 3)}" fill="#e6dab4"/></g>
<g class="md-xen"><g class="md-tw1"><path d="${spark(1186, 70, 7) + spark(620, 62, 6) + spark(1780, 104, 6)}" fill="#fff6d8"/></g>
<g class="md-tw2">${ln("M1320 122h0M1560 56h0M880 92h0M400 118h0M1880 40h0M1040 44h0M1990 150h0M760 150h0M1450 150h0", "#fff6d8", 4)}</g></g>
<g class="md-xn"><g class="md-tw1">${ln(dots(46), "#fff", 2.6)}</g><g class="md-tw2">${ln(dots(40), "#dfe6ff", 3.4)}</g>${ln(dots(30), "#b9c4ee", 1.8)}</g>
<g class="md-cl1 md-clo">${strip([[260, 150, .7], [980, 118, .55], [1620, 160, .8], [2130, 130, .6]])}</g>
<g class="md-cl2 md-clo">${strip([[40, 262, 1.25], [700, 212, .95], [1330, 250, 1.4], [1960, 196, 1.05]])}</g>
${f("h0", "M-60 330C120 298 300 286 460 312S760 352 900 326S1180 284 1360 300S1640 332 1760 300S1930 286 1990 296V540H-60z")}
${lv(rep([[1236, 318, 1420, 302], [1560, 322, 1740, 306], [300, 322, 470, 310], [30, 320, 180, 308]], ([a, b, c, d]) => rep([0, 7, 14, 21], k => `M${a + k} ${b + k}L${c + k * 2} ${d + k}`)), "h2", 2.6, " md-pch")}
${f("h1", "M-60 394L1990 356V540H-60z")}${lv(rows, "h2", 3)}${lv(melons, "h3", 6, " md-mln")}${lv("M-60 394L1990 356", "rd", 5)}${lv(bushes, "tr1", 11)}
<g class="md-trk"><g class="md-trkb">${ln("M8 -6L17 -7", "#3a2a20", 1.6)}${P(R(16, -14, 28, 9), "#b8743a")}${P(O(21, -16, 4) + O(29, -17, 4.5) + O(37, -16, 4) + O(25, -21, 3.6) + O(33, -21, 3.8), "#7aa33e")}
${P(O(30, -3, 3.2), "#222")}${P(R(-14, -12, 17, 7) + R(-1, -23, 13, 2.5), "#c8321e")}${ln("M2 -21V-6M11 -21V-6M-8 -12V-18", "#3a2a20", 1.5)}${P(O(6, -15, 2.6), SK)}
${P(O(7, -6, 6.5) + O(-10, -3.5, 3.5), "#222")}${P(O(7, -6, 2.5) + O(-10, -3.5, 1.2), "#e0b64e")}<circle class="md-puff" cx="-8" cy="-21" r="2.4" fill="#fff" fill-opacity=".7"/></g></g>
<rect x="-60" y="250" width="2040" height="290" fill="${u("hz")}"/>
</g>

<g class="md-l1">
${f("tr1", rep(POP, ([x, h, w]) => poplar(x, h, w)))}${f("tr0", rep(POP, ([x, h, w]) => plit(x, h, w)))}
${f("hs0", body[0])}${f("hs1", body[1])}${f("hs2", body[2])}${f("rf", roofs)}${f("tw2", caps)}${f("gl", wins, " md-win")}<path class="md-xe" d="${lw1}" fill="${LIT}"/>
${f("tw", R(1450, 300, 44, 190) + R(1442, 282, 60, 20))}${f("tw2", R(1480, 300, 14, 190) + R(1442, 298, 60, 4))}${f("rf", "M1442 284L1472 238L1502 284z")}
${ln("M1472 238V228", BR, 3)}<circle cx="1472" cy="225" r="3" fill="${BR}"/><circle cx="1472" cy="320" r="14" fill="#fff5d6" stroke="${BR}" stroke-width="3"/>${ln("M1472 320V310M1472 320l7 5", "#28304f", 2.5)}
${f("gl", "M1464 404a8 8 0 0 1 16 0v22h-16z")}<path class="md-xen" d="M1464 404a8 8 0 0 1 16 0v22h-16z" fill="${LIT}"/>
${f("tw", R(1782, 262, 18, 228) + R(1785, 232, 12, 30) + R(1818, 440, 140, 50) + "M1824 442A64 58 0 0 1 1952 442z")}${f("tw2", R(1776, 318, 30, 8) + R(1794, 262, 6, 228) + R(1818, 440, 140, 6))}
${f("rf", "M1783 234L1791 186L1799 234z")}${ln("M1791 186V178M1888 384V372", BR, 2.4)}${P(O(1791, 176, 2.4), BR)}${P("M1884 368a6 6 0 1 0 8 -6a5 5 0 1 1 -8 6z", BR)}
${f("gl", R(1788, 350, 6, 14) + R(1788, 280, 6, 12) + "M1846 490v-24a8 8 0 0 1 16 0v24zM1914 490v-24a8 8 0 0 1 16 0v24z", " md-win")}
<rect x="-60" y="330" width="840" height="170" fill="${u("lsh")}"/>
</g>

<g class="md-l2">
${f("gr0", R(-60, 478, 2040, 662))}${f("gr2", R(-60, 478, 2040, 20))}
${lv(rep([512, 534, 564, 602, 648, 702, 764, 834, 912, 998, 1092], y => `M-60 ${y}H1980`) + rep([...Array(38)], (_, i) => { const xb = -2000 + i * 160; return `M${q(960 + (xb - 960) * .2333)} 498L${xb} 1140`; }), "gr1", 2, " md-pav")}
<rect x="-60" y="540" width="2040" height="600" fill="${u("gd")}"/><path class="md-fgr1 md-pav" fill-rule="evenodd" d="M690 878a270 56 0 1 0 540 0a270 56 0 1 0 -540 0zM730 878a230 46 0 1 0 460 0a230 46 0 1 0 -460 0z"/>
${lamp(520, 546, 262, 1.1)}${bunting(716, 212, 520, 258, 30, 11, "")}

${ln("M1150 204V147", "#d9d4c4", 3)}${P(O(1150, 145, 3.4), BR)}
<g transform="translate(1151.5 149)"><g class="md-flg">${P(flagD, "#e30a17")}${P(cres + star, "#fff")}<g clip-path="${u("fc")}"><rect class="md-rip" x="${-FL}" y="-4" width="${FL * 2}" height="${G + 8}" fill="${u("rip")}"/></g></g></g>
<g transform="rotate(-24 772 178)">${P("M762 170a10 12 0 0 0 20 0z", "#e8e6df")}</g>${ln("M772 178l2 10", "#9a9a94", 2)}
${f("wt", R(728, 187, 104, 4) + R(1088, 187, 104, 4) + R(725, 183, 9, 21) + R(1186, 183, 9, 21) + roofB)}
${f("wt", "M832 205L960 150L1088 205z")}${f("wl", "M852 201L960 159L1068 201z")}
${ln("M944 196q-11 -6 -13 -16M976 196q11 -6 13 -16", BR, 2)}${ln("M935 188h0M939 193h0M985 188h0M981 193h0", BR, 4.4)}<circle cx="960" cy="147" r="3.5" fill="${BR}"/>
<circle cx="960" cy="184" r="13.5" fill="#fffaf0" stroke="${BR}" stroke-width="3"/><circle cx="960" cy="184" r="10.5" fill="none" stroke="#28304f" stroke-width="2" stroke-dasharray="1.2 4.3"/>
<g class="md-hh" transform="rotate(150 960 184)">${ln("M960 185V177", "#28304f", 2.6)}</g><g class="md-mh" transform="rotate(0 960 184)">${ln("M960 185V174", "#28304f", 1.8)}</g><circle cx="960" cy="184" r="1.6" fill="#28304f"/>
${f("wt", R(716, 203, 488, 10))}${f("ws", R(720, 212, 480, 2))}
${f("wl", R(728, 213, 464, 243))}${f("ws", R(846, 253, 228, 203))}${f("wt", quoin)}${lv(rust, "ws", 1.6)}
${P(R(724, 213, 472, 34), GRN)}${ln("M726 216.5H1194M726 243.5H1194", BR, 1.8)}
<text x="960" y="240" class="md-f1 md-c" font-size="25.5" fill="#ecd592" letter-spacing="1.6">KARAKAVAK BELEDİYESİ</text>
${f("wt", R(724, 247, 472, 6))}
${f("wt", frames)}${f("gl", upG + dnG, " md-win")}<path class="md-xde" d="${refl}" fill="#fff" fill-opacity=".22"/>
<path class="md-xe" d="${arch(1144, 268, 30, 66) + R(746, 384, 30, 56)}" fill="${LIT}"/>
${lv(mull, "wt", 2)}
<g><rect x="1016" y="318" width="28" height="16" rx="1.5" fill="#dcdcd4"/><circle cx="1036" cy="326" r="5.5" fill="#9b9d98"/>${ln("M1020 322h8M1020 326h8M1020 330h8", "#a9aaa4", 1.4)}</g>
<circle class="md-mkg" cx="960" cy="300" r="130" fill="${u("mkg")}"/>
${f("wt", arch(928, 258, 64, 88))}
<g clip-path="${u("mk")}"><rect x="930" y="260" width="60" height="90" fill="${u("mkw")}"/><circle cx="974" cy="304" r="34" fill="${u("mkl")}"/>
<rect x="944" y="274" width="15" height="11" fill="#6d8f3e" stroke="${BR}" stroke-width="1.8"/><ellipse cx="951.5" cy="280" rx="3" ry="2.3" fill="#e8d86a"/>
${P("M948 318V302C948 294 962 294 962 302V318z", "#7a2433")}${ln("M952 302h0M958 302h0", "#a4434f", 2.2)}
${P(R(932, 313, 58, 9), "#5a3220")}${ln("M974 313V302", BR, 2)}${P("M966 303h16l-4 -7h-8z", "#2f6b3f")}${P(O(974, 305, 3), "#fff4b8")}${P(tulip(941, 303, 1), "#b8461c")}${ln("M937.8 303h6.4", "#fff", 1)}
${P("M934 262C939 280 937 302 940 318H934z", "#9a2a36")}${P("M986 262C981 280 983 302 980 318H986z", "#9a2a36")}${P(R(934, 262, 52, 5), "#7a1f2a")}
<rect class="md-mkb" x="930" y="260" width="60" height="90" fill="#fff4cf"/></g>
${f("wt", arch(930, 376, 60, 94))}${P(arch(936, 382, 48, 88), "#6a3a24")}${f("gl", "M936 406A24 24 0 0 1 984 406z")}<path class="md-xen" d="M936 406A24 24 0 0 1 984 406z" fill="${LIT}"/>
${ln("M960 406V384M960 406L943 389M960 406L977 389M936 406H984", "#6a3a24", 2)}${P(R(941, 414, 15, 22) + R(964, 414, 15, 22) + R(941, 442, 15, 22) + R(964, 442, 15, 22), "#7b4630")}${ln("M960 406V470", "#4a2616", 2)}${P(O(956, 448, 1.7) + O(964, 448, 1.7), BR)}
<path d="${rep(COLS, x => R(x - 9, 262, 18, 190))}" fill="${u("col")}"/>${lv(rep(COLS, x => `M${x - 4} 267V448M${x + 4} 267V448`), "ws", 1.4, " md-flu")}
${f("wt", rep(COLS, x => R(x - 14, 253, 28, 5) + R(x - 11, 258, 22, 4) + O(x - 11, 260, 3) + O(x + 11, 260, 3) + R(x - 12, 452, 24, 5)))}
${f("wt", R(722, 348, 476, 8))}${f("ws", R(724, 356, 122, 3) + R(1074, 356, 122, 3))}
${f("wb", R(724, 454, 472, 16) + rep(COLS, x => R(x - 14, 457, 28, 13)))}${f("wt", R(724, 454, 122, 3) + R(1074, 454, 122, 3))}
${f("wt", R(906, 346, 108, 7) + "M914 353h8v4q0 8 -8 8zM1006 353h-8v4q0 8 8 8z" + R(906, 316, 108, 4) + R(906, 341, 108, 5) + balc + R(903, 313, 8, 33) + R(1009, 313, 8, 33))}${f("ws", R(908, 353, 104, 3))}
${P(`M901 304h12l-2 9h-8zM1007 304h12l-2 9h-8z`, "#b5553a")}${P(O(907, 305, 4.5) + O(1013, 305, 4.5) + O(900, 305, 3) + O(1020, 305, 3), "#4f8a3a")}${P(O(904, 299, 4) + O(910, 298, 4.4) + O(1010, 298, 4.4) + O(1016, 299, 4), "#d8343a")}
${ln("M960 356V364", "#3a3a3a", 1.4)}${P("M954 364h12l-2 12h-8z", "#2d2d2d")}${P("M956.5 366h7l-1.5 8h-4z", "#e8e0c0")}<path class="md-xen" d="M956.5 366h7l-1.5 8h-4z" fill="#ffe9a0"/>
${f("st", rep(STEPS, ([x, y, w]) => R(x, y, w, 3)))}${f("wb", rep(STEPS, ([x, y, w, h]) => R(x, y + 3, w, h)))}${f("sh", R(804, 506, 312, 4), " md-sho")}
${f("wt", R(786, 458, 18, 50) + R(1116, 458, 18, 50))}${f("wb", R(782, 454, 26, 6) + R(1112, 454, 26, 6))}${P("M786 442h18l-3 12h-12zM1116 442h18l-3 12h-12z", "#b5553a")}${f("tr1", O(795, 434, 11) + O(1125, 434, 11))}${f("tr0", O(792, 430, 6) + O(1122, 430, 6))}
<ellipse class="md-xn" cx="960" cy="470" rx="320" ry="280" fill="${u("fld")}"/>
${bunting(1204, 212, 1402, 262, 30, 11, " md-bn2")}

${P("M934 465h16l-2.5 6h-11z", "#3f6fb0")}${ln("M938 465h0M942 464.4h0M946 465h0", "#8a5a2a", 2.4)}
<g transform="translate(972 472)"><ellipse cx="2" cy="1" rx="19" ry="3" class="md-fsh md-sho"/>
<g class="md-ctl">${ln("M11 -4C27 -3 31 -15 26 -27", "#e98a33", 6.5)}<path class="md-r" d="M11 -4C27 -3 31 -15 26 -27" stroke="#b85a1c" stroke-width="6.5" stroke-dasharray="3 4"/></g>
${P("M-14 0C-18 -10 -16 -23 -8 -29H8C16 -23 18 -10 14 0z", "#ec8b34")}${P("M-6 -1C-8 -11 -6 -21 0 -25C6 -21 8 -11 6 -1z", "#fde7c8")}
${ln("M-14 -8q3 -2 5 0M-15 -14q3 -2 5 0M14 -8q-3 -2 -5 0M15 -14q-3 -2 -5 0", "#b85a1c", 2)}<path d="M-9 0a4 2.4 0 1 1 8 0zM1 0a4 2.4 0 1 1 8 0z" fill="#fde7c8"/>
<g class="md-cel">${P("M-12.5 -39L-10.5 -53L-2 -45z", "#ec8b34")}${P("M-10.6 -41.5L-9.6 -49L-5 -45z", "#f2a7a0")}</g><g class="md-cer">${P("M12.5 -39L10.5 -53L2 -45z", "#ec8b34")}${P("M10.6 -41.5L9.6 -49L5 -45z", "#f2a7a0")}</g>
<ellipse cx="0" cy="-36" rx="13.8" ry="11.6" fill="#ec8b34"/>${ln("M0 -47v5M-5 -46l1.5 4.5M5 -46l-1.5 4.5M-14 -35h4M-13.6 -31h3.5M14 -35h-4M13.6 -31h-3.5", "#b85a1c", 1.7)}
<ellipse cx="0" cy="-31" rx="6.6" ry="4.6" fill="#fde7c8"/><g class="md-cey">${P(`M-7.3 -37a2.3 3 0 1 0 4.6 0a2.3 3 0 1 0 -4.6 0zM2.7 -37a2.3 3 0 1 0 4.6 0a2.3 3 0 1 0 -4.6 0z`, INK)}${P(O(-5.8, -38.2, .9) + O(4.2, -38.2, .9), "#fff")}</g>
${P("M-1.7 -33.6h3.4l-1.7 2.1z", "#e7888a")}${ln("M-2.6 -30.2q1.3 1.5 2.6 0q1.3 1.5 2.6 0", "#8a4a2a", 1)}${ln("M-7 -32l-9 -1.6M-7 -30.3l-9 1.6M7 -32l9 -1.6M7 -30.3l9 1.6", "#fff", .8)}</g>

<ellipse cx="1300" cy="526" rx="92" ry="7" class="md-fsh md-sho"/>
${P(R(1232, 418, 128, 106), "#7c3423")}${ln("M1236 488H1356M1296 488V522", "#5e2618", 3)}${P(R(1244, 432, 104, 44), "#3a1a12")}<rect class="md-xen" x="1244" y="432" width="104" height="44" fill="${u("kin")}"/>
${P(R(1265, 472, 26, 4) + R(1272, 441, 12, 5), "#8a6a26")}${P("M1268 472C1261 466 1260 454 1266 448C1270 445 1286 445 1290 448C1296 454 1295 466 1288 472z", u("gold"))}${ln("M1263 458H1293M1264 466H1292", "#9a7428", 1.4)}${ln("M1262 451q-4 3 0 8M1294 451q4 3 0 8M1292 463h6v3", "#8a6a26", 1.8)}<ellipse cx="1278" cy="436" rx="8" ry="6" fill="#f3f2ec"/>${ln("M1271 436h14", "#c8321e", 2)}${ln("M1286 433l5 -3", "#f3f2ec", 2.4)}${P(O(1278, 429.5, 1.8), "#c8321e")}
${ln("M1276 426q-5 -7 0 -13t0 -13", "#fff", 2.4, " md-stm")}${ln("M1282 426q5 -7 0 -13t0 -13", "#fff", 2.4, " md-stm md-stm2")}${ln("M1279 424q-4 -6 0 -12t0 -12", "#fff", 2, " md-stm md-stm3")}
<ellipse cx="1322" cy="476" rx="19" ry="2.6" fill="${BR}"/>${P(tulip(1310, 465) + tulip(1320, 465) + tulip(1330, 465), "#b8461c")}${ln("M1307 465h6M1317 465h6M1327 465h6", "#fff", 1)}
${P(R(1238, 476, 116, 6), "#b27a48")}${awning(1224, 404, 144, 14, "#c8321e")}${P(R(1220, 396, 152, 9), "#4b2317")}
<rect x="1246" y="368" width="100" height="26" rx="3" fill="${GRN}" stroke="${BR}" stroke-width="2"/><text x="1296" y="387.5" class="md-f2 md-c" font-size="17.5" fill="#f3f2ec" letter-spacing="1.4">ÇAY OCAĞI</text>
${P(R(1374, 506, 34, 18), "#a36a3a")}${ln("M1374 512h34M1374 518h34", "#7a4a26", 1.4)}${P(O(1382, 503, 7.5) + O(1398, 503, 7.5) + O(1390, 497, 7), "#d9c65a")}${ln("M1382 496v14M1398 496v14M1390 490v14", "#8fae45", 1.6)}

<ellipse cx="1402" cy="553" rx="26" ry="4" class="md-fsh md-sho"/>${lamp(1402, 552, 266, 1.1)}

<ellipse cx="1632" cy="550" rx="120" ry="6" class="md-fsh md-sho"/>
${f("hs2", R(1528, 402, 204, 146))}${f("rf", "M1516 404L1556 366H1704L1744 404z")}${f("ws", R(1514, 402, 232, 5))}
${f("gl", R(1550, 416, 26, 34) + R(1617, 416, 26, 34) + R(1684, 416, 26, 34), " md-win")}<path class="md-xe" d="${R(1617, 416, 26, 34)}" fill="${LIT}"/>
${P(rep([1550, 1617, 1684], x => R(x - 9, 416, 8, 34) + R(x + 27, 416, 8, 34)), "#3d6b4a")}${P(rep([1550, 1617, 1684], x => R(x - 3, 450, 32, 5)), "#8a4a2a")}${ln(rep([1550, 1617, 1684], x => `M${x + 2} 448h0M${x + 10} 447h0M${x + 18} 448h0M${x + 25} 447h0`), "#d8343a", 4)}
<rect x="1540" y="458" width="180" height="20" rx="2" fill="${GRN}" stroke="${BR}" stroke-width="1.6"/><text x="1630" y="473.5" class="md-f2 md-c" font-size="15.5" fill="#ecd592" letter-spacing="2.4">KIRAATHANE</text>
${awning(1534, 480, 192, 12, "#3d7a4a")}${f("gl", R(1546, 498, 118, 42))}<rect class="md-xen" x="1546" y="498" width="118" height="42" fill="${u("kin")}"/>
<path class="md-xen" d="${O(1574, 518, 6) + O(1608, 516, 6.5) + "M1564 540c0 -12 20 -12 20 0zM1597 540c0 -13 22 -13 22 0z" + R(1580, 526, 22, 3)}" fill="#3a1d14" fill-opacity=".75"/>
${P(R(1676, 496, 36, 52), "#6b3a24")}${f("gl", R(1682, 502, 24, 18))}${f("wb", R(1528, 540, 204, 8))}

${rep([[1300, 902], [622, 902]], ([x, y]) => `<ellipse cx="${x}" cy="${y + 4}" rx="118" ry="24" class="md-fwt"/><ellipse cx="${x}" cy="${y}" rx="108" ry="18" fill="#6b4a2e"/>`)}
${ln(tul.st, "#4f8a3a", 1.8)}${ln(tul.r, "#d8343a", 6)}${ln(tul.y, "#f2c84b", 6)}
<ellipse cx="960" cy="902" rx="214" ry="16" class="md-fsh md-sho"/>${f("ws", "M760 870v24a200 36 0 0 0 400 0v-24z")}<ellipse class="md-fwt" cx="960" cy="870" rx="200" ry="36"/><ellipse class="md-fwa" cx="960" cy="870" rx="184" ry="29"/>
${ln("M830 880q40 12 90 12M1010 892q60 -2 104 -16M870 858q30 -6 60 -6", "#fff", 2.2, " md-wav")}
${ln("M912 852q-34 -34 -70 8M1008 852q34 -34 70 8M924 846q-14 -40 -48 -30M996 846q14 -40 48 -30", "#e9f6ff", 2.6, " md-jet")}
${f("wb", R(906, 856, 108, 10))}${f("wc", R(914, 812, 92, 46))}${f("ws", R(984, 812, 22, 46))}${f("wt", R(902, 800, 116, 13))}<rect x="936" y="824" width="46" height="22" rx="2" fill="${u("br")}"/>${ln("M944 831h30M946 837h26", "#8a6a26", 1.6)}
<ellipse cx="960" cy="744" rx="64" ry="55" fill="${u("gold")}"/>${ln("M960 690Q936 744 960 799M960 690Q984 744 960 799M960 690Q913 744 960 799M960 690Q1007 744 960 799M960 690Q895 744 960 799M960 690Q1025 744 960 799", "#9a7428", 2.4, " md-mst")}
${ln("M960 692q2 -10 10 -14", "#8a6a26", 4)}${P("M968 680q14 -12 27 -3q-12 10 -27 3z", "#b99a3c")}<g class="md-xde"><path class="md-tw1" d="${spark(928, 716, 9)}" fill="#fff"/></g>
<g class="md-pgs md-xde">${[[880, 588, 1, 0], [928, 616, 1.05, 1], [1016, 580, .95, 0], [1100, 668, 1.12, 1], [1158, 602, .92, 0], [1250, 720, 1.2, 0], [978, 692, 1.05, 1], [792, 930, 1.35, 0], [1150, 944, 1.4, 1]].map(([x, y, s, fl], i) => pigeon(x, y, s, fl, i)).join("")}</g>
<g class="md-glw md-xen"><g class="md-brth">${glow(520, 262, 80) + glow(1402, 266, 80) + glow(960, 370, 36)}</g></g>
</g>

<g class="md-l3">
${f("nt", "M40 1120C60 900 72 700 92 520C100 460 96 420 110 380L150 384C136 430 142 470 136 530C120 700 118 900 132 1120z" + O(40, 110, 140) + O(180, 60, 120) + O(300, 150, 96) + O(110, 270, 104) + O(-30, 250, 100) + O(236, 262, 78))}
${lv("M120 470C160 436 200 418 244 404", "nt", 13)}
<ellipse cx="1580" cy="803" rx="175" ry="11" class="md-fsh md-sho"/>
${P(R(1446, 690, 268, 9) + R(1446, 707, 268, 9), "#a0602f")}${ln("M1452 686V800M1708 686V800", "#2e2a2a", 7)}${ln("M1456 764q-8 18 -4 34M1704 764q8 18 4 34", "#2e2a2a", 6)}
${man({ pants: "#4b4b57", coat: "#7b4b2b", shirt: "#e9dfc8", btn: "#c9a54c", hat: 1, tea: 1, arm: "md-arma", up: "M1504 694L1518 724", fore: "M1518 724L1544 716", hand: [1549, 714] })}
<g transform="translate(3160 0) scale(-1 1)">${man({
    pants: "#5a5d66", coat: "#34426b", shirt: "#d9d3c2", btn: "#e9e5d8", hat: 0, tea: 1, cane: 1, arm: "md-armb", up: "M1504 694L1514 726", fore: "M1514 726L1530 722", hand: [1534, 720],
    tsp: `<g class="md-tsp"><path class="md-r" d="M1534 724C1527 732 1529 743 1534 745C1539 743 1541 732 1534 724" stroke="#8b1e2a" stroke-width="2.8" stroke-dasharray=".1 3.3"/>${ln("M1534 745v6", "#8b1e2a", 1.6)}</g>`
  })}</g>
${P(R(1436, 747, 288, 8), "#b06a36")}${P(R(1436, 755, 288, 7), "#7d4424")}
${P("M1552 738H1608L1614 750H1546z", "#7a3f1f")}${P("M1555 740H1605L1609 748H1551z", "#e9d3a4")}${ln("M1580 740V748", "#7a3f1f", 1.6)}
${P("M1558 740l3 4 3 -4zM1570 740l3 4 3 -4zM1586 740l3 4 3 -4zM1598 740l3 4 3 -4z", "#8a2a1e")}${P("M1564 740l3 4 3 -4zM1592 740l3 4 3 -4z", "#2f3a2e")}
${P(O(1560, 747, 2.2) + O(1598, 747, 2.2) + O(1566, 747, 2.2), "#f3f2ec")}${P(O(1592, 747, 2.2) + O(1604, 747, 2.2), "#b3341f")}
<g class="md-dice">${P(R(1570, 738, 5, 5) + R(1580, 739, 5, 5), "#fff")}${ln("M1572.5 740.5h0M1582.5 741.5h0", INK, 1.6)}</g>
<ellipse cx="1822" cy="1012" rx="40" ry="6" class="md-fsh md-sho"/>${lamp(1822, 1010, 586, 2)}
<g class="md-glw md-xen"><g class="md-brth">${glow(1822, 586, 150)}</g></g>
</g>
</g>
<rect class="md-vg" x="-10" y="-10" width="1940" height="1100" fill="${u("vig")}"/>
<rect class="md-fl" x="-10" y="-10" width="1940" height="1100" fill="#ffe2a6"/>
</svg>`;
}

// Palet, görünürlük ve animasyonlar. Hareket yalnız transform ve opacity; paletler CSS değişkeni.
function meydanCSS() {
  const K = "sk0 sk1 sk2 sk3 h0 h1 h2 h3 rd cl cl2 hs0 hs1 hs2 rf gl tw tw2 tr0 tr1 wl ws wt wc wb st gr0 gr1 gr2 lg sh nt wa".split(" ");
  const PAL = {
    gun: "#4a9be0 #7fbdea #bfe0f0 #f1efd8 #a8c7a8 #9cc265 #7eaa4c #e6e08a #efe3c6 #fff #d3e3f0 #f2e3c7 #e8cfaa #f5dcb9 #c95a40 #8db4cf #efe3cb #d2c1a2 #72a94f #4f853a #f3e6cc #dcc6a1 #fff8e8 #fbf3e2 #cdb997 #eadcc0 #dfcfae #c9b690 #d4c29e #f1e9ae #6b5a3e #3d6034 #8fcbe2",
    aksam: "#2b3781 #7c5aa3 #ee8c63 #ffd08a #a2809a #86914c #6b7a3e #ecc868 #f0c690 #fbc79c #c07d8e #f0bb8f #e0a47f #f3cba0 #bc4a3b #7a7fae #efbd95 #c18876 #647f3e #465f31 #f6cc9d #d69a76 #ffe6bf #fbdcb0 #c19476 #e7b890 #d6a47d #bd8a66 #c99673 #fff1a2 #5a2f3a #3b3a2a #e9a48e",
    gece: "#050b22 #0d1a46 #1f2d66 #354080 #1b2850 #16224a #111b3e #2d3d6c #3a4679 #27336a #1b2553 #33417a #2a376f #394885 #573a60 #1c2657 #3b4985 #2b386e #1c2c4b #13203d #475891 #34437b #5b6ba7 #53649f #2f3c71 #3e4c85 #2b3565 #222b56 #293361 #fff7b8 #030718 #0c1630 #1d2b60",
  };
  const t = (s, v) => `${s}{transform:${v}}`, kf = (n, b) => `@keyframes md-${n}{${b}}`, I = " infinite";
  // makama kamera itişi: log ölçekte yumuşak büyüme, pencere ekran ortasına kayar
  const WX = 960, WY = 302, SC = 9;
  let push = "";
  for (let i = 0; i <= 10; i++) {
    const e = (i / 10) ** 2 * (3 - 2 * i / 10), s = SC ** e, x = WX + e * (960 - WX), y = WY + e * (540 - WY);
    push += t(i * 10 + "%", `translate(${(x - WX * s).toFixed(1)}px,${(y - WY * s).toFixed(1)}px) scale(${s.toFixed(3)})`);
  }
  const fly = (n, a, b, c) => kf("fly" + n, `0%,100%{transform:none}15%{transform:translate(${a})}50%{transform:translate(${b})}80%{transform:translate(${c})}`);
  return Object.entries(PAL).map(([k, v]) => `.md-t-${k}{${v.split(" ").map((c, i) => `--md-${K[i]}:${c}`).join(";")}}`).join("")
    + K.map(k => `.md-f${k}{fill:var(--md-${k})}`).join("") + "h2 h3 rd tr1 gr1 ws wt nt".split(" ").map(k => `.md-k${k}{stroke:var(--md-${k})}`).join("")
    + "sk0 sk1 sk2 sk3 ws wt wc sh".split(" ").map(k => `.md-s${k}{stop-color:var(--md-${k})}`).join("") + `
.md-f1{font-family:"Alfa Slab One",Rockwell,Georgia,serif}.md-f2{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700}.md-c{text-anchor:middle}
.md-r{fill:none;stroke-linecap:round;stroke-linejoin:round}.md-glb{fill:var(--md-lg)}.md-sho{fill-opacity:.3}.md-pav{opacity:.55}.md-pch{opacity:.55}.md-mln{stroke-dasharray:0 15}.md-wav{opacity:.45}.md-jet{opacity:.7}.md-mst{opacity:.75}
.md-xd,.md-xe,.md-xn,.md-xen,.md-xde{display:none}
.md-t-gun :is(.md-xd,.md-xde),.md-t-aksam :is(.md-xe,.md-xen,.md-xde),.md-t-gece :is(.md-xn,.md-xen){display:inline}
.md-t-gece .md-clo{opacity:.7}.md-t-gece .md-win{fill:#ffd772}
.md-t-aksam .md-glw{opacity:.75}.md-t-gun .md-mkg{opacity:.5}.md-t-gece .md-mkg{opacity:1}.md-mkb{opacity:0}.md-vg,.md-fl{pointer-events:none}
.md-cam{transform-origin:0 0}.md-in .md-cam{animation:md-push .9s linear forwards}
.md-fl{opacity:0;transition:opacity .18s}.md-in .md-fl{animation:md-fl .9s ease-in forwards}.md-inr .md-fl{opacity:1}
.md-mkg{transform-box:fill-box;transform-origin:center;opacity:.9}.md-in .md-mkg{animation:md-mkg .9s ease-in forwards}.md-in .md-mkb{animation:md-mkb .9s ease-in forwards}
.md-flg{transform-box:fill-box;transform-origin:0 50%;animation:md-wave 2.8s ease-in-out${I}}.md-rip{animation:md-rip 1.7s linear${I}}
.md-stm{opacity:0;animation:md-stm 3.4s ease-out${I}}.md-stm2{animation-delay:-1.1s}.md-stm3{animation-delay:-2.3s}
.md-brth{animation:md-brth 5s ease-in-out${I}}.md-cl1{animation:md-cl 420s linear${I}}.md-cl2{animation:md-cl 260s linear${I}}
.md-tw1{animation:md-tw 3.2s ease-in-out${I}}.md-tw2{animation:md-tw 4.1s -2s ease-in-out${I}}
.md-ctl{transform-origin:11px -4px;animation:md-tail 3.8s ease-in-out${I}}
.md-cey,.md-cer,.md-cel,.md-pgh,.md-pgw,.md-dice,.md-puff,.md-bn,.md-bn2{transform-box:fill-box;transform-origin:center}
.md-cey{transition:transform .07s}${t(".md-blink .md-cey", "scaleY(.1)")}.md-cer,.md-cel{transform-origin:50% 100%}.md-ear .md-cer{animation:md-ear .4s}
.md-bn,.md-bn2{transform-origin:50% 0;animation:md-bn 4.6s ease-in-out${I}}.md-bn2{animation-delay:-2.1s}
${t(".md-trk", "translate(2010px,355.6px)")}.md-trkgo .md-trk{animation:md-trk 36s linear forwards}.md-trkgo .md-trkb{animation:md-bob .26s${I} alternate}.md-trkgo .md-puff{animation:md-puff 1.2s${I}}
.md-pgh{transform-origin:80% 90%;transition:transform .12s}${t(".md-pk .md-pgh", "translate(-2px,6px) rotate(-38deg)")}.md-pgw{transform-origin:0 40%}
.md-fly .md-pgw{animation:md-flap .13s 18 alternate}.md-fly .md-pg1 .md-pgf{animation:md-fly1 2.5s ease-in-out}.md-fly .md-pg2 .md-pgf{animation:md-fly2 2.4s .12s ease-in-out}.md-fly .md-pg3 .md-pgf{animation:md-fly3 2.6s .06s ease-in-out}
.md-arma{transform-origin:1504px 694px}.md-ta .md-arma{animation:md-shake 1.1s ease-in-out}.md-ta .md-dice{animation:md-dice 1.1s ease-out}
.md-armb{transform-origin:1504px 694px}.md-tb .md-armb{animation:md-reach 1.3s ease-in-out}.md-tsp{transform-origin:1534px 724px;animation:md-tsp 2.2s ease-in-out${I}}
${kf("push", push)}${kf("fl", "0%,55%{opacity:0}100%{opacity:1}")}${kf("mkg", "to{opacity:1;transform:scale(1.6)}")}${kf("mkb", "0%,20%{opacity:0}100%{opacity:.75}")}
${kf("wave", t("0%,100%", "none") + t("30%", "skewY(1.4deg) scaleX(.97)") + t("65%", "skewY(-2.6deg) scaleX(.94)"))}${kf("rip", t("to", `translateX(${54}px)`))}
${kf("stm", `0%{transform:translate(0,6px);opacity:0}30%{opacity:.75}100%{transform:translate(6px,-24px);opacity:0}`)}${kf("brth", "50%{opacity:.8}")}
${kf("cl", t("from", "translateX(-2400px)") + t("to", "none"))}${kf("tw", "50%{opacity:.35}")}
${kf("tail", t("0%,100%", "none") + t("40%", "rotate(-16deg)") + t("70%", "rotate(5deg)"))}${kf("ear", t("30%", "rotate(-24deg)") + t("60%", "rotate(6deg)"))}
${kf("bn", t("0%,100%", "none") + t("50%", "skewX(4deg)"))}${kf("trk", t("from", "translate(2010px,355.6px)") + t("to", "translate(-120px,395.1px)"))}
${kf("bob", t("to", "translateY(-.8px)"))}${kf("puff", `0%{transform:none;opacity:.8}100%{transform:translate(6px,-8px) scale(2.2);opacity:0}`)}
${kf("flap", t("from", "rotate(15deg)") + t("to", "rotate(-75deg)"))}${fly(1, "-18px,-58px", "-52px,-112px", "-22px,-38px")}${fly(2, "14px,-50px", "40px,-96px", "18px,-30px")}${fly(3, "-8px,-64px", "-30px,-128px", "-10px,-44px")}
${kf("shake", t("0%,100%", "none") + t("12%,36%", "rotate(-18deg)") + t("24%,48%", "rotate(-6deg)") + t("62%", "rotate(10deg)") + t("80%", "rotate(2deg)"))}
${kf("dice", `0%,58%{transform:translate(-12px,-12px) rotate(-70deg);opacity:0}66%{transform:translate(-7px,-15px) rotate(-30deg);opacity:1}84%{transform:translate(-2px,-3px) rotate(12deg)}100%{transform:none}`)}
${kf("reach", t("0%,100%", "none") + t("30%,70%", "rotate(-30deg)") + t("50%", "rotate(-24deg)"))}${kf("tsp", t("0%,100%", "rotate(-10deg)") + t("50%", "rotate(10deg)"))}
.md-pz *{animation-play-state:paused!important}
.md-rm *{animation:none!important;transition:none!important}.md-rm .md-fl{transition:opacity .18s!important}
@media (prefers-reduced-motion:reduce){.md-root *{animation:none!important;transition:none!important}.md-root .md-fl{transition:opacity .18s!important}}`;
}

// Denetim: meydan(kök, { hour }) → { enter, pause, resume, stop, setHour }
function meydan(rootEl, opts = {}) {
  const svg = rootEl?.matches?.("svg.md-root") ? rootEl : rootEl?.querySelector("svg.md-root");
  if (!svg) throw new Error("meydan: meydan SVG'si bulunamadı");
  const mm = s => (typeof matchMedia === "function" ? matchMedia(s) : null);
  const mq = mm("(prefers-reduced-motion: reduce)"), fine = mm("(pointer: fine)");
  const rm = () => !!mq?.matches, T = new Set(), rnd = (a, b) => a + Math.random() * (b - a);
  const on = (c, v = true, el = svg) => el?.classList.toggle(c, v);
  const later = (f, ms) => { const t = setTimeout(() => { T.delete(t); f(); }, ms); T.add(t); return t; };
  const restart = (c, el = svg) => { on(c, false, el); void svg.getBoundingClientRect(); on(c, true, el); };
  const $ = s => svg.querySelector(s), pigeons = [...svg.querySelectorAll(".md-pg")], flock = $(".md-pgs");
  const layers = [0, 1, 2, 3].map(i => $(".md-l" + i)), DEPTH = [.18, .36, .62, 1]; // en yakın katman 18 px
  const TEMP = ["md-blink", "md-ear", "md-ta", "md-tb", "md-trkgo"];
  let pal = "", hour = 0, paused = false, stopped = false, entered = false, vis = true, live = false, raf = 0, enterDone = null;
  let tx = 0, ty = 0, cx = 0, cy = 0;

  // Saat: kulede değil (o başka saati gösterir), alınlıktaki saatte; dakika gerçek, saat setHour'dan
  const clock = () => {
    const d = new Date(), m = d.getMinutes();
    $(".md-hh")?.setAttribute("transform", `rotate(${(hour % 12) * 30 + m / 2} 960 184)`);
    $(".md-mh")?.setAttribute("transform", `rotate(${m * 6} 960 184)`);
    return 60500 - d.getSeconds() * 1000;
  };
  const tick = () => later(tick, clock());

  // Boşta döngüler: Tekir göz kırpar ve kulak oynatır, amcalar sırayla zar atar, güvercinler eşelenir ve arada havalanır, traktör geçer
  const blink = () => { on("md-blink"); later(() => on("md-blink", false), 130); };
  const loops = () => {
    const blinkL = () => later(() => { blink(); if (Math.random() < .2) later(blink, 300); blinkL(); }, rnd(2500, 6500));
    const earL = () => later(() => { restart("md-ear"); later(() => on("md-ear", false), 450); earL(); }, rnd(5000, 12000));
    let turn = 0;
    const tavlaL = () => later(() => { const c = turn++ % 2 ? "md-tb" : "md-ta"; restart(c); later(() => on(c, false), 1400); tavlaL(); }, rnd(3200, 6000));
    const peckL = () => later(() => {
      if (pal !== "gece" && pigeons.length) { const g = pigeons[Math.random() * pigeons.length | 0]; on("md-pk", true, g); later(() => on("md-pk", false, g), 220); }
      peckL();
    }, rnd(500, 1800));
    const flyL = () => later(() => { if (pal !== "gece") { restart("md-fly", flock); later(() => on("md-fly", false, flock), 2800); } flyL(); }, rnd(14000, 26000));
    const trkL = first => later(() => { restart("md-trkgo"); trkL(); }, first ? rnd(5000, 9000) : rnd(40000, 60000));
    blinkL(); earL(); tavlaL(); peckL(); flyL(); trkL(true);
  };

  // İmleç parallaksı: yalnız ince imleçte, hareket azaltılmamışsa ve sahne görünürken
  const paint = () => layers.forEach((g, i) => g?.setAttribute("transform", `translate(${(-cx * 18 * DEPTH[i]).toFixed(2)} ${(-cy * 10 * DEPTH[i]).toFixed(2)})`));
  const step = () => {
    raf = 0; cx += (tx - cx) * .08; cy += (ty - cy) * .08;
    if (Math.abs(tx - cx) + Math.abs(ty - cy) < .003) { cx = tx; cy = ty; } else raf = requestAnimationFrame(step);
    paint();
  };
  const kick = () => { if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(step); };
  const move = e => { if (!live || entered || enterDone || rm() || !fine?.matches) return; tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; kick(); };
  const leave = e => { if (!e.relatedTarget) { tx = ty = 0; kick(); } };

  const start = () => {
    live = true; on("md-pz", false); tick();
    if (!rm()) loops();
    addEventListener("pointermove", move, { passive: true }); addEventListener("pointerout", leave);
  };
  const halt = () => {
    live = false; on("md-pz");
    for (const t of T) clearTimeout(t);
    T.clear(); if (raf) cancelAnimationFrame(raf); raf = 0;
    removeEventListener("pointermove", move); removeEventListener("pointerout", leave);
    for (const c of TEMP) on(c, false);
    on("md-fly", false, flock); pigeons.forEach(g => on("md-pk", false, g));
  };
  const apply = () => {
    const want = !paused && !stopped && !entered && vis && !(typeof document !== "undefined" && document.hidden);
    if (want && !live) start(); else if (!want && live) halt();
  };
  const sync = () => { on("md-rm", rm()); if (live) { halt(); apply(); } if (rm()) { tx = ty = cx = cy = 0; paint(); } };
  const onVis = () => apply();
  sync(); mq?.addEventListener?.("change", sync); document.addEventListener("visibilitychange", onVis);
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { vis = es[es.length - 1].isIntersecting; apply(); }) : null;
  io?.observe(svg);

  const setHour = h => {
    h = Math.floor(+h);
    hour = Number.isFinite(h) ? ((h % 24) + 24) % 24 : new Date().getHours();
    const n = MD_HOUR(hour);
    if (n !== pal) { if (pal) on("md-t-" + pal, false); on("md-t-aksam", false); pal = n; on("md-t-" + n); }
    if (pal === "gece") on("md-fly", false, flock);
    clock();
  };
  // Makama giriş: ~900 ms kamera itişi, pencere ışığı parlar, sıcak ışıkla biter. Bitince sahne durur; resume() kamerayı geri alır.
  const enter = () => new Promise(res => {
    if (stopped) return res();
    enterDone?.(); tx = ty = 0; kick();
    const quick = rm();
    on("md-pz", false); restart(quick ? "md-inr" : "md-in"); // duraklatılmış sahnede de oynasın
    enterDone = res;
    setTimeout(() => { if (enterDone !== res) return; enterDone = null; entered = true; apply(); on("md-pz"); res(); }, quick ? 200 : 900);
  });
  const pause = () => { paused = true; apply(); };
  const resume = () => {
    if (stopped) return;
    enterDone?.(); enterDone = null; paused = false; entered = false; on("md-in", false); on("md-inr", false); apply();
  };
  const stop = () => {
    stopped = true; halt(); enterDone?.(); enterDone = null;
    mq?.removeEventListener?.("change", sync); document.removeEventListener("visibilitychange", onVis); io?.disconnect();
  };
  setHour(opts.hour ?? new Date().getHours());
  apply();
  return { enter, pause, resume, stop, setHour };
}
