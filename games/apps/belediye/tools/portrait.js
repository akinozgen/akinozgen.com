// ─── Vesikalık üreteci: tariften düz renkli SVG portre ─────────────────────
// Oyun bu dosyayı yüklemez; vesikalıklar public/portraits/ altındaki resimlerdir.
// tools/portraits.mjs eksik resimleri buradaki tariflerden çizer. Şimdiki resimler bu çizimlerden SDXL img2img ile
// parlak 3D stile çevrildi; --force onların üstüne düz çizim yazar.
/* exported portrait, mayorFace, RECIPES, MAYOR_RECIPES */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = amt < 0 ? 0 : 255,
    p = Math.abs(amt);
  const ch = v => Math.round((f - v) * p + v);
  const r = ch(n >> 16),
    g = ch((n >> 8) & 255),
    b = ch(n & 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function catSVG(p) {
  const fur = "#c99a62",
    dark = "#7a5230";
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="100" height="100" fill="${p.bg}"/><circle cx="50" cy="48" r="36" fill="${shade(p.bg, 0.2)}"/>
<path d="M20 100 C22 80 34 70 50 70 C66 70 78 80 80 100Z" fill="${shade(fur, -0.08)}"/>
<path d="M40 76 C44 82 56 82 60 76 C58 90 42 90 40 76Z" fill="#efe6d6"/>
<path d="M30 42 L27 19 L45 33Z" fill="${fur}"/><path d="M70 42 L73 19 L55 33Z" fill="${fur}"/>
<path d="M31 37 L30 25 L40 33Z" fill="#e59aa2"/><path d="M69 37 L70 25 L60 33Z" fill="#e59aa2"/>
<ellipse cx="50" cy="50" rx="22" ry="19" fill="${fur}"/>
<path d="M50 32 L50 40 M44 33 L45.5 40 M56 33 L54.5 40" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/>
<path d="M29 50 L36 51 M29 55 L36 55 M71 50 L64 51 M71 55 L64 55" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
<ellipse cx="50" cy="59" rx="9" ry="6.5" fill="#efe6d6"/>
<ellipse cx="42" cy="48" rx="4" ry="4.4" fill="#b7c94a"/><ellipse cx="58" cy="48" rx="4" ry="4.4" fill="#b7c94a"/>
<ellipse cx="42" cy="48" rx="1.3" ry="3.6" fill="#141414"/><ellipse cx="58" cy="48" rx="1.3" ry="3.6" fill="#141414"/>
<path d="M47.6 55.5 L52.4 55.5 L50 58.2Z" fill="#d97a86"/>
<path d="M50 58.2 Q48 61.4 45.2 60.2 M50 58.2 Q52 61.4 54.8 60.2" stroke="#5a3a2a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
<path d="M40 58 L24 55 M40 60 L25 62 M60 58 L76 55 M60 60 L75 62" stroke="#f4efe4" stroke-width=".8" opacity=".9"/>
</svg>`;
}

function portrait(p) {
  if (p.cat) return catSVG(p);
  const sk = p.skin,
    sk2 = shade(sk, -0.16),
    hc = p.hc || "#2a2420",
    sh = p.shirt || "#555";
  const kid = !!p.kid;
  const hy = kid ? 48 : 45,
    hrx = kid ? 15.5 : 16.5,
    hry = kid ? 17.5 : 19.5;
  let back = "",
    body = "",
    hair = "",
    face = "",
    top = "";

  // arka katman: uzun saç, başörtüsü
  if (p.hair === "uzun")
    back += `<path d="M29 46 C27 24 39 19 50 19 C62 19 73 24 71 46 L74 76 C64 80 36 80 26 76 Z" fill="${hc}"/>`;
  if (p.hair === "bob")
    back += `<path d="M30 48 C28 26 39 20 50 20 C61 20 72 26 70 48 L71 63 C66 66 34 66 29 63 Z" fill="${hc}"/>`;
  if (p.hair === "atkuyrugu") back += `<path d="M63 30 C77 33 78 54 71 64 C69 53 66 43 59 38Z" fill="${hc}"/>`;
  if (p.hair === "orgu")
    back += `<path d="M31 50 C24 56 25 66 29 72 C31 64 33 58 35 54Z M69 50 C76 56 75 66 71 72 C69 64 67 58 65 54Z" fill="${hc}"/><circle cx="29" cy="71" r="2.6" fill="#e05a5a"/><circle cx="71" cy="71" r="2.6" fill="#e05a5a"/>`;

  // gövde
  body += `<path d="M11 100 C12 82 28 73 50 73 C72 73 88 82 89 100 Z" fill="${sh}"/>`;
  body += `<path d="M43 ${hy + 13} L43 76 Q50 80 57 76 L57 ${hy + 13} Z" fill="${sk2}"/>`;
  const W = "#f1f0ea",
    sd = shade(sh, -0.18),
    sl = shade(sh, 0.16);
  switch (p.collar) {
    case "tie":
      body += `<path d="M41 74 L50 90 L59 74 Q50 78 41 74Z" fill="${W}"/><path d="M48.4 78 L51.6 78 L53 81 L51.6 96 L50 98 L48.4 96 L47 81Z" fill="${p.tie || "#7a2230"}"/><path d="M37 75 L50 97 L45 100 L29 100 Z M63 75 L50 97 L55 100 L71 100 Z" fill="${sd}"/>`;
      break;
    case "blazer":
      body += `<path d="M42 74 L50 86 L58 74 Q50 77 42 74Z" fill="${p.fem ? shade(sh, 0.45) : W}"/><path d="M37 75 L50 94 L45 100 L29 100 Z M63 75 L50 94 L55 100 L71 100 Z" fill="${sd}"/>`;
      break;
    case "vest":
      body += `<path d="M41 74 L50 92 L59 74 Q50 78 41 74Z" fill="${W}"/><path d="M36 76 L50 96 L50 100 L28 100 Z M64 76 L50 96 L50 100 L72 100 Z" fill="${sd}"/><circle cx="50" cy="96" r="1" fill="${W}"/>`;
      break;
    case "open":
      body += `<path d="M43 74 L50 84 L57 74 Z" fill="${sk2}"/><path d="M40 73 L47 83 L43 85 L37 76Z M60 73 L53 83 L57 85 L63 76Z" fill="${sl}"/>`;
      break;
    case "chain":
      body += `<path d="M42 74 L50 87 L58 74 Z" fill="${sk2}"/><path d="M40 73 L47 85 L43 87 L37 76Z M60 73 L53 85 L57 87 L63 76Z" fill="${shade(sh, -0.08)}"/><path d="M44 77 Q50 85 56 77" stroke="#e2bd4a" stroke-width="1.6" fill="none"/>`;
      break;
    case "apron":
      body += `<path d="M44 74 L50 82 L56 74 Z" fill="${sk2}"/><path d="M38 84 L62 84 L64 100 L36 100 Z" fill="#f2f1ec"/><path d="M40 84 L38 75 M60 84 L62 75" stroke="#f2f1ec" stroke-width="2.4"/>`;
      break;
    case "hoodie":
      body += `<path d="M32 78 C36 70 64 70 68 78 C62 83 38 83 32 78Z" fill="${sl}"/><path d="M46 82 L45 92 M54 82 L55 92" stroke="#e8e8e8" stroke-width="1.3" stroke-linecap="round"/>`;
      break;
    case "uniform":
      body += `<path d="M42 74 L50 84 L58 74 Q50 77 42 74Z" fill="#dfe3ea"/><path d="M50 84 L50 100" stroke="${sd}" stroke-width="1.4"/><circle cx="50" cy="89" r="1.1" fill="#d8b24a"/><circle cx="50" cy="95" r="1.1" fill="#d8b24a"/><path d="M60 86 l2 -3 l2 3 l-2 3z" fill="#d8b24a"/><path d="M20 84 L32 78 L34 82 L22 88Z M80 84 L68 78 L66 82 L78 88Z" fill="#d8b24a"/>`;
      break;
    case "cubbe":
      body += `<path d="M42 74 L50 86 L58 74 Q50 78 42 74Z" fill="#f4f2ea"/><path d="M38 76 L46 100 M62 76 L54 100" stroke="${sd}" stroke-width="3"/>`;
      break;
    case "tshirt":
      body += `<path d="M42 74 Q50 80 58 74" stroke="${sd}" stroke-width="2" fill="none"/>`;
      break;
    case "coat":
      body += `<path d="M42 74 L50 86 L58 74 Z" fill="#7aa6b8"/><path d="M37 75 L50 97 L46 100 L30 100 Z M63 75 L50 97 L54 100 L70 100 Z" fill="${shade(sh, -0.06)}"/><path d="M42 78 C38 90 44 96 50 96 C56 96 62 90 58 78" stroke="#3a3d44" stroke-width="1.3" fill="none"/><circle cx="50" cy="96" r="2" fill="#9aa0a8"/>`;
      break;
    case "turtleneck":
      body += `<path d="M41 73 C41 80 59 80 59 73 L59 69 L41 69Z" fill="${sl}"/>`;
      break;
    case "cardigan":
      body += `<path d="M43 74 L50 84 L57 74 Z" fill="${shade(sh, 0.4)}"/><path d="M50 84 L50 100" stroke="${sd}" stroke-width="1.2"/><circle cx="48" cy="90" r="1" fill="${sd}"/><circle cx="48" cy="96" r="1" fill="${sd}"/>`;
      break;
    case "tulum":
      body += `<path d="M44 74 L50 82 L56 74 Z" fill="${sk2}"/><path d="M38 76 L40 100 M62 76 L60 100" stroke="${sd}" stroke-width="3"/><rect x="42" y="88" width="16" height="12" fill="${sd}"/>`;
      break;
    case "hawaii":
      body += `<path d="M43 74 L50 84 L57 74 Z" fill="${sk2}"/><g fill="#f4d35e"><circle cx="30" cy="88" r="2.4"/><circle cx="40" cy="95" r="2"/><circle cx="62" cy="90" r="2.4"/><circle cx="72" cy="96" r="2"/><circle cx="56" cy="97" r="1.6"/></g><path d="M40 73 L47 83 L43 85 L37 76Z M60 73 L53 83 L57 85 L63 76Z" fill="${sl}"/>`;
      break;
    case "esofman":
      body += `<path d="M42 73 L58 73 L57 78 L43 78Z" fill="${sl}"/><path d="M50 78 L50 100" stroke="#e8e8e8" stroke-width="1.2"/><path d="M26 84 L36 100 M74 84 L64 100" stroke="#f2f2f2" stroke-width="2.2"/>`;
      break;
    case "yelek":
      body += `<path d="M44 74 L50 82 L56 74 Z" fill="${sk2}"/><path d="M30 88 L70 88 M32 94 L68 94" stroke="#e9eef2" stroke-width="2.6"/>`;
      break;
  }

  // başörtüsü / yazma arka şekli
  if (p.hair === "basortu" || p.hair === "yazma") {
    body += `<path d="M27 50 C25 25 39 17 50 17 C61 17 75 25 73 50 C73 64 66 73 58 78 L42 78 C34 73 27 64 27 50Z" fill="${p.scarf}"/>`;
  }

  // baş
  if (p.hair !== "basortu" && p.hair !== "yazma")
    face += `<ellipse cx="${50 - hrx}" cy="${hy + 2}" rx="3" ry="4.6" fill="${sk}"/><ellipse cx="${50 + hrx}" cy="${hy + 2}" rx="3" ry="4.6" fill="${sk}"/>`;
  face += `<ellipse cx="50" cy="${hy}" rx="${hrx}" ry="${hry}" fill="${sk}"/>`;
  if (p.fem || kid)
    face += `<circle cx="41" cy="${hy + 8}" r="3.2" fill="#e8807a" opacity=".22"/><circle cx="59" cy="${hy + 8}" r="3.2" fill="#e8807a" opacity=".22"/>`;

  // sakal
  if (p.beard === "full")
    face += `<path d="M33.5 46 C33 60 40 67.5 50 67.5 C60 67.5 67 60 66.5 46 C64 55 58 58.5 50 58.5 C42 58.5 36 55 33.5 46Z" fill="${hc}"/>`;
  if (p.beard === "short")
    face += `<path d="M34.5 50 C35 61 41 66 50 66 C59 66 65 61 65.5 50 C62 56 57 59 50 59 C43 59 38 56 34.5 50Z" fill="${hc}" opacity=".85"/>`;
  if (p.beard === "stubble")
    face += `<path d="M34 49 C34 61 41 66 50 66 C59 66 66 61 66 49 C62 57 57 60 50 60 C43 60 38 57 34 49Z" fill="${hc}" opacity=".28"/>`;

  // gözler, kaşlar, burun, ağız
  const ey = hy + 1.5,
    er = kid ? 2.3 : 1.9;
  face += `<circle cx="43.5" cy="${ey}" r="${er}" fill="#1d1a1a"/><circle cx="56.5" cy="${ey}" r="${er}" fill="#1d1a1a"/>`;
  if (kid)
    face += `<circle cx="44.2" cy="${ey - 0.8}" r=".7" fill="#fff"/><circle cx="57.2" cy="${ey - 0.8}" r=".7" fill="#fff"/>`;
  const bc = p.brow || (p.hair === "basortu" || p.hair === "yazma" ? "#3a2a20" : hc);
  face += `<path d="M39.5 ${ey - 5} Q43.5 ${ey - 7} 47.5 ${ey - 5.2} M52.5 ${ey - 5.2} Q56.5 ${ey - 7} 60.5 ${ey - 5}" stroke="${bc}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  face += `<path d="M50 ${ey + 2} C49 ${ey + 5.5} 48.3 ${ey + 7.5} 50.6 ${ey + 8}" fill="none" stroke="${sk2}" stroke-width="1.5" stroke-linecap="round"/>`;
  const my = ey + 12;
  face += `<path d="M46 ${my} Q50 ${my + 2.2} 54 ${my}" fill="none" stroke="${p.fem ? "#a8443e" : "#6e2f25"}" stroke-width="1.6" stroke-linecap="round"/>`;

  // bıyık
  const bm = my - 3.6;
  if (p.must === "pala")
    face += `<path d="M50 ${bm} C45 ${bm - 1.4} 40 ${bm} 37.5 ${bm + 4.5} C41.5 ${bm + 2.4} 45.5 ${bm + 3.2} 50 ${bm + 2.2} C54.5 ${bm + 3.2} 58.5 ${bm + 2.4} 62.5 ${bm + 4.5} C60 ${bm} 55 ${bm - 1.4} 50 ${bm}Z" fill="${hc}"/>`;
  if (p.must === "kalem")
    face += `<path d="M44.5 ${bm + 1.6} C47 ${bm + 0.2} 53 ${bm + 0.2} 55.5 ${bm + 1.6} C53 ${bm + 2.4} 47 ${bm + 2.4} 44.5 ${bm + 1.6}Z" fill="${hc}"/>`;
  if (p.must === "fircali") face += `<rect x="43.5" y="${bm - 0.2}" width="13" height="3.6" rx="1.6" fill="${hc}"/>`;

  // saç ön / şapka
  const hat = p.hat || "#333";
  switch (p.hair) {
    case "kisa":
      hair += `<path d="M33 43 C32 27 41 23.5 50 23.5 C60 23.5 68 27 67 43 C65 35 60 31 50 31 C41 31 35 35 33 43Z" fill="${hc}"/>`;
      break;
    case "kel":
      hair += `<path d="M33.5 48 C33 40 34 36 36.8 34.5 L37.3 47Z M66.5 48 C67 40 66 36 63.2 34.5 L62.7 47Z" fill="${hc}"/><ellipse cx="44" cy="31" rx="5" ry="2.4" fill="#fff" opacity=".22"/>`;
      break;
    case "slick":
      hair += `<path d="M33 43 C31 25 42 21 51 21 C61 21 69 26 67 43 C66 33 62 28.5 55 27.5 C47 26.5 38 30 33 43Z" fill="${hc}"/><path d="M42 25 C48 23.5 56 24 61 27" stroke="#fff" stroke-width="1" opacity=".25" fill="none"/>`;
      break;
    case "quiff":
      hair += `<path d="M33.5 42 C31 26 40 14 55 15.5 C64 16.5 70 25 66.5 40 C64 31 58 28 50 28 C42 28 36 33 33.5 42Z" fill="${hc}"/>`;
      break;
    case "undercut":
      hair += `<path d="M34 42 C33 36 34 33 36 32 L36 42Z M66 42 C67 36 66 33 64 32 L64 42Z" fill="${shade(hc, 0.3)}"/><path d="M35 33 C35 20 46 17 54 18 C63 19 67 25 65 33 C58 28 44 27 35 33Z" fill="${hc}"/>`;
      break;
    case "kivircik":
      hair += [
        [36, 34, 6],
        [44, 28, 6.5],
        [53, 27, 6.5],
        [61, 31, 6],
        [65, 38, 4.5],
        [34, 41, 4.5],
        [49, 24, 5],
      ]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`)
        .join("");
      break;
    case "topuz":
      hair += `<circle cx="50" cy="21" r="7" fill="${hc}"/><path d="M33 44 C32 28 41 24.5 50 24.5 C59 24.5 68 28 67 44 C64 35 58 31.5 50 31.5 C42 31.5 36 35 33 44Z" fill="${hc}"/>`;
      break;
    case "bob":
      hair += `<path d="M33 45 C33 28 41 24 50 24 C59 24 67 28 67 45 C62 36 56 33 48 34 C42 35 37 38 33 45Z" fill="${hc}"/>`;
      break;
    case "uzun":
      hair += `<path d="M33 46 C32 28 41 24 50 24 C59 24 68 28 67 46 C64 35 57 30 51 31 C49 36 40 38 33 46Z" fill="${hc}"/>`;
      break;
    case "atkuyrugu":
      hair += `<path d="M33 44 C32 28 41 24.5 50 24.5 C59 24.5 68 28 67 44 C64 35 58 31.5 50 31.5 C42 31.5 36 35 33 44Z" fill="${hc}"/>`;
      break;
    case "orgu":
      hair += `<path d="M34 46 C33 30 41 27 50 27 C59 27 67 30 66 46 C63 37 57 34 50 34 C43 34 37 37 34 46Z" fill="${hc}"/>`;
      break;
    case "basortu":
    case "yazma": {
      const sc = p.scarf;
      hair += `<path d="M32.5 42 C35 27 65 27 67.5 42 C61 34.5 39 34.5 32.5 42Z" fill="${shade(sc, -0.1)}"/>`;
      if (p.hair === "yazma")
        hair += [36, 41, 46, 51, 56, 61, 65]
          .map(
            (x, i) =>
              `<circle cx="${x}" cy="${37.5 - Math.sin((i / 6) * Math.PI) * 4.5}" r="1" fill="${shade(sc, -0.35)}"/>`,
          )
          .join("");
      else hair += `<path d="M58 76 C62 82 66 84 70 84" stroke="${shade(sc, -0.15)}" stroke-width="3" fill="none"/>`;
      break;
    }
    case "kasket":
      hair += `<path d="M33.5 46 C33 41 33.5 38 35 37 L35.5 46Z M66.5 46 C67 41 66.5 38 65 37 L64.5 46Z" fill="${hc}"/>`;
      top += `<path d="M31.5 38 C31 26 41 20.5 51 20.5 C62 20.5 69.5 26 69 35.5 L74 38.5 C66 35.5 45 34 31.5 38Z" fill="${hat}"/><path d="M44 36.5 C55 35 66 35.5 74.5 38.8 C66 40.4 54 40 44 38.6Z" fill="${shade(hat, -0.25)}"/>`;
      break;
    case "takke":
      hair += `<path d="M33.5 46 C33 41 33.5 38 35 36.5 L35.5 46Z M66.5 46 C67 41 66.5 38 65 36.5 L64.5 46Z" fill="${hc}"/>`;
      top += `<path d="M34 35.5 C35 24.5 65 24.5 66 35.5 C58 32.5 42 32.5 34 35.5Z" fill="#f2f0e8"/><path d="M38 33 L62 33" stroke="#d8d3c4" stroke-width=".8" stroke-dasharray="1.2 1.2"/>`;
      break;
    case "fotr":
      hair += `<path d="M33.5 46 C33 41 33.5 38 35 36.5 L35.5 46Z M66.5 46 C67 41 66.5 38 65 36.5 L64.5 46Z" fill="${hc}"/>`;
      top += `<path d="M36 33 C35 19 65 19 64 33 Z" fill="${hat}"/><path d="M44 21.5 Q50 25 56 21.5" stroke="${shade(hat, -0.3)}" stroke-width="1.4" fill="none"/><rect x="36" y="29" width="28" height="3.8" fill="${shade(hat, -0.4)}"/><ellipse cx="50" cy="33.5" rx="22.5" ry="4" fill="${shade(hat, -0.12)}"/>`;
      break;
    case "baret":
      top += `<path d="M32 39 C32 22 68 22 68 39 Z" fill="${hat}"/><path d="M47 23 L53 23 L53.6 39 L46.4 39Z" fill="${shade(hat, -0.08)}"/><rect x="27.5" y="37.5" width="45" height="4.2" rx="2.1" fill="${shade(hat, -0.14)}"/>`;
      break;
    case "kepi":
      top += `<path d="M33 34 L67 34 L69.5 25 C60 20.5 40 20.5 30.5 25Z" fill="${hat}"/><rect x="33" y="32" width="34" height="5" fill="${shade(hat, -0.3)}"/><path d="M36 37 C44 41 56 41 64 37 L66 38.5 C56 44 44 44 34 38.5Z" fill="#111"/><circle cx="50" cy="28" r="2.8" fill="#d8b24a"/>`;
      break;
    case "bere":
      top += `<path d="M33 40 C32 21 68 21 67 40Z" fill="${hat}"/><rect x="32" y="35" width="36" height="6" rx="2" fill="${shade(hat, -0.2)}"/>`;
      break;
  }

  // gözlük
  const gy = ey;
  switch (p.gl) {
    case "round":
      top += `<g fill="none" stroke="#2a2626" stroke-width="1.3"><circle cx="43.5" cy="${gy}" r="4.6"/><circle cx="56.5" cy="${gy}" r="4.6"/><path d="M48.1 ${gy - 0.5} Q50 ${gy - 1.5} 51.9 ${gy - 0.5} M38.9 ${gy - 0.5} L34 ${gy - 1.5} M61.1 ${gy - 0.5} L66 ${gy - 1.5}"/></g>`;
      break;
    case "rect":
      top += `<g fill="none" stroke="#2a2626" stroke-width="1.3"><rect x="38.4" y="${gy - 3.6}" width="10" height="7" rx="1.6"/><rect x="51.6" y="${gy - 3.6}" width="10" height="7" rx="1.6"/><path d="M48.4 ${gy - 1} L51.6 ${gy - 1} M38.4 ${gy - 1.5} L34 ${gy - 2.5} M61.6 ${gy - 1.5} L66 ${gy - 2.5}"/></g>`;
      break;
    case "half":
      top += `<g fill="none" stroke="#6a4c2a" stroke-width="1.4"><path d="M38.6 ${gy + 1} Q43.5 ${gy + 6} 48.4 ${gy + 1} M51.6 ${gy + 1} Q56.5 ${gy + 6} 61.4 ${gy + 1} M48.4 ${gy + 1} L51.6 ${gy + 1}"/></g>`;
      break;
    case "cat":
      top += `<g fill="none" stroke="#1e1e24" stroke-width="1.6"><path d="M37.5 ${gy - 3.5} L48.5 ${gy - 2.5} L47.5 ${gy + 3} Q43 ${gy + 5} 39.5 ${gy + 2.5}Z M62.5 ${gy - 3.5} L51.5 ${gy - 2.5} L52.5 ${gy + 3} Q57 ${gy + 5} 60.5 ${gy + 2.5}Z M48.5 ${gy - 1.5} L51.5 ${gy - 1.5}"/></g>`;
      break;
    case "sun":
      top += `<g><rect x="37.6" y="${gy - 3.4}" width="11" height="7" rx="2.4" fill="#141418"/><rect x="51.4" y="${gy - 3.4}" width="11" height="7" rx="2.4" fill="#141418"/><path d="M48.6 ${gy - 1.4} L51.4 ${gy - 1.4}" stroke="#141418" stroke-width="1.4"/><path d="M39.5 ${gy - 1.8} L42.5 ${gy - 1.8}" stroke="#fff" stroke-width="1" opacity=".5"/></g>`;
      break;
  }

  // aksesuar
  switch (p.acc) {
    case "tespih":
      top +=
        Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI * (0.15 + i * 0.07);
          return `<circle cx="${(70 + Math.cos(a) * 10).toFixed(1)}" cy="${(88 + Math.sin(a) * 10).toFixed(1)}" r="1.9" fill="#c9782a"/>`;
        }).join("") + `<path d="M66 98 L64 100 M66 98 L68 100" stroke="#c9782a" stroke-width="1.4"/>`;
      break;
    case "telefon":
      top += `<rect x="66" y="78" width="10" height="17" rx="2" fill="#141418"/><rect x="67.2" y="79.6" width="7.6" height="12.5" rx="1" fill="#6ab7d8"/><circle cx="71" cy="89" r="1" fill="#e05a5a"/>`;
      break;
    case "rozet":
      top += `<circle cx="61" cy="84" r="2.2" fill="#d8b24a"/><circle cx="61" cy="84" r="1.1" fill="#b3341f"/>`;
      break;
    case "hesap":
      top +=
        `<rect x="62" y="80" width="13" height="17" rx="1.6" fill="#2b2b33"/><rect x="63.6" y="81.6" width="9.8" height="4" fill="#b9d3a6"/>` +
        [0, 1, 2]
          .flatMap(r =>
            [0, 1, 2].map(
              c => `<rect x="${64 + c * 3.3}" y="${87.4 + r * 3.1}" width="2.4" height="2.1" fill="#9a9aa8"/>`,
            ),
          )
          .join("");
      break;
    // başkanlık vesikalıklarının lakap ayrıntıları (SDXL kompozisyonu düz çizimden alır: ayrıntı burada olmalı)
    case "megafon": // tatbikat megafonu (Tatbikat Ziya)
      top += `<path d="M58 80 L76 70 L78 90 Z" fill="#f2f2ee"/><ellipse cx="77" cy="80" rx="2.6" ry="10.2" fill="#d8d9d4"/><rect x="53" y="78" width="7" height="6" rx="1.4" fill="#d23a2e"/><rect x="56" y="84" width="3.2" height="7" rx="1.2" fill="#2b2b33"/><ellipse cx="57.6" cy="92" rx="4.6" ry="3.8" fill="${sk}"/>`;
      break;
    case "kavun": // göğsünün önünde tıklattığı kavun (Tıktık Ahmet)
      top += `<ellipse cx="54" cy="88" rx="15" ry="12.5" fill="#e3c64a"/><path d="M42 82 Q48 88 42 95 M50 76 Q56 88 50 100 M58 76 Q52 88 58 100 M66 82 Q60 88 66 95 M41 86 Q54 80 67 86 M40 91 Q54 97 68 91" stroke="#b9a23a" stroke-width="1.1" fill="none"/><ellipse cx="68.5" cy="80" rx="4.6" ry="3.8" fill="${sk}"/><ellipse cx="41" cy="95" rx="4.8" ry="4" fill="${sk}"/>`;
      break;
    case "mikrofon": // el mikrofonu, ağzının önünde (Mikrofon Ercan)
      top += `<rect x="58.4" y="68" width="6" height="26" rx="2.4" fill="#26262c" transform="rotate(-18 61.4 81)"/><circle cx="57" cy="64.5" r="6.4" fill="#8a8e96"/><path d="M51.6 62.6 L62.4 62.6 M51.2 65.6 L62.8 65.6 M52.2 68.4 L61.8 68.4" stroke="#5a5e66" stroke-width=".8"/><ellipse cx="65" cy="90" rx="5.4" ry="4.4" fill="${sk}"/>`;
      break;
    case "yastik": // boyun yastığı (Hep Yolda Sezai)
      top += `<path d="M37.5 69 Q39 83 50 83.5 Q61 83 62.5 69" stroke="#5f86c8" stroke-width="7.5" fill="none" stroke-linecap="round"/><path d="M39.5 71 Q41 81 50 81.5" stroke="#86a8e0" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      break;
    case "rulo": // göğsünün önünde çapraz tuttuğu rulo proje (İmar Affı Nevzat)
      top += `<g transform="rotate(-28 56 86)"><rect x="34" y="81" width="44" height="10" rx="5" fill="#9cc0e6"/><ellipse cx="78" cy="86" rx="2.6" ry="5" fill="#6a92c4"/><path d="M42 81.4 L42 90.6 M52 81.4 L52 90.6 M62 81.4 L62 90.6" stroke="#6a92c4" stroke-width=".8"/></g><ellipse cx="66" cy="90" rx="5.2" ry="4.2" fill="${sk}"/>`;
      break;
    case "drone": // omzunun üstünde küçük drone (Drone Figen)
      top += `<g transform="translate(78 30)"><path d="M-8 -3 L8 3 M-8 3 L8 -3" stroke="#e8eaee" stroke-width="1.6"/><rect x="-4" y="-2.4" width="8" height="4.8" rx="1.6" fill="#f4f5f7"/><circle cx="0" cy="0" r="1.1" fill="#3a8ad8"/><ellipse cx="-8.5" cy="-3.4" rx="4" ry="1" fill="#c9ccd2"/><ellipse cx="8.5" cy="-3.4" rx="4" ry="1" fill="#c9ccd2"/><ellipse cx="-8.5" cy="3.2" rx="4" ry="1" fill="#c9ccd2"/><ellipse cx="8.5" cy="3.2" rx="4" ry="1" fill="#c9ccd2"/></g>`;
      break;
    case "cuzdan": // kırmızı aile cüzdanı (Nikâh Şükran)
      top += `<rect x="59" y="79" width="12" height="16" rx="1.2" fill="#b3261e"/><rect x="60.2" y="80.2" width="9.6" height="13.6" rx=".8" fill="none" stroke="#e0b24a" stroke-width=".6"/><circle cx="65" cy="85.6" r="2.2" fill="none" stroke="#e0b24a" stroke-width=".7"/><ellipse cx="66" cy="95" rx="5" ry="3.4" fill="${sk}"/>`;
      break;
    case "duduk":
      top += `<path d="M44 76 Q50 88 56 76" stroke="#e8e8e8" stroke-width="1" fill="none"/><rect x="48" y="86" width="6" height="3.6" rx="1.4" fill="#c0c4ca"/>`;
      break;
    case "cay":
      top += `<g transform="translate(64 74)"><ellipse cx="7" cy="23" rx="9" ry="2.4" fill="#f4f3ee"/><path d="M2.5 2 L11.5 2 C11.7 7 8.8 9 9.2 12.5 C9.6 16 12 18 10.5 21 L3.5 21 C2 18 4.4 16 4.8 12.5 C5.2 9 2.3 7 2.5 2Z" fill="#b3431c" stroke="#f4f3ee" stroke-width=".9"/><path d="M2.6 2 L11.4 2 L11.3 5 L2.7 5Z" fill="#f4f3ee" opacity=".55"/></g>`;
      break;
  }

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="${p.bg}"/><circle cx="50" cy="46" r="35" fill="${shade(p.bg, 0.2)}"/>${back}${body}${face}${hair}${top}</svg>`;
}

// Kişilerin tarifleri (anahtarlar cards.ts'teki PEOPLE ile aynı)
const RECIPES = {
  fikret: {
    bg: "#c9a54c",
    skin: "#d9a27a",
    hair: "kisa",
    hc: "#77726c",
    must: "kalem",
    shirt: "#5b4636",
    collar: "vest",
    acc: "cay",
  },
  muhtar: {
    bg: "#8fb3a3",
    skin: "#c68b5f",
    hair: "kasket",
    hat: "#4a4a52",
    hc: "#8f8a84",
    must: "pala",
    shirt: "#6b6f78",
    collar: "open",
  },
  bekir: {
    bg: "#d9b77a",
    skin: "#d9a27a",
    hair: "takke",
    hc: "#e8e4da",
    beard: "full",
    must: "pala",
    shirt: "#3d4a3a",
    collar: "open",
    acc: "tespih",
  },
  huseyin: {
    bg: "#e0a36a",
    skin: "#c68b5f",
    hair: "kisa",
    hc: "#1f1a17",
    must: "fircali",
    shirt: "#7a4a32",
    collar: "apron",
  },
  kaymakam: {
    bg: "#9aa9c4",
    skin: "#e8b894",
    hair: "kisa",
    hc: "#2a2420",
    gl: "rect",
    shirt: "#2b3550",
    collar: "tie",
    tie: "#7a2230",
  },
  vekil: {
    bg: "#b7a6c9",
    skin: "#e0ad86",
    hair: "slick",
    hc: "#a3a09a",
    shirt: "#23252e",
    collar: "tie",
    tie: "#1f4a7a",
    acc: "rozet",
  },
  nermin: {
    bg: "#8cc0c0",
    skin: "#e8b894",
    hair: "bob",
    hc: "#5a3a2a",
    gl: "cat",
    shirt: "#2f6f73",
    collar: "blazer",
    fem: true,
  },
  hayri: {
    bg: "#a8c49a",
    skin: "#d9a27a",
    hair: "takke",
    hc: "#3a3028",
    beard: "full",
    shirt: "#4a5a4a",
    collar: "cubbe",
  },
  burak: {
    bg: "#ee9a8a",
    skin: "#e8b894",
    hair: "quiff",
    hc: "#2a1d16",
    shirt: "#1d1d25",
    collar: "hoodie",
    acc: "telefon",
  },
  albay: {
    bg: "#b0a58c",
    skin: "#e0ad86",
    hair: "kel",
    hc: "#d8d4ca",
    must: "kalem",
    gl: "round",
    shirt: "#1f2a44",
    collar: "blazer",
  },
  kemal: {
    bg: "#e6c35c",
    skin: "#c68b5f",
    hair: "baret",
    hat: "#f2c230",
    hc: "#2a2420",
    must: "fircali",
    shirt: "#e8792a",
    collar: "yelek",
  },
  sevim: {
    bg: "#c7b8d8",
    skin: "#f0c9a6",
    hair: "topuz",
    hc: "#3b2a20",
    gl: "half",
    shirt: "#6a4c7a",
    collar: "blazer",
    fem: true,
    acc: "hesap",
  },
  recep: {
    bg: "#9fb4c8",
    skin: "#c68b5f",
    hair: "kepi",
    hat: "#23324f",
    hc: "#2a2420",
    must: "pala",
    shirt: "#2b3b5c",
    collar: "uniform",
  },
  mahir: {
    bg: "#8ea2b8",
    skin: "#d9a27a",
    hair: "kisa",
    hc: "#1f1a17",
    must: "fircali",
    beard: "stubble",
    shirt: "#3a4a66",
    collar: "tie",
    tie: "#22283a",
  },
  tuncay: {
    bg: "#d2c6a8",
    skin: "#e0ad86",
    hair: "fotr",
    hat: "#4a3a2c",
    hc: "#3a2e26",
    beard: "short",
    gl: "round",
    shirt: "#7a6a58",
    collar: "open",
  },
  elif: {
    bg: "#f2b880",
    skin: "#f0c9a6",
    hair: "uzun",
    hc: "#6b3e26",
    shirt: "#b8452e",
    collar: "cardigan",
    fem: true,
  },
  dursun: {
    bg: "#b9c98a",
    skin: "#b57a52",
    hair: "kasket",
    hat: "#5a4632",
    hc: "#8a8a8a",
    must: "pala",
    beard: "stubble",
    shirt: "#6a5a3c",
    collar: "open",
  },
  cengiz: {
    bg: "#e2a05a",
    skin: "#e0ad86",
    hair: "slick",
    hc: "#161412",
    gl: "sun",
    shirt: "#e9e6de",
    collar: "chain",
  },
  hatice: {
    bg: "#e8a0a8",
    skin: "#e0ad86",
    hair: "basortu",
    scarf: "#3f7a5a",
    shirt: "#7a3f5a",
    collar: "cardigan",
    fem: true,
  },
  deniz: {
    bg: "#9ad0c2",
    skin: "#e8b894",
    hair: "kivircik",
    hc: "#2a1d16",
    gl: "round",
    shirt: "#3f5aa0",
    collar: "tshirt",
  },
  selin: {
    bg: "#c3e0a6",
    skin: "#f0c9a6",
    hair: "atkuyrugu",
    hc: "#a8702e",
    shirt: "#eef2f0",
    collar: "coat",
    fem: true,
  },
  kaan: {
    bg: "#a6b8e0",
    skin: "#e8b894",
    hair: "undercut",
    hc: "#2a2420",
    beard: "short",
    shirt: "#1d2433",
    collar: "turtleneck",
  },
  naciye: {
    bg: "#e6c7a0",
    skin: "#e0ad86",
    hair: "yazma",
    scarf: "#f1efe6",
    gl: "round",
    shirt: "#5a4a7a",
    collar: "cardigan",
    fem: true,
  },
  ferhat: {
    bg: "#b8b0a0",
    skin: "#c68b5f",
    hair: "bere",
    hat: "#2f3a4a",
    hc: "#1f1a17",
    must: "fircali",
    beard: "stubble",
    shirt: "#34506e",
    collar: "tulum",
  },
  hans: {
    bg: "#f0d890",
    skin: "#f3cfb3",
    hair: "kisa",
    hc: "#e3dccb",
    gl: "round",
    shirt: "#d9573f",
    collar: "hawaii",
  },
  orhan: {
    bg: "#f0c040",
    skin: "#d9a27a",
    hair: "kisa",
    hc: "#1f1a17",
    must: "fircali",
    shirt: "#1f5a3a",
    collar: "esofman",
    acc: "duduk",
  },
  levent: {
    bg: "#c8c4bc",
    skin: "#e8b894",
    hair: "baret",
    hat: "#f4f4f0",
    hc: "#2a2420",
    gl: "rect",
    shirt: "#34384a",
    collar: "tie",
    tie: "#5a5f70",
  },
  tekir: { cat: true, bg: "#9fc0a0" },
  fatma: {
    bg: "#e0b8c8",
    skin: "#d9a27a",
    hair: "yazma",
    scarf: "#8a5aa0",
    shirt: "#3a5a7a",
    collar: "cardigan",
    fem: true,
  },
  rahmi: { bg: "#c9a080", skin: "#c68b5f", hair: "kel", hc: "#8a8a8a", must: "pala", shirt: "#5a3a2a", collar: "vest" },
  ayse: {
    kid: true,
    bg: "#f5c26b",
    skin: "#f0c9a6",
    hair: "orgu",
    hc: "#6b3e26",
    shirt: "#e05a5a",
    collar: "tshirt",
    fem: true,
  },
  ingrid: {
    bg: "#b4d0e6",
    skin: "#f3d5c0",
    hair: "uzun",
    hc: "#e7cf86",
    shirt: "#c0392b",
    collar: "turtleneck",
    fem: true,
  },
};

// Eski başkanlar duvarı için tohumdan resmî bir vesikalık
const rngOf = seed => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function mayorFace(seed) {
  const r = rngOf(seed),
    pk = a => a[Math.floor(r() * a.length)];
  const p = {
    bg: pk(["#c9a54c", "#b0a58c", "#9aa9c4", "#a8c49a", "#d2c6a8", "#c7b8d8"]),
    skin: pk(["#f0c9a6", "#e8b894", "#e0ad86", "#d9a27a", "#c68b5f", "#b57a52"]),
    hc: pk(["#1f1a17", "#2a2420", "#3b2a20", "#5a3a2a", "#77726c", "#a3a09a", "#d8d4ca"]),
    shirt: pk(["#23252e", "#2b3550", "#34384a", "#3d2f2a", "#1f3a33", "#4a2f3a"]),
    tie: pk(["#7a2230", "#1f4a7a", "#2f5a3a", "#5a5f70"]),
  };
  if (r() < 0.5) {
    p.fem = true;
    p.hair = pk(["bob", "uzun", "topuz", "atkuyrugu", "basortu"]);
    p.collar = pk(["blazer", "cardigan", "turtleneck"]);
    if (p.hair === "basortu") p.scarf = pk(["#3f7a5a", "#8a5aa0", "#b8452e", "#2f6f73", "#c9a54c"]);
  } else {
    p.hair = pk(["kisa", "kisa", "slick", "kel", "kivircik", "undercut"]);
    p.collar = pk(["tie", "tie", "vest", "blazer"]);
    p.must = pk(["pala", "kalem", "fircali", null, null]);
    if (r() < 0.25) p.beard = pk(["short", "stubble", "full"]);
  }
  if (r() < 0.35) p.gl = pk(["round", "rect", "half"]);
  if (r() < 0.25) p.acc = "rozet";
  return p;
}

// Tarifi elle yazılmış başkanlık vesikalıkları: lakaba uyan bir ayrıntı taşırlar (kavun, baret, düdük...).
// Tarifi olmayanlar mayorFace(sıra) ile tohumdan çizilir. SDXL tanımları repo dışındaki vesikalik-sd/prompts.json'da.
const MAYOR_RECIPES = {
  "baskan-17": {
    shirt: "#3d2f2a",
    bg: "#a8c49a",
    skin: "#c68b5f",
    hair: "kasket",
    hc: "#a3a09a",
    must: "pala",
    collar: "vest",
    acc: "kavun",
    hat: "#6b5a44",
  },
  "baskan-18": {
    shirt: "#e8792a",
    bg: "#b0a58c",
    skin: "#d9a27a",
    hair: "baret",
    hat: "#f1efe8",
    hc: "#77726c",
    must: "pala",
    collar: "yelek",
  },
  "baskan-19": {
    shirt: "#23252e",
    bg: "#9aa9c4",
    skin: "#e0ad86",
    hair: "kisa",
    hc: "#2a2420",
    gl: "rect",
    collar: "blazer",
    acc: "megafon",
  },
  "baskan-20": {
    shirt: "#23252e",
    bg: "#c7b8d8",
    skin: "#e8b894",
    hair: "slick",
    hc: "#1f1a17",
    must: "kalem",
    collar: "tie",
    tie: "#7a2230",
    acc: "mikrofon",
  },
  "baskan-21": {
    shirt: "#34384a",
    bg: "#b0a58c",
    skin: "#e0ad86",
    hair: "kisa",
    hc: "#a3a09a",
    gl: "half",
    collar: "tie",
    tie: "#1f4a7a",
    acc: "yastik",
  },
  "baskan-22": {
    shirt: "#1f3a33",
    bg: "#d2c6a8",
    skin: "#c68b5f",
    hair: "kivircik",
    hc: "#2a2420",
    beard: "short",
    collar: "vest",
    acc: "rulo",
  },
  "baskan-23": {
    shirt: "#2b3550",
    fem: true,
    bg: "#9aa9c4",
    skin: "#f0c9a6",
    hair: "bob",
    hc: "#5a3a2a",
    gl: "round",
    collar: "blazer",
    acc: "drone",
  },
  "baskan-24": {
    shirt: "#4a2f3a",
    fem: true,
    bg: "#c7b8d8",
    skin: "#e8b894",
    hair: "topuz",
    hc: "#d8d4ca",
    gl: "cat",
    collar: "cardigan",
    acc: "cuzdan",
  },
};
