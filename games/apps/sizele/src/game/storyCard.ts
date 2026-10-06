import { band, ROUNDS, type Result, type RoundInfo } from "@sizele/data/client";
import { besides, carry, loadOutline, project, unwrap } from "./mercator.ts";

/**
 * A picture of the day for a story: the round where the map lied the most,
 * its two countries side by side at their true sizes, and the score. Drawn
 * on a canvas in the browser; nothing leaves the page unless shared.
 */

const W = 1080;
const H = 1920;
const COLOURS = {
  sky: "#16213a",
  skyFar: "#04070d",
  sea: "#0f1a2c",
  coast: "rgba(170, 195, 230, 0.28)",
  grid: "rgba(170, 195, 230, 0.09)",
  ink: "#f1eee9",
  soft: "#9aa0a8",
  unit: "#7a95ff",
  target: "#f0a344",
  great: "#63e07f",
  good: "#f2cc5b",
  fair: "#f0a344",
  poor: "#ef6a5d",
};

interface Words {
  title: string;
  line: string;
  mapSaid: string;
  score: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The round the map lied about the most. */
export function biggestLie(results: readonly Result[]): number {
  let best = 0;
  results.forEach((result, i) => {
    const lie = Math.abs(Math.log(result.apparent / result.ratio));
    if (lie > Math.abs(Math.log(results[best].apparent / results[best].ratio))) best = i;
  });
  return best;
}

export async function storyCard(
  results: readonly Result[],
  rounds: readonly RoundInfo[],
  total: number,
  words: Words,
  names: { unit: string; target: string },
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pick = biggestLie(results);
  const round = rounds[pick];

  // The sky, as on the site.
  const sky = ctx.createRadialGradient(W / 2, 0, 100, W / 2, 0, H);
  sky.addColorStop(0, COLOURS.sky);
  sky.addColorStop(1, COLOURS.skyFar);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const font = (weight: number, size: number): string => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";

  // Brand, and the address up top, clear of a story's reply bar.
  const brand = ctx.createLinearGradient(90, 0, 520, 0);
  brand.addColorStop(0, "#b294ff");
  brand.addColorStop(0.45, "#7a95ff");
  brand.addColorStop(1, "#45dcef");
  ctx.fillStyle = brand;
  ctx.font = font(850, 120);
  ctx.fillText("sizele", 90, 190);
  ctx.fillStyle = COLOURS.soft;
  ctx.font = font(650, 40);
  ctx.fillText(`${words.title} · akinozgen.com/games/sizele`, 94, 252);

  // The map panel.
  const mx = 60;
  const my = 300;
  const mw = W - 120;
  const mh = 860;
  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 48);
  ctx.fillStyle = COLOURS.sea;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();
  ctx.clip();

  if (round) {
    const unitAround = round.unit.centroid[0];
    const dest = besides(round.unit, round.target);
    const landed = carry(round.target.rings, [unwrap(round.target.centroid[0], unitAround), round.target.centroid[1]], dest, 1);
    const landedAround = landed.centre[0];
    const shapes = [
      { rings: round.unit.rings, around: unitAround, colour: COLOURS.unit, name: names.unit, centre: round.unit.centroid },
      { rings: landed.rings, around: landedAround, colour: COLOURS.target, name: names.target, centre: [landedAround, landed.centre[1]] as [number, number] },
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const projected = shapes.map((shape) =>
      shape.rings.map((ring) => {
        const out: number[] = [];
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = project(unwrap(ring[i], shape.around), ring[i + 1]);
          out.push(x, y);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        return out;
      }),
    );
    const pad = 90;
    const scale = Math.min((mw - pad * 2) / (maxX - minX), (mh - pad * 2) / (maxY - minY));
    const ox = mx + mw / 2 - ((minX + maxX) / 2) * scale;
    const oy = my + mh / 2 - ((minY + maxY) / 2) * scale;

    // Mercator's parallels, spreading apart towards the pole: the lie, drawn.
    ctx.strokeStyle = COLOURS.grid;
    ctx.lineWidth = 2;
    for (let lat = -75; lat <= 75; lat += 15) {
      const y = oy + project(0, lat)[1] * scale;
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx + mw, y);
      ctx.stroke();
    }

    // The coasts and borders underneath, for where on Earth this is.
    const lines = await loadOutline().catch(() => [] as number[][][]);
    ctx.strokeStyle = COLOURS.coast;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    for (const shift of [-360, 0, 360]) {
      ctx.beginPath();
      for (const line of lines) {
        let previous: number | null = null;
        for (const [lon, lat] of line) {
          const [x, y] = project(lon + shift, lat);
          const sx = ox + x * scale;
          const sy = oy + y * scale;
          if (previous === null || Math.abs(lon - previous) > 180) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
          previous = lon;
        }
      }
      ctx.stroke();
    }

    shapes.forEach((shape, k) => {
      ctx.beginPath();
      for (const ring of projected[k]) {
        for (let i = 0; i < ring.length; i += 2) {
          const x = ox + ring[i] * scale;
          const y = oy + ring[i + 1] * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.save();
      ctx.shadowColor = shape.colour;
      ctx.shadowBlur = 40;
      ctx.fillStyle = `${shape.colour}dd`;
      ctx.fill("evenodd");
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.strokeStyle = shape.colour;
      ctx.stroke();
    });
    shapes.forEach((shape, k) => {
      let [cx, cy] = project(unwrap(shape.centre[0], shape.around), shape.centre[1]);
      ctx.font = font(800, 46);
      // A country narrower than its name gets the name underneath instead.
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (const ring of projected[k]) {
        for (let i = 0; i < ring.length; i += 2) {
          bottom = Math.max(bottom, ring[i + 1]);
          left = Math.min(left, ring[i]);
          right = Math.max(right, ring[i]);
        }
      }
      if ((right - left) * scale < ctx.measureText(shape.name).width * 1.1) cy = bottom + 60 / scale;
      ctx.textAlign = "center";
      ctx.lineWidth = 12;
      ctx.strokeStyle = "rgba(4, 7, 13, 0.85)";
      ctx.strokeText(shape.name, ox + cx * scale, oy + cy * scale);
      ctx.fillStyle = COLOURS.ink;
      ctx.fillText(shape.name, ox + cx * scale, oy + cy * scale);
    });
    ctx.textAlign = "left";
  }
  ctx.restore();

  // The line under the map.
  ctx.fillStyle = COLOURS.ink;
  ctx.font = font(850, 72);
  const rows = wrap(ctx, words.line, 90, 1270, W - 180, 84);
  ctx.fillStyle = COLOURS.target;
  ctx.font = font(700, 44);
  ctx.fillText(words.mapSaid, 90, 1270 + rows * 84 + 20);

  // The score and its squares, above where a story's own buttons sit.
  ctx.fillStyle = COLOURS.ink;
  ctx.font = font(900, 140);
  ctx.fillText(`${total}`, 90, 1590);
  const scoreWidth = ctx.measureText(`${total}`).width;
  ctx.fillStyle = COLOURS.soft;
  ctx.font = font(700, 52);
  ctx.fillText(words.score, 112 + scoreWidth, 1590);
  for (let i = 0; i < ROUNDS; i++) {
    roundRect(ctx, 90 + i * 104, 1625, 88, 88, 18);
    ctx.fillStyle = results[i] ? COLOURS[band(results[i].score)] : "rgba(255,255,255,0.1)";
    ctx.fill();
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** Writes text in lines that fit the width, and says how many it took. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number): number {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = word;
      row++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight);
  return row + 1;
}
