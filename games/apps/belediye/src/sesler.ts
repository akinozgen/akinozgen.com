// Efekt sesleri: hepsi WebAudio ile sentezlenir. Oyun (ui.ts, snd) çalarken çağırır; tools/godot/efekt.mjs aynı tanımları
// OfflineAudioContext'te çalıştırıp WAV basar (Godot portu). c: bağlam, out: ana ses düğümü, t: başlangıç zamanı.
type Bag = BaseAudioContext;
const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
};
const noise = (c: Bag, dur: number) => {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate),
    d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
};
// Karplus-Strong telli çalgı; her bağlam için ayrı önbellek
const ks = new WeakMap<Bag, Record<number, AudioBuffer>>();
const pluckBuf = (c: Bag, f: number) => {
  const k = ks.get(c) || {};
  ks.set(c, k);
  if (k[f]) return k[f];
  const sr = c.sampleRate,
    N = Math.round(sr / f),
    len = Math.floor(sr * 1.8),
    buf = c.createBuffer(1, len, sr),
    d = buf.getChannelData(0),
    ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 0, j = 0; i < len; i++, j = (j + 1) % N) {
    const a = ring[j];
    d[i] = a;
    ring[j] = 0.4985 * (a + ring[(j + 1) % N]);
  }
  return (k[f] = buf);
};
const pluck = (c: Bag, out: AudioNode, f: number, t: number, v = 0.5) => {
  const s = c.createBufferSource(),
    g = c.createGain();
  s.buffer = pluckBuf(c, f);
  g.gain.value = v;
  s.connect(g).connect(out);
  s.start(t);
};
export const EFEKT = {
  // menüde madde değişince kısa, yumuşak bir tık
  tick(c: Bag, out: AudioNode, t: number) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(950, t + 0.035);
    env(g, t, 0.002, 0.07, 0.045);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.09);
  },
  // damga: tok vuruş ve kâğıt hışırtısı
  stamp(c: Bag, out: AudioNode, t: number) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
    env(g, t, 0.004, 0.9, 0.2);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
    const n = noise(c, 0.09),
      f = c.createBiquadFilter(),
      g2 = c.createGain();
    f.type = "lowpass";
    f.frequency.value = 1500;
    env(g2, t, 0.002, 0.55, 0.07);
    n.connect(f).connect(g2).connect(out);
    n.start(t);
  },
  // yeni evrak: kâğıt sesi
  paper(c: Bag, out: AudioNode, t0: number) {
    const t = t0 + 0.02,
      n = noise(c, 0.3),
      f = c.createBiquadFilter(),
      g = c.createGain();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.linearRampToValueAtTime(4200, t + 0.22);
    f.Q.value = 0.8;
    env(g, t, 0.05, 0.16, 0.2);
    n.connect(f).connect(g).connect(out);
    n.start(t);
  },
  // çay bardağı şıngırtısı
  clink(c: Bag, out: AudioNode, t0: number) {
    const t = t0 + 0.05;
    [2637, 3951, 5274].forEach((fr, i) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = fr;
      env(g, t + i * 0.004, 0.002, 0.12 / (i + 1), 0.5);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.7);
    });
  },
  // Hicaz dörtlüsü: Re, Mi♭, Fa♯, Sol
  hicaz(c: Bag, out: AudioNode, t0: number) {
    const t = t0 + 0.1;
    [
      [440, 0],
      [392, 0.3],
      [369.99, 0.6],
      [311.13, 0.9],
      [369.99, 1.25],
      [311.13, 1.5],
      [293.66, 1.8],
    ].forEach(([f, d]) => pluck(c, out, f, t + d, 0.45));
  },
  // zafer: yükselen dörtlü
  win(c: Bag, out: AudioNode, t0: number) {
    const t = t0 + 0.08;
    [
      [293.66, 0],
      [369.99, 0.12],
      [440, 0.24],
      [587.33, 0.38],
      [587.33, 0.52],
    ].forEach(([f, d]) => pluck(c, out, f, t + d, 0.4));
  },
};
