// A plaster relief as a lit 3D object. Shared by the gallery room, the work page and "In your room".
// All lighting is done in the relief's own local frame: x right, y up, z out of the wall (metres).
import * as THREE from 'three';

export const STANDOFF = 0.035;   // panel face sits this far off the wall
export const RELIEF = 0.016;     // tallest ridge
const FRAME_GAP = 0.008, FRAME_W = 0.014;

const cache = new Map();
export function loadReliefTexture(id) {
  if (!cache.has(id)) {
    cache.set(id, new THREE.TextureLoader().loadAsync(`art/${id}/relief.png`).then(tex => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = 4;
      return tex;
    }));
  }
  return cache.get(id);
}

export const workSize = w => [w.size[0] / 100, w.size[1] / 100];
// outline including a floating frame, used for cast shadows
export const outerSize = w => {
  const [x, y] = workSize(w);
  return w.frame ? [x + 2 * (FRAME_GAP + FRAME_W), y + 2 * (FRAME_GAP + FRAME_W)] : [x, y];
};

const PLASTER = new THREE.Color('#efe9df').convertSRGBToLinear();

const faceVert = /* glsl */`
  uniform sampler2D uH; uniform float uStandoff, uRelief;
  varying vec2 vUv; varying vec3 vLocal;
  float H(vec2 uv) { vec3 t = textureLod(uH, uv, 1.0).rgb; return (t.r * 65280.0 + t.g * 255.0) / 65535.0; }
  void main() {
    vUv = uv;
    vec3 p = position; p.z = uStandoff + H(uv) * uRelief;
    vLocal = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const faceFrag = /* glsl */`
  uniform sampler2D uH; uniform vec2 uTexel, uSize; uniform vec3 uLight, uPlaster, uCamLocal;
  uniform float uIntensity, uAmbient, uGlow, uStandoff, uRelief, uCircle, uTime;
  varying vec2 vUv; varying vec3 vLocal;
  float H(vec2 uv) { vec3 t = texture(uH, uv).rgb; return (t.r * 65280.0 + t.g * 255.0) / 65535.0; }
  float Hl(vec2 uv, float lod) { vec3 t = textureLod(uH, uv, lod).rgb; return (t.r * 65280.0 + t.g * 255.0) / 65535.0; }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    vec2 pc = (vUv - 0.5) * uSize;
    float lip = uCircle > 0.5 ? uSize.x * 0.4925 - length(pc) : min(uSize.x * 0.5 - abs(pc.x), uSize.y * 0.5 - abs(pc.y));
    float cover = clamp(lip / max(fwidth(lip), 1e-6) + 0.5, 0.0, 1.0);   // antialiased outline via alpha-to-coverage
    if (cover <= 0.0) discard;

    vec2 tx = uTexel;
    float h = H(vUv);
    float hx = (H(vUv + vec2(tx.x, 0.0)) - H(vUv - vec2(tx.x, 0.0))) * uRelief / (2.0 * tx.x * uSize.x);
    float hy = (H(vUv + vec2(0.0, tx.y)) - H(vUv - vec2(0.0, tx.y))) * uRelief / (2.0 * tx.y * uSize.y);
    vec3 N = normalize(vec3(-hx, -hy, 1.0));

    vec3 P = vec3(pc, uStandoff + h * uRelief);
    vec3 Lv = uLight - P; float d = length(Lv); vec3 L = Lv / d;
    float ndl = max(dot(N, L), 0.0);

    // march the height field toward the light: raking self-shadows
    float sh = 1.0;
    if (L.z > 0.0 && ndl > 0.0) {
      float tMax = min((uStandoff + uRelief - P.z) / L.z, 0.35);
      float j = ign(gl_FragCoord.xy + uTime);
      for (int i = 1; i <= STEPS; i++) {
        float t = 0.0015 + tMax * (float(i) - j) / float(STEPS);
        vec3 Q = P + L * t;
        vec2 uq = Q.xy / uSize + 0.5;
        // explicit LOD: implicit derivatives are undefined inside this early-exit loop
        if (any(lessThan(uq, vec2(0.0))) || any(greaterThan(uq, vec2(1.0))) || textureLod(uH, uq, 0.0).b < 0.5) break;
        float hq = uStandoff + Hl(uq, 0.0) * uRelief;
        sh = min(sh, smoothstep(-0.0005, 0.06 * t + 0.0008, Q.z - hq));
        if (sh < 0.01) break;
      }
    }
    float cav = clamp(1.0 - (Hl(vUv, 5.0) - h) * 3.2, 0.45, 1.0);   // crevices hold less ambient light

    vec3 V = normalize(uCamLocal - P);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 18.0) * 0.06;   // dry plaster: faint chalky sheen

    float direct = uIntensity * ndl * sh / (d * d);
    vec3 col = uPlaster * (uAmbient * cav + direct) + spec * uIntensity * sh / (d * d);
    col += uPlaster * vec3(1.0, 0.62, 0.30) * uGlow * 0.05 * cav;
    col *= mix(0.82, 1.0, smoothstep(0.0, 0.006, lip));   // the rounded lip catches a little less light
    gl_FragColor = vec4(col, cover);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// frame, panel edge: plain lambert in the same light
