// Videoyu bir uzay-zaman hacmine (X-Y-zaman) cevirir.
// RGB = karenin gercek rengi, A = "hareketlilik" (statik arka plan -> 0).

const LUM = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function seek(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    video.currentTime = t;
    // Ayni kareye seek edilirse 'seeked' gelmeyebilir.
    setTimeout(finish, 400);
  });
}

function loadMeta(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Video acilamadi')), { once: true });
  });
}

/**
 * @param {string} src            blob/URL
 * @param {object} opts           { width, frames, onProgress(0..1, label) }
 * @returns {Promise<{data:Uint8Array,W:number,H:number,D:number,duration:number,times:Float64Array}>}
 */
export async function buildVolume(src, { width = 256, frames = 160, onProgress = () => {} } = {}) {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = src;

  await loadMeta(video);

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  const W = Math.max(8, width & ~1);
  const H = Math.max(8, Math.round((W * video.videoHeight) / video.videoWidth) & ~1);
  const D = frames;
  const WH = W * H;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const data = new Uint8Array(WH * D * 4);
  const lum = new Float32Array(WH * D);
  const times = new Float64Array(D);

  // --- 1. gecis: kareleri cek ---
  for (let z = 0; z < D; z++) {
    const t = ((z + 0.5) / D) * duration;
    times[z] = t;
    await seek(video, t);
    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const base = z * WH;
    for (let i = 0; i < WH; i++) {
      const s = i * 4;
      const o = (base + i) * 4;
      const r = px[s], g = px[s + 1], b = px[s + 2];
      data[o] = r; data[o + 1] = g; data[o + 2] = b;
      lum[base + i] = LUM(r, g, b);
    }
    onProgress((z + 1) / D, `kare ${z + 1}/${D}`);
  }

  video.removeAttribute('src');
  video.load();

  // --- 2. gecis: piksel basina zamansal medyan (arka plan modeli) ---
  onProgress(1, 'arka plan cikariliyor');
  await nextFrame();

  const BINS = 32;
  const hist = new Uint16Array(WH * BINS);
  for (let z = 0; z < D; z++) {
    const base = z * WH;
    for (let i = 0; i < WH; i++) {
      const bin = (lum[base + i] * (BINS / 256)) | 0;
      hist[i * BINS + (bin > BINS - 1 ? BINS - 1 : bin)]++;
    }
  }
  const bg = new Float32Array(WH);
  const half = D >> 1;
  for (let i = 0; i < WH; i++) {
    let acc = 0, b = 0;
    const off = i * BINS;
    for (; b < BINS; b++) {
      acc += hist[off + b];
      if (acc > half) break;
    }
    bg[i] = ((b + 0.5) * 256) / BINS;
  }

  // --- 3. gecis: hareketlilik + uzamsal yumusatma ---
  onProgress(1, 'hareket haritasi');
  await nextFrame();

  const raw = new Float32Array(WH * D);
  for (let z = 0; z < D; z++) {
    const base = z * WH;
    const prev = (z > 0 ? z - 1 : z + 1 < D ? z + 1 : z) * WH;
    for (let i = 0; i < WH; i++) {
      const l = lum[base + i];
      const d = Math.abs(l - bg[i]);
      const g = Math.abs(l - lum[prev + i]);
      raw[base + i] = Math.max(d, 1.6 * g) / 255;
    }
  }

  const tmp = new Float32Array(WH);
  for (let z = 0; z < D; z++) {
    const base = z * WH;
    // yatay 3-tap
    for (let y = 0; y < H; y++) {
      const r0 = y * W;
      for (let x = 0; x < W; x++) {
        const a = raw[base + r0 + (x > 0 ? x - 1 : 0)];
        const b = raw[base + r0 + x];
        const c = raw[base + r0 + (x < W - 1 ? x + 1 : W - 1)];
        tmp[r0 + x] = (a + b + b + c) * 0.25;
      }
    }
    // dikey 3-tap
    for (let y = 0; y < H; y++) {
      const yu = (y > 0 ? y - 1 : 0) * W;
      const yd = (y < H - 1 ? y + 1 : H - 1) * W;
      const r0 = y * W;
      for (let x = 0; x < W; x++) {
        raw[base + r0 + x] = (tmp[yu + x] + tmp[r0 + x] * 2 + tmp[yd + x]) * 0.25;
      }
    }
  }

  // --- 4. gecis: 99.5 persantile gore normalize + alfa kanalina yaz ---
  const rh = new Uint32Array(256);
  for (let i = 0; i < raw.length; i++) {
    let v = (raw[i] * 255) | 0;
    if (v > 255) v = 255;
    rh[v]++;
  }
  const target = raw.length * 0.995;
  let acc = 0, top = 255;
  for (let v = 0; v < 256; v++) {
    acc += rh[v];
    if (acc >= target) { top = v; break; }
  }
  const scale = 255 / Math.max(12, top); // cok sakin videolarda patlamasin

  for (let i = 0; i < raw.length; i++) {
    let a = raw[i] * 255 * scale;
    data[i * 4 + 3] = a > 255 ? 255 : a < 0 ? 0 : a | 0;
  }

  return { data, W, H, D, duration, times };
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
