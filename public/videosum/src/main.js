import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildVolume } from './volume.js';
import { vert, frag } from './shader.js';

const $ = (id) => document.getElementById(id);

const el = {
  stage: $('stage'), canvas: $('gl'), drop: $('drop'), busy: $('busy'),
  busyTitle: $('busy-title'), busyNote: $('busy-note'), barFill: $('bar-fill'),
  file: $('file'), preview: $('preview'), hud: $('hud'), stats: $('stats'),
  scrub: $('scrub'), play: $('play'), time: $('time'),
  reload: $('reload'), reextract: $('reextract'),
};

// ---------------------------------------------------------------- three kurulumu
const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0b0d10, 1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // dokudaki sRGB baytlari oldugu gibi goster

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(1.7, 1.15, 2.3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const uniforms = {
  uVol: { value: null },
  uHalf: { value: new THREE.Vector3(0.5, 0.28, 0.7) },
  uCamObj: { value: new THREE.Vector3() },
  uTintCol: { value: new THREE.Color(0xe8b44a) },
  uLo: { value: 0.06 },
  uHi: { value: 0.30 },
  uDensity: { value: 3.0 },
  uSlice: { value: 0 },
  uSliceW: { value: 0.006 },
  uClip0: { value: 0 },
  uClip1: { value: 1 },
  uSteps: { value: 256 },
  uMode: { value: 0 },
  uTint: { value: 0 },
  uShowSlice: { value: true },
  uInvert: { value: false },
};

const material = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms,
  vertexShader: vert,
  fragmentShader: frag,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  premultipliedAlpha: true,
});

let mesh = null;
let frame = null; // tel cerceve

const state = {
  W: 0, H: 0, D: 0, duration: 0,
  depth: 1.4,
  playing: false,
  spin: false,
  srcURL: null,
};

// ---------------------------------------------------------------- kutu geometrisi
function rebuildBox() {
  if (!state.W) return;
  const hx = 0.5;
  const hy = 0.5 * (state.H / state.W);
  const hz = 0.5 * state.depth;
  uniforms.uHalf.value.set(hx, hy, hz);

  const rot = mesh ? mesh.rotation.clone() : null;
  const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);

  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(geo, material);
  if (rot) mesh.rotation.copy(rot);
  scene.add(mesh);

  if (frame) { scene.remove(frame); frame.geometry.dispose(); }
  frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x2f3742 })
  );
  scene.add(frame);
  frame.visible = $('box').checked;
}

// ---------------------------------------------------------------- yukleme akisi
async function load(file) {
  if (state.srcURL) URL.revokeObjectURL(state.srcURL);
  state.srcURL = URL.createObjectURL(file);

  el.preview.src = state.srcURL;
  el.preview.classList.add('on');

  await extract();
}

async function extract() {
  if (!state.srcURL) return;
  el.drop.classList.add('hidden');
  el.busy.classList.remove('hidden');
  el.busyTitle.textContent = 'Kareler cikariliyor';
  setProgress(0, '…');

  const width = +$('res').value;
  const frames = +$('nframes').value;

  const t0 = performance.now();
  let vol;
  try {
    vol = await buildVolume(state.srcURL, {
      width, frames,
      onProgress: (p, label) => setProgress(p, label),
    });
  } catch (err) {
    el.busyTitle.textContent = 'Olmadi';
    el.busyNote.textContent = String(err && err.message ? err.message : err);
    return;
  }
  const ms = Math.round(performance.now() - t0);

  state.W = vol.W; state.H = vol.H; state.D = vol.D; state.duration = vol.duration;

  const tex = new THREE.Data3DTexture(vol.data, vol.W, vol.H, vol.D);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;

  if (uniforms.uVol.value) uniforms.uVol.value.dispose();
  uniforms.uVol.value = tex;

  rebuildBox();
  el.busy.classList.add('hidden');

  const mb = (vol.data.byteLength / 1048576).toFixed(1);
  el.stats.textContent =
    `hacim   ${vol.W} x ${vol.H} x ${vol.D}\n` +
    `bellek  ${mb} MB\n` +
    `sure    ${vol.duration.toFixed(2)} sn\n` +
    `cikarim ${(ms / 1000).toFixed(1)} sn`;
  el.hud.textContent = 'X-Y = kare  ·  Z = zaman (on yuz = 0 sn)';
  setTime(0);
}

