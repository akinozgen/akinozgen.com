// Seçim gecesi stüdyosu (KTV)
// studioSVG(): 1600×900 SVG metni. Harici dosya yok; sınıflar, kimlikler ve animasyonlar "st-" önekli.
// studio(kök): spiker denetimi → { talk, say, mood, react, setWall, year, stop }
let ST_N = 0;
const ST_REST = { neutral: "n", excited: "x", shocked: "s", happy: "h", sad: "d", smug: "m" };

function studioSVG() {
  const p = "st" + ++ST_N + "-", u = n => `url(#${p}${n})`; // gradyan kimlikleri her kopyada ayrı
  const S = (o, c, a) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`;
  const L = (n, ...s) => `<linearGradient id="${p}${n}" x2="0" y2="1">${s.join("")}</linearGradient>`;
  const RG = (n, ...s) => `<radialGradient id="${p}${n}">${s.join("")}</radialGradient>`;
  const SK = "#f7cba6", SKD = "#e8a883", HAIR = "#2e1d17", INK = "#2b1a17", LIP = "#6e2629", TONG = "#ea7a80";
  const rep = (xs, f) => xs.map(f).join("");
  const ln = (d, c, w, k = "") => `<path class="st-r${k}" d="${d}" stroke="${c}" stroke-width="${w}"/>`; // yuvarlak uçlu çizgi

  // Karakavak silueti: ev gövdeleri renk renk tek yol, damlar ve pencereler tek yol
  const HOUSES = [[700, 84, 80, 0, 1], [784, 82, 104, 1, 0], [934, 84, 70, 2, 1], [1018, 86, 96, 0, 0], [1104, 88, 76, 1, 1],
    [1192, 78, 112, 2, 0], [1270, 60, 64, 0, 1], [1486, 50, 72, 2, 1]];
  const B = 492, body = ["", "", ""];
  let roofs = "", caps = "", wins = "";
  HOUSES.forEach(([x, w, h, c, pitched], i) => {
    const t = B - h;
    body[c] += `M${x} ${t}h${w}V${B}H${x}z`;
    if (pitched) roofs += `M${x - 6} ${t}L${x + w / 2} ${t - 26}L${x + w + 6} ${t}z`;
    else caps += `M${x - 3} ${t - 7}h${w + 6}v8h${-w - 6}z`;
    for (let r = 0; r < (h > 80 ? 2 : 1); r++) for (const fx of [.28, .72]) if ((i + r + (fx > .5)) % 3) wins += `M${Math.round(x + w * fx - 6)} ${t + 16 + r * 30}h12v16h-12z`;
  });
  // kavun biçimli sokak lambası
  const lamp = x => `<circle cx="${x}" cy="404" r="38" fill="${u("gy")}"/><path d="M${x} 492V414" stroke="#1d2757" stroke-width="6"/><ellipse cx="${x}" cy="404" rx="14" ry="11" fill="#eee37c"/>`
    + ln(`M${x - 13} 404Q${x} 394 ${x + 13} 404M${x - 13} 404Q${x} 414 ${x + 13} 404M${x} 394V414`, "#8fae45", 2.2);
  const star = (x, y, r) => `M${x} ${y - r}Q${x + r * .2} ${y - r * .2} ${x + r} ${y}Q${x + r * .2} ${y + r * .2} ${x} ${y + r}Q${x - r * .2} ${y + r * .2} ${x - r} ${y}Q${x - r * .2} ${y - r * .2} ${x} ${y - r}z`;
  const drop = (x, y, s) => `M${x} ${y}q${-9 * s} ${14 * s} 0 ${19 * s}q${9 * s} ${-5 * s} 0 ${-19 * s}z`;
  // göz: beyaz (şaşkın), bebek + parıltı, mutlu yay, kırpılmış kapak
  const eye = (x, s) => `<g class="st-eye"><ellipse class="st-scl" cx="${x}" cy="338" rx="21" ry="24" fill="#fff"/>
<g class="st-pup"><ellipse cx="${x}" cy="338" rx="14.5" ry="18.5" fill="${INK}"/><circle cx="${x - 5}" cy="330" r="5.5" fill="#fff"/><circle cx="${x + 5}" cy="347" r="2.6" fill="#fff"/><path class="st-spk" d="${star(x + 5, 327, 6)}" fill="#fff"/></g>
${ln(`M${x - 15} 345Q${x} 322 ${x + 15} 345`, INK, 7, " st-hap")}<g clip-path="${u("e" + s)}"><rect class="st-lid${s}" x="${x - 22}" y="294" width="44" height="26" fill="${SK}"/></g></g>`;
  // kol: omuzdan +x yönüne uzanır, CSS dönüşüyle masaya ya da duvara
  const arm = f => `${ln("M0 0H112", "#5c1826", 62)}${ln("M132 0H140", "#f6f4ee", 40)}${ln("M0 0H112", "#8a2c3c", 54)}${f ? `<rect class="st-fing" x="172" y="-7.5" width="40" height="15" rx="7.5" fill="${SK}"/>` : ""}<circle cx="164" r="22" fill="${SK}"/>`;
  const mouth = (k, s) => `<g class="st-mo st-q${k}">${s}</g>`;
  const D = (w, t, c, b) => `<path d="M${470 - w} ${t}Q470 ${c} ${470 + w} ${t}Q${467 + w} ${b - 2} 470 ${b}Q${473 - w} ${b - 2} ${470 - w} ${t}z" fill="${LIP}"/>`;
  const TE = (w, t, c) => `<path d="M${474 - w} ${t + 1}Q470 ${c + 1} ${466 + w} ${t + 1}V${t + 9}Q470 ${c + 9} ${474 - w} ${t + 9}z" fill="#fff"/>`;
  const TG = (y, w) => `<path d="M${470 - w} ${y}Q470 ${y - 11} ${470 + w} ${y}Q${463 + w} ${y + 9} 470 ${y + 9}Q${477 - w} ${y + 9} ${470 - w} ${y}z" fill="${TONG}"/>`;
  const LAMPS = [270, 540, 810, 1080, 1350];
  const PX = [46, 150, 254, 1558];
  const TICK = ["Kavun fiyatları sabit, pazarcılar sandık başında", "Sandık görevlilerine çay servisi başladı", "Yukarıkavak sandığı traktörle yolda",
    "Muhtarlık: Sonuçları biz de merakla bekliyoruz", "Hava durumu: Gece açık, kavun bol"].join("  ✦  ").toLocaleUpperCase("tr-TR");

  return `<svg class="st-root st-m-neutral st-v-n" viewBox="0 0 1600 900" width="100%" height="100%" style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet" role="img" aria-label="KTV seçim stüdyosu: spiker canlı yayında" xmlns="http://www.w3.org/2000/svg">
<style>${studioCSS()}</style>
<defs>
<radialGradient id="${p}bg" cx=".36" cy=".42" r=".78">${S(0, "#23498f")}${S(.55, "#0e2150")}${S(1, "#050c1e")}</radialGradient>
${L("pan", S(0, "#9ccbff"), S(.45, "#4686ff"), S(1, "#1c3f9e"))}${L("sky", S(0, "#132364"), S(.5, "#2d3d93"), S(.8, "#7e4f9b"), S(1, "#f39a6a"))}
${L("cone", S(0, "#cfe3ff", .32), S(1, "#cfe3ff", 0))}${L("dt", S(0, "#a86e46"), S(1, "#74432a"))}${L("df", S(0, "#51301e"), S(1, "#1d110a"))}
${L("br", S(0, "#f3dc97"), S(.5, "#c9a54c"), S(1, "#8a6a26"))}${L("jk", S(0, "#a23a4b"), S(1, "#7a2436"))}
${L("band", S(0, "#fff", 0), S(.5, "#fff", .1), S(1, "#fff", 0))}${RG("gy", S(0, "#fff3a0", .75), S(1, "#fff3a0", 0))}${RG("gw", S(0, "#fff6d8", .6), S(1, "#fff6d8", 0))}
<radialGradient id="${p}vig" r=".75">${S(.6, "#000", 0)}${S(1, "#00030d", .55)}</radialGradient>
<pattern id="${p}gr" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#7aa8ff" stroke-opacity=".08" stroke-width="2"/></pattern>
<pattern id="${p}sl" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="2"/></pattern>
<clipPath id="${p}scr"><rect x="702" y="82" width="826" height="456" rx="10"/></clipPath>
<clipPath id="${p}eL"><ellipse cx="425" cy="338" rx="15" ry="19"/></clipPath><clipPath id="${p}eR"><ellipse cx="515" cy="338" rx="15" ry="19"/></clipPath>
</defs>
<rect width="1600" height="900" fill="${u("bg")}"/><rect width="1600" height="640" fill="${u("gr")}"/>
<path class="st-lit" d="${rep(LAMPS, x => `M${x - 16} 40L${x + 16} 40L${x + 160} 640L${x - 160} 640z`)}" fill="${u("cone")}"/>
<rect width="1600" height="30" fill="#0a132b"/><path d="M0 30${rep([...Array(40)], (_, i) => `L${i * 40 + 20} 4L${i * 40 + 40} 30`)}" fill="none" stroke="#223a70" stroke-width="3"/>
<path d="${rep(LAMPS, x => `M${x - 20} 20h40v22h-40z`)}" fill="#1b2a52"/>${ln(rep(LAMPS, x => `M${x} 42h0`), "#eaf3ff", 18, " st-lit")}
<g class="st-lit">${rep(PX, x => `<rect x="${x}" y="110" width="70" height="530" rx="14" fill="${u("pan")}" stroke="#3a78ff" stroke-opacity=".14" stroke-width="28"/>`)}
<path d="${rep(PX, x => rep([200, 290, 380, 470, 560], y => `M${x} ${y}h70`))}" stroke="#0b1f5c" stroke-opacity=".35" stroke-width="3"/><g opacity=".35">${ln(rep(PX, x => `M${x + 14} 128V620`), "#fff", 9)}</g></g>

<rect x="690" y="70" width="850" height="480" rx="18" fill="#070e1f" stroke="#2c5cb8" stroke-width="4"/>
<g clip-path="${u("scr")}"><g class="st-wall">
<rect x="702" y="82" width="826" height="456" fill="${u("sky")}"/>
${ln("M752 200h0M812 250h0M1030 196h0M1098 262h0M1290 204h0M1420 240h0M1500 190h0M968 236h0M1160 300h0", "#fff", 4)}
<circle cx="1206" cy="226" r="74" fill="${u("gw")}"/><circle cx="1206" cy="226" r="30" fill="#fff2c6"/>
<path d="M702 430Q790 396 880 418T1060 414T1240 404T1420 414T1528 408V492H702z" fill="#3a3f8e"/>
<path d="${body[0]}" fill="#4a5eae"/><path d="${body[1]}" fill="#3b4c97"/><path d="${body[2]}" fill="#57509f"/>
<path d="${roofs}" fill="#bb523f"/><path d="${caps}" fill="#2c3a7c"/><path d="${wins}" fill="#ffd772"/>
<rect x="872" y="290" width="56" height="202" fill="#5a6cc0"/><rect x="864" y="272" width="72" height="20" fill="#7082d4"/><path d="M864 272L900 218L936 272z" fill="#c25a44"/><path d="M900 218V202" stroke="#c9a54c" stroke-width="4"/>
<circle cx="900" cy="320" r="20" fill="#fff5d6" stroke="#c9a54c" stroke-width="4"/>${ln("M900 320V306", "#28304f", 3.5)}${ln("M900 320H912", "#28304f", 3, " st-clk")}
<path d="M892 400a8 8 0 0 1 16 0v22h-16z" fill="#ffd772"/>
<path d="M1334 452A61 56 0 0 1 1456 452z" fill="#6a73c4"/><rect x="1328" y="450" width="134" height="42" fill="#4f5bab"/><path d="M1395 396V380" stroke="#c9a54c" stroke-width="4"/><circle cx="1395" cy="377" r="5" fill="#c9a54c"/>
<rect x="1466" y="262" width="16" height="230" fill="#6a73c4"/><rect x="1459" y="324" width="30" height="9" rx="2" fill="#8c95de"/><path d="M1466 262L1474 212L1482 262z" fill="#8c95de"/><circle cx="1474" cy="208" r="4" fill="#c9a54c"/>
${lamp(990)}${lamp(1244)}
<rect x="702" y="82" width="826" height="456" fill="${u("sl")}" opacity=".16"/><rect class="st-scan" x="702" y="82" width="826" height="90" fill="${u("band")}"/>
<path d="M908 82V538M1115 82V538M1322 82V538M702 310H1528" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
<rect x="702" y="82" width="826" height="72" fill="#081744" opacity=".8"/><rect x="702" y="152" width="826" height="4" fill="${u("br")}"/>
<text x="1115" y="134" class="st-f1 st-c" font-size="46" fill="#fff">KARAKAVAK <tspan fill="#ecd592">SEÇİM <tspan id="st-year">2034</tspan></tspan></text>
<g class="st-sd"><rect x="702" y="426" width="206" height="42" fill="#d62f22"/><text x="805" y="456" class="st-f2 st-c" font-size="28" fill="#fff">SON DAKİKA</text></g>
<rect x="702" y="468" width="826" height="70" fill="#0a1a48" opacity=".94"/><rect x="702" y="468" width="86" height="70" fill="${u("br")}"/>
<path d="M737 476h18v22h-18z" fill="#fff"/><path d="M741 487l4 4 7-8" fill="none" stroke="#c8321e" stroke-width="3"/><path d="M722 494h48v32h-48z" fill="#15275e"/><path d="M734 494h24" stroke="#c9a54c" stroke-width="4"/>
<text class="st-cap st-f2" x="808" y="516" font-size="40" fill="#fff">SANDIKLAR AÇILIYOR</text>
</g></g>
<rect x="40" y="46" width="134" height="42" rx="8" fill="#d62f22"/><circle class="st-rec" cx="64" cy="67" r="8" fill="#fff"/><text x="82" y="78" class="st-f2" font-size="28" fill="#fff">CANLI</text>

<g class="st-post"><g class="st-br">
<path d="M440 426v60q30 16 60 0v-60z" fill="${SKD}"/>
<path d="M316 720L320 584C320 528 348 500 398 488L442 478H498L542 488C592 500 620 528 620 584L624 720z" fill="${u("jk")}" stroke="#5c1826" stroke-width="4"/>
<path d="M440 476H500L470 576z" fill="#f6f4ee"/>
<path d="M461 494h18l-3 16h-12z" fill="#b8872a"/><path d="M464 508h12l12 92-18 20-18-20z" fill="#dcb14a"/><path d="M462 538l16-9M459 566l22-12M457 594l26-14" stroke="#b8872a" stroke-width="5"/>
<path d="M440 474l30 26-16 14-24-30zM500 474l-30 26 16 14 24-30z" fill="#fff"/>
<path d="M438 478L470 580L462 606L418 548L432 530L408 512zM502 478L470 580L478 606L522 548L508 530L532 512z" fill="#6e1f2d"/>
<path d="M538 554h30l-4 8-6-7-5 8-5-8-6 7z" fill="#ecd592"/><rect x="507" y="532" width="9" height="13" rx="4" fill="#1b1b1b"/><circle cx="470" cy="622" r="4.5" fill="#4a1520"/>
<g class="st-hd"><g class="st-bob"><g class="st-hd2">
<ellipse cx="352" cy="348" rx="18" ry="25" fill="${SK}"/><ellipse cx="588" cy="348" rx="18" ry="25" fill="${SK}"/>${ln("M350 336q-8 12 0 26M590 336q8 12 0 26", SKD, 5)}
<path d="M470 212C548 212 592 262 592 336C592 408 540 454 470 454C400 454 348 408 348 336C348 262 392 212 470 212z" fill="${SK}"/>
<path d="M552 240C602 296 598 402 516 450C574 414 588 330 552 240z" fill="${SKD}" opacity=".6"/>
<ellipse class="st-chk" cx="392" cy="392" rx="25" ry="14" fill="#f2857c"/><ellipse class="st-chk" cx="548" cy="392" rx="25" ry="14" fill="#f2857c"/>
<path d="M358 348C350 316 350 282 366 250L386 262C372 290 370 318 368 348zM582 348C590 316 590 282 574 250L554 262C568 290 570 318 572 348z" fill="${HAIR}"/>
<g class="st-quiff"><path d="M366 262C350 222 362 150 420 118C474 90 566 90 606 130C634 160 624 214 594 238C584 246 572 250 562 256C530 236 480 232 446 248C420 258 392 256 366 262z" fill="${HAIR}"/>
${ln("M392 180C418 136 482 110 548 114", "#5d4136", 16)}${ln("M432 250C414 206 428 150 480 118M522 240C518 196 540 152 590 134", "#4a3129", 5)}${ln("M478 108C506 100 536 102 560 110", "#9a786a", 6)}</g>
<g class="st-brows">${ln("M398 300C408 286 432 282 450 290", HAIR, 13, " st-brL")}${ln("M542 300C532 286 508 282 490 290", HAIR, 13, " st-brR")}</g>
<g class="st-eyes">${eye(425, "L")}${eye(515, "R")}</g>
<ellipse cx="470" cy="372" rx="17" ry="13" fill="#efa27e"/><ellipse cx="464" cy="367" rx="6" ry="4" fill="#fff" opacity=".5"/>
${mouth("n", ln("M450 425Q470 440 490 425", LIP, 6))}
${mouth("h", D(30, 418, 424, 454) + TG(443, 18))}${mouth("x", D(38, 414, 422, 470) + TE(38, 414, 422) + TG(457, 20))}
${mouth("s", `<ellipse cx="470" cy="434" rx="14" ry="19" fill="${LIP}"/><ellipse cx="470" cy="444" rx="8" ry="6" fill="${TONG}"/>`)}
${mouth("d", ln("M449 437Q470 420 491 437", LIP, 6))}${mouth("m", ln("M446 428Q472 438 496 418l7 4", LIP, 6))}
${mouth("a", D(24, 416, 410, 457) + TE(24, 416, 410) + TG(448, 15))}${mouth("e", D(28, 418, 413, 442) + TE(28, 418, 413))}
${mouth("o", `<ellipse cx="470" cy="430" rx="11" ry="13" fill="${LIP}"/><ellipse cx="470" cy="437" rx="6" ry="4" fill="${TONG}"/>`)}
<path class="st-stache" d="M470 388C450 378 422 378 404 392C396 399 388 397 384 388C382 405 398 419 420 417C442 415 459 408 470 401C481 408 498 415 520 417C542 419 558 405 556 388C552 397 544 399 536 392C518 378 490 378 470 388z" fill="${HAIR}"/>
<path class="st-fx st-fxx" d="${star(332, 214, 16)}${star(622, 180, 13)}${star(648, 292, 9)}" fill="#ffe79a"/>
<path class="st-fx st-fxs" d="${drop(610, 250, 1.3)}" fill="#a5d8ff"/><path class="st-fx st-fxd" d="${drop(404, 360, 1)}" fill="#a5d8ff"/><path class="st-fx st-fxm" d="${star(570, 376, 10)}" fill="#fff4c2"/>
</g></g></g>
</g></g>

<path d="M-10 622Q800 640 1610 622V690Q800 730 -10 690z" fill="${u("dt")}"/><path d="M-10 632Q800 650 1610 632V644Q800 664 -10 644z" fill="#fff" opacity=".12"/>
<g class="st-post st-arms">
<g class="st-cards"><rect x="420" y="590" width="100" height="72" rx="6" fill="#d8d5c8" transform="rotate(-7 470 626)"/><rect x="420" y="590" width="100" height="72" rx="6" fill="#e9e7de" transform="rotate(4 470 626)"/>
<g class="st-c1"><rect x="420" y="590" width="100" height="72" rx="6" fill="#f8f7f1"/>${ln("M432 601h30", "#c8321e", 5)}${ln("M432 617h62M432 631h76M432 645h50", "#9aa6c8", 4)}</g></g>
<g transform="translate(340 525)"><g class="st-armL"><g class="st-tapL">${arm(0)}</g></g></g>
<g transform="translate(600 525)"><g class="st-armR"><g class="st-tapR">${arm(1)}</g></g></g>
</g>
<path d="M-10 690Q800 730 1610 690V900H-10z" fill="${u("df")}"/><path d="M-10 700Q800 740 1610 700V718Q800 758 -10 718z" fill="#fff" opacity=".07"/>
${ln("M-10 814Q800 846 1610 814", "#62b0ff", 16)}${ln("M-10 814Q800 846 1610 814", "#8cc6ff", 4)}
<path class="st-r" d="M-10 690Q800 730 1610 690" stroke="${u("br")}" stroke-width="6"/>
<rect x="404" y="738" width="132" height="54" rx="12" fill="${u("br")}"/><rect x="411" y="745" width="118" height="40" rx="7" fill="none" stroke="#6b5018" stroke-width="2"/><text x="470" y="778" class="st-f1 st-c" font-size="33" fill="#1b2446" letter-spacing="3">KTV</text>

<g transform="translate(0 16)"><ellipse cx="258" cy="648" rx="38" ry="8" fill="#f3f2ec"/><ellipse cx="258" cy="645" rx="24" ry="4" fill="#d6d0bf"/>
<path d="M242 598C241 611 250 617 248 627C246 635 241 639 245 643H271C275 639 270 635 268 627C266 617 275 611 274 598z" fill="#b8461c"/>
<path d="M239 584C238 604 248 612 246 624C244 634 238 638 243 644H273C278 638 272 634 270 624C268 612 278 604 277 584z" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-opacity=".65" stroke-width="2.5"/>
${ln("M246 592q0 14 6 22", "#fff", 3)}${ln("M252 572q-8-10 0-20t0-20", "#fff", 4, " st-stm")}${ln("M266 574q8-10 0-20t0-20", "#fff", 4, " st-stm st-stm2")}</g>

<g transform="translate(990 676)"><g class="st-catX"><g class="st-catF"><g class="st-catB">
${ln("M48 -44C80 -50 84 -92 68 -110", "#a48b70", 13, " st-tail")}<path class="st-tail" d="M48 -44C80 -50 84 -92 68 -110" fill="none" stroke="#6b5642" stroke-width="13" stroke-dasharray="9 11"/>
${ln("M-30 -30V-4", "#7d6852", 13, " st-leg st-lg2")}${ln("M34 -30V-4", "#7d6852", 13, " st-leg")}
<ellipse cx="0" cy="-40" rx="54" ry="25" fill="#a48b70"/><ellipse cx="-4" cy="-24" rx="34" ry="9" fill="#e9dcc6"/>
${ln("M-18 -63q5 10 0 18M2 -65q5 10 0 18M22 -63q5 10 0 18", "#6b5642", 5)}${ln("M-42 -30V-4", "#a48b70", 13, " st-leg st-paw")}${ln("M22 -30V-4", "#a48b70", 13, " st-leg st-lg2")}
<g class="st-cath"><path d="M-92 -86L-88 -120L-66 -98zM-62 -98L-40 -120L-36 -86z" fill="#a48b70"/><path d="M-87 -94L-85 -111L-74 -99zM-54 -99L-43 -111L-41 -94z" fill="#f2a7a0"/>
<ellipse cx="-64" cy="-76" rx="31" ry="27" fill="#a48b70"/>${ln("M-64 -102v9M-73 -100l2 8M-55 -100l-2 8", "#6b5642", 4)}
<ellipse cx="-64" cy="-63" rx="13" ry="9" fill="#efe4d0"/><ellipse cx="-76" cy="-78" rx="5" ry="6.5" fill="${INK}"/><ellipse cx="-52" cy="-78" rx="5" ry="6.5" fill="${INK}"/>
<path d="M-67 -69h6l-3 4z" fill="#e7888a"/>${ln("M-71 -61q3.5 4 7 0q3.5 4 7 0M-82 -66l-20 -3M-82 -62l-20 3M-46 -66l20 -3M-46 -62l20 3", "#3b2c22", 2)}</g>
</g></g></g></g>
<g class="st-pen"><g class="st-penM">${ln("M880 694l62-7", "#27408f", 10)}${ln("M872 695l10-1", "#c9a54c", 6)}${ln("M928 686l12-1", "#c9a54c", 3)}</g></g>

<rect y="848" width="1600" height="52" fill="#0a1a48"/><rect y="848" width="1600" height="3" fill="${u("br")}"/>
<text class="st-tick st-f2" x="214" y="885" font-size="28" fill="#fff">${TICK}</text>
<rect y="851" width="196" height="49" fill="#d62f22"/><text x="98" y="885" class="st-f2 st-c" font-size="28" fill="#fff">KTV HABER</text>
<rect class="st-dim" width="1600" height="900" fill="#01040d"/><rect width="1600" height="900" fill="${u("vig")}"/>
</svg>`;
}

// Bütün dönüşümler ve animasyonlar yalnız transform ve opacity kullanır
function studioCSS() {
  const Y = v => `translateY(${v}px) `, R = v => `rotate(${v}deg) `, t = (s, v) => `${s}{transform:${v}}`, K = (n, b) => `@keyframes st-${n}{${b}}`;
  const E = "cubic-bezier(.3,1.5,.5,1)", I = " infinite", N = "none";
  const T = { // ruh hâli → gövde, baş, kaş L, kaş R, bebek, kapak L, kapak R, perçem, yanak, görünenler
    excited: [Y(-8) + "scale(1.02)", R(-3), Y(-12), Y(-12), "scale(1.12)", "", "", "", .8, "spk,fxx"],
    shocked: [Y(-14), Y(-6), Y(-16) + "scale(1.05)", Y(-16) + "scale(1.05)", "scale(.48)", "", "", "scale(1.03,1.1)", .1, "scl,fxs"],
    happy: [R(-1), R(-5), Y(-6), Y(-6), "", "", "", "", .85, "hap"],
    sad: [Y(10), R(5) + Y(6), Y(-4) + R(-16), Y(-4) + R(16), "", Y(11) + R(-14), Y(11) + R(14), "", .2, "fxd"],
    smug: [R(1.5), R(4) + Y(-3), Y(4) + R(5), Y(-12) + R(-7), "", Y(15), Y(15), "", .5, "fxm"],
  };
  const sel = ["post", "hd", "brL", "brR", "pup", "lidL", "lidR", "quiff"];
  let m = ".st-m-happy .st-pup{opacity:0}";
  for (const [k, v] of Object.entries(T)) {
    const r = `.st-m-${k} .st-`;
    sel.forEach((s, i) => { if (v[i]) m += t(r + s, v[i]); });
    m += `${r}chk{opacity:${v[8]}}` + v[9].split(",").map(s => r + s).join() + "{opacity:1}";
  }
  m += [..."nxshdmaeo"].map(k => `.st-v-${k} .st-q${k}`).join() + "{opacity:1}";
  return `.st-f1{font-family:"Alfa Slab One",Rockwell,Georgia,serif}.st-f2{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;letter-spacing:1.5px}.st-c{text-anchor:middle}
.st-r{fill:none;stroke-linecap:round;stroke-linejoin:round}
.st-post{transform-origin:470px 700px;transition:transform .55s ${E}}.st-br{transform-origin:470px 690px;animation:st-breathe 4.4s ease-in-out${I}}
.st-hd,.st-bob,.st-hd2{transform-origin:470px 455px}.st-hd{transition:transform .45s ${E}}.st-hd2{transition:transform .35s}.st-eyes,.st-brows{transition:transform .22s}
.st-eye,.st-pup,.st-brL,.st-brR,.st-lidL,.st-lidR,.st-stache,.st-fx,.st-spk,.st-fing,.st-penM,.st-cath,.st-quiff,.st-leg{transform-box:fill-box;transform-origin:center}
.st-quiff{transform-origin:50% 100%;transition:transform .35s cubic-bezier(.3,1.8,.5,1)}
.st-eye{transition:transform .07s}${t(".st-blink .st-eye", "scaleY(.08)")}
.st-pup,.st-scl,.st-hap,.st-spk,.st-chk,.st-fx{transition:opacity .2s,transform .3s ${E}}.st-brL,.st-brR,.st-lidL,.st-lidR{transition:transform .3s ${E}}
.st-scl,.st-hap,.st-spk,.st-fx,.st-mo,.st-sd,.st-dim{opacity:0}.st-chk{opacity:.45}
.st-stache{transition:transform .08s}${t(".st-v-a .st-stache", Y(-5))}${t(".st-v-e .st-stache", Y(-3))}${t(".st-v-o .st-stache", Y(-2) + "scaleX(.94)")}${t(".st-v-s .st-stache,.st-v-x .st-stache", Y(-4))}
${m}
.st-m-excited .st-fxx{animation:st-tw 1s${I}}.st-talk .st-bob{animation:st-bob 2.4s${I}}${t(".st-emph .st-brows", Y(-8))}
${t(".st-glance .st-eyes,.st-papers .st-eyes", Y(10))}${t(".st-glance .st-hd2,.st-papers .st-hd2", Y(5) + R(-1.5))}
${t(".st-armL", R(56.7))}.st-armR{transform:${R(123.3)};transition:transform .5s cubic-bezier(.35,1.3,.5,1)}
.st-fing{transform:scaleX(0);transform-origin:0 50%;transition:transform .2s .25s}
${t(".st-point .st-armR", R(-38))}${t(".st-point .st-fing", N)}${t(".st-point .st-eyes", "translate(10px,-4px)")}${t(".st-point .st-hd2", R(2.5) + "translateX(4px)")}
${["cards:tap", "tapL:tapL", "tapR:tapR", "c1:shuf"].map(x => x.split(":")).map(([a, b]) => `.st-papers .st-${a}{animation:st-${b} .95s}`).join("")}
${t(".st-lean .st-post", Y(30) + "scale(1.1)")}${t(".st-lean .st-brL", Y(3) + R(10))}${t(".st-lean .st-brR", Y(3) + R(-10))}${t(".st-lean .st-lidL,.st-lean .st-lidR", Y(6))}
.st-lean .st-sd{opacity:1;animation:st-op .5s steps(1) 4}
.st-lights .st-dim{animation:st-flick 1.4s linear}.st-lights .st-lit{animation:st-flick2 1.4s linear}${t(".st-lights .st-eyes", Y(-10))}${t(".st-lights .st-brows", Y(-8))}
${t(".st-catX", "translateX(760px)")}.st-cat1 .st-catX,.st-cat2 .st-catX{transform:none;transition:transform 2.2s linear}.st-cat3 .st-catX{transition:transform 2.4s linear}${t(".st-cat3 .st-catF", "scaleX(-1)")}
.st-leg{transform-origin:50% 0}.st-cat1 .st-leg,.st-cat3 .st-leg{animation:st-walk .3s${I} alternate}.st-cat1 .st-lg2,.st-cat3 .st-lg2{animation-direction:alternate-reverse}
.st-cat1 .st-catB,.st-cat3 .st-catB{animation:st-cbob .15s${I} alternate}
.st-tail{transform-origin:48px -44px}.st-cat2 .st-tail{animation:st-tail .8s 2}.st-cat2 .st-paw{animation:st-swipe .45s 2}.st-cat2 .st-cath{transform:${R(-10)};transition:transform .3s}
${t(".st-cat1 .st-eyes,.st-cat2 .st-eyes", "translate(11px,6px)")}${t(".st-cat3 .st-eyes", "translate(12px,3px)")}${t(".st-cat2 .st-brows", Y(-9))}
.st-penoff .st-penM{animation:st-penfall 1.3s .4s ease-in forwards}.st-penin .st-pen{animation:st-fadein .7s}
.st-scan{animation:st-scan 6.5s linear${I}}.st-wall{animation:st-live 5s step-end${I}}.st-rec{animation:st-op 1.2s steps(1)${I}}
.st-stm{animation:st-steam 3.2s ease-out${I};opacity:0}.st-stm2{animation-delay:-1.6s}.st-clk{transform-origin:900px 320px;animation:st-spin 60s linear${I}}
.st-tick{animation:st-tick 40s -10s linear${I}}.st-capin .st-cap{animation:st-capin .45s ease-out}
${K("breathe", t("50%", "scale(1.01,1.014)"))}
${K("bob", t("0%,100%", N) + t("17%", R(1.4) + Y(-2)) + t("33%", R(-.6)) + t("52%", R(.8) + Y(-3)) + t("70%", R(-1.2) + Y(-1)) + t("86%", R(.4)))}
${K("tap", t("20%,60%", Y(-15)) + t("40%,80%", N))}${K("tapL", t("20%,60%", R(-9)) + t("40%,80%", N))}${K("tapR", t("20%,60%", R(9)) + t("40%,80%", N))}
${K("shuf", t("25%", "translate(6px,-26px) " + R(-7)) + t("55%", "translate(-3px,-10px) " + R(3)))}
${K("flick", "0%,100%{opacity:0}8%{opacity:.62}12%{opacity:.08}20%{opacity:.72}27%{opacity:.15}42%{opacity:.5}50%{opacity:0}62%{opacity:.35}68%{opacity:0}")}
${K("flick2", "0%,100%{opacity:1}8%,20%{opacity:.15}12%{opacity:.9}42%{opacity:.3}50%{opacity:1}62%{opacity:.5}")}
${K("op", "50%{opacity:.25}")}${K("live", "0%{opacity:1}47%{opacity:.94}50%{opacity:1}83%{opacity:.97}88%{opacity:1}")}
${K("scan", t("from", Y(-100)) + t("to", Y(560)))}${K("steam", `0%{transform:${Y(10)};opacity:0}35%{opacity:.8}100%{transform:${Y(-28)};opacity:0}`)}
${K("walk", t("from", R(24)) + t("to", R(-24)))}${K("cbob", t("to", Y(-3)))}${K("swipe", t("50%", R(68)))}${K("tail", t("50%", R(-16)))}
${K("penfall", t("22%", "translateX(-46px) " + R(-12)) + `100%{transform:translate(-120px,300px) ${R(-250)};opacity:0}`)}
${K("fadein", "from{opacity:0}")}${K("tw", "50%{opacity:.35}")}${K("spin", t("to", R(360)))}${K("capin", `from{transform:${Y(30)};opacity:0}`)}
${K("tick", t("from", "translateX(1420px)") + t("to", "translateX(-2850px)"))}
.st-rm.st-lights .st-dim{opacity:.4}.st-rm.st-penoff .st-penM{opacity:0}.st-rm *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){.st-root *{animation:none!important;transition:none!important}}`;
}

// Denetim: studio(kök) → { talk, say, mood, react, setWall, year, stop }
function studio(rootEl) {
  const svg = rootEl?.matches?.("svg.st-root") ? rootEl : rootEl?.querySelector("svg.st-root");
  if (!svg) throw new Error("studio: stüdyo SVG'si bulunamadı");
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const rm = () => !!mq?.matches, T = new Set(), rnd = (a, b) => a + Math.random() * (b - a);
  const on = (c, v = true) => svg.classList.toggle(c, v);
  const later = (f, ms) => { const t = setTimeout(() => { T.delete(t); f(); }, ms); T.add(t); return t; };
  const cancel = t => { clearTimeout(t); T.delete(t); };
  const restart = c => { on(c, false); void svg.getBoundingClientRect(); on(c); };
  const REACT = { point: 1800, papers: 1000, lean: 2200, lights: 1500 }, rt = {};
  const BUSY = ["st-point", "st-papers", "st-lean", "st-lights", "st-cat1", "st-cat2", "st-cat3"];
  let mood = [...svg.classList].find(c => c.startsWith("st-m-"))?.slice(5) || "neutral", shape = "", talking = false, talkT = 0, sayT = 0, sayDone = null, catOn = false;
  const paint = () => {
    for (const c of [...svg.classList]) if (c.startsWith("st-v-")) svg.classList.remove(c);
    on("st-v-" + (shape || ST_REST[mood]));
  };
  const sync = () => on("st-rm", rm());
  sync(); mq?.addEventListener?.("change", sync);

  // Konuşma: 3 ağız şekli + kapalı ağız (ruh hâlininki), düzensiz hece süreleri, arada kelime boşlukları
  const syll = () => {
    if (!talking) return;
    let d;
    if (shape && Math.random() < .2) { shape = ""; d = rnd(80, 220) + (Math.random() < .15 ? 320 : 0); }
    else { let s; do s = "aaeeeoo"[Math.random() * 7 | 0]; while (s === shape); shape = s; d = rnd(70, 170); }
    if (Math.random() < .05) { on("st-emph"); later(() => on("st-emph", false), 320); }
    paint(); talkT = later(syll, d);
  };
  const talk = v => {
    v = !!v;
    if (v === talking) return;
    talking = v; on("st-talk", v); cancel(talkT);
    shape = v && rm() ? "e" : ""; paint();
    if (v && !rm()) syll();
  };
  const say = (ms = 1500) => {
    cancel(sayT); sayDone?.(); talk(true);
    return new Promise(res => { sayDone = res; sayT = later(() => { sayDone = null; talk(false); res(); }, ms); });
  };

  // Boşta: 2-6 sn arayla göz kırpma, ara sıra kartlara göz atma. Nefes, yayın parıltısı ve kayan yazı CSS'te.
  const blink = () => { on("st-blink"); later(() => on("st-blink", false), 120); };
  const blinkLoop = () => later(() => { if (!rm()) { blink(); if (Math.random() < .2) later(blink, 280); } blinkLoop(); }, rnd(2000, 6000));
  const glanceLoop = () => later(() => {
    if (!rm() && !BUSY.some(c => svg.classList.contains(c))) { on("st-glance"); later(() => on("st-glance", false), rnd(700, 1300)); }
    glanceLoop();
  }, rnd(7000, 14000));
  blinkLoop(); glanceLoop();

  const cat = () => { // Tekir masaya çıkar, kalemi düşürür, geri döner
    if (catOn) return;
    catOn = true;
    const end = () => { on("st-cat3", false); on("st-cat2", false); on("st-penoff", false); catOn = false; };
    if (rm()) { on("st-cat2"); on("st-penoff"); later(end, 3000); return; }
    on("st-cat1");
    later(() => { on("st-cat1", false); on("st-cat2"); on("st-penoff"); }, 2300);
    later(() => { on("st-cat2", false); on("st-cat3"); }, 4000);
    later(() => { end(); on("st-penin"); later(() => on("st-penin", false), 800); }, 6500);
  };
  const react = kind => {
    if (kind === "cat") return cat();
    const ms = REACT[kind], c = "st-" + kind;
    if (!ms) return;
    cancel(rt[kind]); restart(c);
    rt[kind] = later(() => on(c, false), ms);
  };
  const setWall = text => {
    const t = svg.querySelector(".st-cap"), W = 700;
    if (!t) return;
    t.textContent = String(text ?? "").toLocaleUpperCase("tr-TR");
    t.removeAttribute("textLength"); t.removeAttribute("lengthAdjust");
    try { if (t.getComputedTextLength() > W) { t.setAttribute("textLength", W); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); } } catch { /* görünmüyorsa ölçülemez */ }
    if (!rm()) { restart("st-capin"); later(() => on("st-capin", false), 500); }
  };
  const year = y => { const t = svg.querySelector("#st-year"); if (t) t.textContent = String(y); };
  const setMood = n => { if (!ST_REST[n]) n = "neutral"; on("st-m-" + mood, false); mood = n; on("st-m-" + n); paint(); };
  const stop = () => {
    for (const t of T) clearTimeout(t);
    T.clear(); sayDone?.(); sayDone = null; talking = false; shape = ""; catOn = false;
    for (const c of ["st-talk", "st-blink", "st-glance", "st-emph", "st-capin", "st-penoff", "st-penin", ...BUSY]) on(c, false);
    paint(); mq?.removeEventListener?.("change", sync);
  };
  return { talk, say, mood: setMood, react, setWall, year, stop };
}
