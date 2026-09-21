export const vert = /* glsl */ `
varying vec3 vObj;
void main() {
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler3D uVol;
uniform vec3  uHalf;
uniform vec3  uCamObj;
uniform vec3  uTintCol;
uniform float uLo;
uniform float uHi;
uniform float uDensity;
uniform float uSlice;
uniform float uSliceW;
uniform float uClip0;
uniform float uClip1;
uniform int   uSteps;
uniform int   uMode;   // 0 hacim, 1 MIP, 2 x-ray
uniform int   uTint;   // 0 gercek, 1 zaman, 2 tek renk
uniform bool  uShowSlice;
uniform bool  uInvert;

varying vec3 vObj;

// GLSL3 + ShaderMaterial: three kendi cikis degiskenini tanimlamaz
layout(location = 0) out vec4 fragColor;

vec2 boxHit(vec3 ro, vec3 rd, vec3 h) {
  vec3 inv = 1.0 / rd;
  vec3 a = (-h - ro) * inv;
  vec3 b = ( h - ro) * inv;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

vec3 timeColor(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t * 0.85 + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec3 ro = uCamObj;
  vec3 rd = normalize(vObj - ro);

  // sifir bilesenlerde 1/0 kacamagi
  vec3 sg = sign(rd);
  sg = mix(sg, vec3(1.0), step(abs(sg), vec3(0.5)));
  rd = max(abs(rd), vec3(1e-6)) * sg;

  vec2 hit = boxHit(ro, rd, uHalf);
  hit.x = max(hit.x, 0.0);
  if (hit.y <= hit.x) discard;

  // zaman ekseninde kirpma
  float zlo = mix(-uHalf.z, uHalf.z, uClip0);
  float zhi = mix(-uHalf.z, uHalf.z, uClip1);
  float ta = (zlo - ro.z) / rd.z;
  float tb = (zhi - ro.z) / rd.z;
  hit.x = max(hit.x, min(ta, tb));
  hit.y = min(hit.y, max(ta, tb));
  if (hit.y <= hit.x) discard;

  int steps = uSteps;
  float dt = (hit.y - hit.x) / float(steps);
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  vec3 p = ro + rd * (hit.x + dt * jit);
  vec3 dstep = rd * dt;

  // dilim duzlemi: adimlar arasi isaret degisimiyle yakalanir, boylece
  // ince duzlem hicbir adim sayisinda atlanmaz
  float zSlice = mix(-uHalf.z, uHalf.z, uSlice);
  float prevRel = (p.z - dstep.z) - zSlice;

  vec4  acc  = vec4(0.0);
  float mipA = 0.0;  vec3 mipC = vec3(0.0);
  float sumA = 0.0;  vec3 sumC = vec3(0.0);

  for (int i = 0; i < 512; i++) {
    if (i >= steps) break;

    vec3 uvw = p / (2.0 * uHalf) + 0.5;
    uvw.y = 1.0 - uvw.y;
    vec4 s = texture(uVol, uvw);

    float a = smoothstep(uLo, uHi, s.a);
    if (uInvert) a = 1.0 - a;

    vec3 c = s.rgb;
    float l = dot(s.rgb, vec3(0.3333));
    if (uTint == 1)      c = timeColor(uvw.z) * (0.35 + 0.65 * l);
    else if (uTint == 2) c = uTintCol * (0.30 + 0.70 * l);

    float rel = p.z - zSlice;
    bool onSlice = uShowSlice && (rel * prevRel <= 0.0 || abs(uvw.z - uSlice) < uSliceW);
    prevRel = rel;

    if (onSlice) {
      a = 1.0;
      c = s.rgb;
    }

    if (uMode == 1) {
      if (a > mipA) { mipA = a; mipC = c; }
    } else if (uMode == 2) {
      float w = a * dt * uDensity * 4.0;
      sumA += w;
      sumC += c * w;
    } else {
      float al = onSlice ? 1.0 : 1.0 - exp(-a * uDensity * dt * 8.0);
      acc.rgb += (1.0 - acc.a) * al * c;
      acc.a   += (1.0 - acc.a) * al;
      if (acc.a > 0.995) break;
    }

    p += dstep;
  }

  vec4 outc;
  if (uMode == 1) {
    outc = vec4(mipC * mipA, mipA);
  } else if (uMode == 2) {
    float a = 1.0 - exp(-sumA);
    outc = vec4((sumC / max(sumA, 1e-4)) * a, a);
  } else {
    outc = acc;
  }

  if (outc.a < 0.003) discard;
  fragColor = outc;   // premultiplied
}
`;