const solidVert = /* glsl */`
  uniform mat4 uInvGroup;
  varying vec3 vLocal, vN;
  void main() {
    mat4 toLocal = uInvGroup * modelMatrix;
    vLocal = (toLocal * vec4(position, 1.0)).xyz;
    vN = normalize(mat3(toLocal) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const solidFrag = /* glsl */`
  uniform vec3 uLight, uColor; uniform float uIntensity, uAmbient;
  varying vec3 vLocal, vN;
  void main() {
    vec3 Lv = uLight - vLocal; float d = length(Lv);
    vec3 col = uColor * (uAmbient * 1.15 + uIntensity * max(dot(normalize(vN), Lv / d), 0.0) / (d * d));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createRelief(work, tex, { segments = 512, steps = 48 } = {}) {
  const [W, H] = workSize(work);
  const circle = work.shape === 'circle';
  const group = new THREE.Group();
  const lightLocal = new THREE.Vector3(0, 0.5, 0.6);

  const u = {
    uH: { value: tex },
    uTexel: { value: new THREE.Vector2(1 / tex.image.width, 1 / tex.image.height) },
    uSize: { value: new THREE.Vector2(W, H) },
    uStandoff: { value: STANDOFF },
    uRelief: { value: RELIEF },
    uCircle: { value: circle ? 1 : 0 },
    uPlaster: { value: PLASTER },
    uLight: { value: lightLocal },
    uIntensity: { value: 1 },
    uAmbient: { value: 0.3 },
    uGlow: { value: 0 },
    uTime: { value: 0 },
    uCamLocal: { value: new THREE.Vector3(0, 0, 2) },
    uInvGroup: { value: new THREE.Matrix4() },
  };

  const faceMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: faceVert, fragmentShader: faceFrag, defines: { STEPS: steps } });
  faceMat.alphaToCoverage = true;
  const segY = Math.max(8, Math.round(segments * H / W));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H, segments, segY), faceMat);
  face.userData.workId = work.id;
  group.add(face);

  const solid = color => new THREE.ShaderMaterial({
    uniforms: { ...u, uColor: { value: new THREE.Color(color).convertSRGBToLinear() } },
    vertexShader: solidVert, fragmentShader: solidFrag,
  });

  // panel edge
  const depth = STANDOFF + RELIEF * 0.15;
  let edge;
  if (circle) {
    edge = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.4925, W * 0.4925, depth, 200, 1, true), solid('#e7e0d5'));
    edge.rotation.x = Math.PI / 2;
  } else {
    edge = new THREE.Mesh(new THREE.BoxGeometry(W * 0.999, H * 0.999, depth), solid('#e7e0d5'));
  }
  edge.position.z = depth / 2;
  group.add(edge);

  // oak floating frame
  if (work.frame) {
    const oak = solid('#e4d6bf');
    const fd = STANDOFF + RELIEF * 0.7, o = FRAME_GAP + FRAME_W / 2;
    const bars = [
      [W + 2 * (FRAME_GAP + FRAME_W), FRAME_W, 0, H / 2 + o],
      [W + 2 * (FRAME_GAP + FRAME_W), FRAME_W, 0, -H / 2 - o],
      [FRAME_W, H + 2 * FRAME_GAP, W / 2 + o, 0],
      [FRAME_W, H + 2 * FRAME_GAP, -W / 2 - o, 0],
    ];
    for (const [bw, bh, x, y] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, fd), oak);
      m.position.set(x, y, fd / 2);
      group.add(m);
    }
    // dark shadow gap between canvas and frame
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * FRAME_GAP, H + 2 * FRAME_GAP), new THREE.MeshBasicMaterial({ color: '#2a2622' }));
    back.position.z = 0.004;
    group.add(back);
  }

  // invisible stand-in that casts the panel's shadow when the scene uses shadow maps
  const [OW, OH] = outerSize(work);
  const caster = new THREE.Mesh(circle ? new THREE.CircleGeometry(W * 0.4925, 96) : new THREE.PlaneGeometry(OW, OH),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  caster.position.z = STANDOFF * 0.6;
  caster.castShadow = true;
  caster.userData.workId = work.id;
  group.add(caster);

  const tmp = new THREE.Vector3();
  group.userData = {
    work, uniforms: u, face, caster, size: [W, H],
    // light given in world space
    setLightWorld(v) { group.updateWorldMatrix(true, false); lightLocal.copy(v); group.worldToLocal(lightLocal); },
    setLightLocal(v) { lightLocal.copy(v); },
    update(camera, time) {
      group.updateWorldMatrix(true, false);
      u.uInvGroup.value.copy(group.matrixWorld).invert();
      u.uCamLocal.value.copy(group.worldToLocal(tmp.copy(camera.position)));
      u.uTime.value = (time * 60) % 64;
    },
  };
  return group;
}

// signed distance to a work's outline, for analytic shadow shaders
export const shapeGLSL = /* glsl */`
  float sdShape(vec2 p, vec2 size, float circle) {
    if (circle > 0.5) return length(p) - size.x * 0.5;
    vec2 d = abs(p) - size * 0.5;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }`;