function setProgress(p, label) {
  el.barFill.style.width = `${Math.round(p * 100)}%`;
  if (label) el.busyNote.textContent = label;
}

// ---------------------------------------------------------------- zaman / transport
function setTime(t) {
  const d = state.duration || 1;
  const n = Math.min(1, Math.max(0, t / d));
  uniforms.uSlice.value = n;
  el.scrub.value = String(n);
  el.time.textContent = `${t.toFixed(2)} / ${d.toFixed(2)} sn`;
}

el.scrub.addEventListener('input', () => {
  const t = +el.scrub.value * (state.duration || 1);
  el.preview.currentTime = t;
  setTime(t);
});

function togglePlay(force) {
  const want = force === undefined ? !state.playing : force;
  state.playing = want;
  el.play.textContent = want ? '❚❚' : '▶';
  if (want) {
    el.preview.play().catch(() => { state.playing = false; el.play.textContent = '▶'; });
  } else {
    el.preview.pause();
  }
}
el.play.addEventListener('click', () => togglePlay());
el.preview.addEventListener('ended', () => togglePlay(false));

addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
    e.preventDefault();
    togglePlay();
  }
});

// ---------------------------------------------------------------- dosya girisi
el.file.addEventListener('change', () => {
  if (el.file.files[0]) load(el.file.files[0]);
});
el.drop.addEventListener('click', (e) => {
  if (e.target === el.drop) el.file.click();
});
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', () => document.body.classList.remove('dragging'));
addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('video/'));
  if (f) load(f);
});
el.reload.addEventListener('click', () => {
  togglePlay(false);
  el.drop.classList.remove('hidden');
});
el.reextract.addEventListener('click', () => extract());

// ---------------------------------------------------------------- kontroller
function bindRange(id, out, apply, fmt) {
  const input = $(id), o = $(out);
  const f = fmt || ((v) => v.toFixed(2));
  const run = () => { const v = +input.value; o.textContent = f(v); apply(v); };
  input.addEventListener('input', run);
  run();
}
function bindCheck(id, apply) {
  const input = $(id);
  const run = () => apply(input.checked);
  input.addEventListener('change', run);
  run();
}
function bindSelect(id, apply) {
  const input = $(id);
  const run = () => apply(+input.value);
  input.addEventListener('change', run);
  run();
}

bindRange('lo', 'o-lo', (v) => { uniforms.uLo.value = Math.min(v, uniforms.uHi.value - 0.005); });
bindRange('hi', 'o-hi', (v) => { uniforms.uHi.value = Math.max(v, uniforms.uLo.value + 0.005); });
bindRange('den', 'o-den', (v) => { uniforms.uDensity.value = v; }, (v) => v.toFixed(1));
bindRange('sw', 'o-sw', (v) => { uniforms.uSliceW.value = v; }, (v) => v.toFixed(3));
bindRange('c0', 'o-c0', (v) => { uniforms.uClip0.value = Math.min(v, uniforms.uClip1.value - 0.01); });
bindRange('c1', 'o-c1', (v) => { uniforms.uClip1.value = Math.max(v, uniforms.uClip0.value + 0.01); });
bindRange('steps', 'o-steps', (v) => { uniforms.uSteps.value = v | 0; }, (v) => String(v | 0));
bindRange('depth', 'o-depth', (v) => { state.depth = v; rebuildBox(); }, (v) => v.toFixed(2));

bindCheck('invert', (v) => { uniforms.uInvert.value = v; });
bindCheck('showslice', (v) => { uniforms.uShowSlice.value = v; });
bindCheck('spin', (v) => { state.spin = v; });
bindCheck('box', (v) => { if (frame) frame.visible = v; });

bindSelect('mode', (v) => { uniforms.uMode.value = v; });
bindSelect('tint', (v) => { uniforms.uTint.value = v; });

// ---------------------------------------------------------------- dongu
function resize() {
  const w = el.stage.clientWidth, h = el.stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const camObj = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  controls.update();

  if (mesh) {
    if (state.spin) mesh.rotation.y += 0.004;
    if (frame) frame.rotation.copy(mesh.rotation);

    mesh.updateMatrixWorld();
    camObj.copy(camera.position);
    mesh.worldToLocal(camObj);
    uniforms.uCamObj.value.copy(camObj);
  }

  if (state.playing && state.duration) setTime(el.preview.currentTime);

  renderer.render(scene, camera);
});
