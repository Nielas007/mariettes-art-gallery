// One work on a plaster wall, lit by a light the visitor holds.
import * as THREE from 'three';
import { createRelief, loadReliefTexture, outerSize, shapeGLSL, STANDOFF, RELIEF } from './relief.js';

const wallFrag = /* glsl */`
  uniform vec3 uLight, uWall; uniform float uIntensity, uAmbient, uGlow, uCircle;
  uniform vec2 uOuter;
  varying vec3 vPos;
  ${shapeGLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }
  void main() {
    vec3 P = vPos;
    vec2 e = vec2(0.004, 0.0);
    float h0 = fbm(P.xy * 9.0), hx = fbm((P.xy + e.xy) * 9.0), hy = fbm((P.xy + e.yx) * 9.0);
    vec3 N = normalize(vec3(-(hx - h0) * 0.35, -(hy - h0) * 0.35, 1.0));   // limewash trowel marks
    vec3 Lv = uLight - P; float d = length(Lv); vec3 L = Lv / d;
    float ndl = max(dot(N, L), 0.0);
    float sh = 1.0;
    float panelZ = ${(STANDOFF + RELIEF * 0.4).toFixed(4)};
    if (uLight.z > panelZ) {   // the panel's cast shadow
      vec3 Q = P + Lv * (panelZ / uLight.z);
      float pen = 0.07 * panelZ / max(uLight.z - panelZ, 0.01) + 0.0015;
      sh = smoothstep(-pen, pen, sdShape(Q.xy, uOuter, uCircle));
    }
    float rim = sdShape(P.xy, uOuter, uCircle);
    float contact = 1.0 - 0.28 * exp(-max(rim, 0.0) / 0.035);
    vec3 base = uWall * (0.94 + 0.06 * fbm(P.xy * 2.3));
    vec3 col = base * (uAmbient * contact + uIntensity * ndl * sh / (d * d));
    col += base * vec3(1.0, 0.62, 0.30) * uGlow * (1.3 * exp(-max(rim, 0.0) / 0.06) + 0.12 * exp(-max(rim, 0.0) / 0.3));
    col *= mix(0.78, 1.0, exp(-dot(P.xy, P.xy) * 0.15));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createViewer(container, { fill = 0.66 } = {}) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
  const light = { pos: new THREE.Vector3(0.6, 0.4, 0.25), target: new THREE.Vector3(0.6, 0.4, 0.25), intensity: 0.3, glow: 0 };

  const wallU = {
    uLight: { value: light.pos }, uIntensity: { value: 0.3 }, uAmbient: { value: 0.3 }, uGlow: { value: 0 },
    uCircle: { value: 1 }, uOuter: { value: new THREE.Vector2(0.9, 0.9) },
    uWall: { value: new THREE.Color('#e6dfd4').convertSRGBToLinear() },
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.ShaderMaterial({
    uniforms: wallU,
    vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`,
    fragmentShader: wallFrag,
  }));
  scene.add(wall);

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff8ee' }));
  scene.add(dot);

  let relief = null, work = null, mode = 'hand', rake = 0.55, lastMove = -1e9, running = false, size = [0.9, 0.9];
  const lightZ = () => THREE.MathUtils.lerp(0.62, 0.07, rake);

  function frame() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const [OW, OH] = work ? outerSize(work) : size;
    const needH = Math.max(OH, OW / camera.aspect) / fill;
    camera.position.set(0, 0, needH / (2 * Math.tan(vfov / 2)) + STANDOFF);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(frame).observe(container);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    plane.constant = -lightZ();
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) { light.target.copy(hit); lastMove = performance.now(); }
    container.dispatchEvent(new CustomEvent('lightmove'));
  }
  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('pointerdown', pointer);
  canvas.style.touchAction = 'none';

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    const idle = performance.now() - lastMove > 3500;
    const [W, H] = size;
    let I = 0.3, G = 0;
    if (mode === 'hand') {
      if (idle) {
        const a = t * 0.32;
        light.target.set(Math.cos(a) * W * 0.78, Math.sin(a * 1.3) * H * 0.35 + H * 0.12, lightZ());
      } else light.target.z = lightZ();
    } else if (mode === 'gallery') {
      light.target.set(0.05, H * 1.15, THREE.MathUtils.lerp(1.1, 0.25, rake)); I = 1.25;
    } else {
      light.target.set(Math.cos(t * 0.2) * 0.25, H * 0.9, THREE.MathUtils.lerp(0.9, 0.2, rake)); I = 0.12; G = 1;
    }
    light.pos.lerp(light.target, idle && mode === 'hand' ? 0.03 : 0.14);
    light.intensity += (I - light.intensity) * 0.06;
    light.glow += (G - light.glow) * 0.04;
    wallU.uIntensity.value = light.intensity; wallU.uGlow.value = light.glow;
    wallU.uAmbient.value = 0.3 - light.glow * 0.12;
    if (relief) {
      const u = relief.userData.uniforms;
      u.uIntensity.value = light.intensity; u.uGlow.value = light.glow; u.uAmbient.value = wallU.uAmbient.value;
      relief.userData.setLightLocal(light.pos);
      relief.userData.update(camera, t);
    }
    dot.position.copy(light.pos); dot.visible = mode === 'hand';
    renderer.render(scene, camera);
  }

  return {
    canvas,
    async show(w) {
      if (work && work.id === w.id) return;
      work = w;
      const tex = await loadReliefTexture(w.id);
      if (work !== w) return;
      if (relief) { scene.remove(relief); relief.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
      relief = createRelief(w, tex, { segments: mobile ? 384 : 640, steps: 64 });
      scene.add(relief);
      size = relief.userData.size;
      wallU.uCircle.value = w.shape === 'circle' ? 1 : 0;
      wallU.uOuter.value.set(...outerSize(w));
      if (mode === 'glow' && !w.glow) mode = 'hand';
      frame();
    },
    setMode(m) { mode = m; canvas.style.cursor = m === 'hand' ? 'none' : 'default'; },
    setRake(r) { rake = r; },
    start() { if (!running) { running = true; frame(); renderer.setAnimationLoop(tick); } },
    stop() { running = false; renderer.setAnimationLoop(null); },
  };
}
