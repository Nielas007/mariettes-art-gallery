// The walk-around gallery: a quiet Nordic room with the works on its walls.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createRelief, loadReliefTexture, outerSize } from './relief.js';
import { WORKS, fmtSize } from './works.js';

const ROOM = { x: 3.8, z: 3.2, h: 3.3 };
const EYE = 1.6;
const SPOT_PER_RELIEF = 5;     // converts relief-shader intensity to three.js candela
const PLACES = {
  tree:    { pos: [0, 1.62, -ROOM.z], rotY: 0 },
  strata:  { pos: [0, 1.58, ROOM.z], rotY: Math.PI },
  drift:   { pos: [-ROOM.x, 1.62, -0.3], rotY: Math.PI / 2 },
  feather: { pos: [ROOM.x, 1.62, -0.3], rotY: -Math.PI / 2 },
};

// ---------- materials shared with "In your room" ----------
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function makeOakTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 2048;
  const g = c.getContext('2d'), r = rand(7);
  const plankW = 2048 / 22;                       // 22 planks across 4 m ≈ 18 cm boards
  for (let i = 0; i < 22; i++) {
    let y = -r() * 900;
    while (y < 2048) {
      const len = 500 + r() * 700;
      const l = 78 + r() * 5, a = 0.1 + r() * 0.04;
      g.fillStyle = `hsl(${34 + r() * 3}, ${28 + r() * 7}%, ${l}%)`;
      g.fillRect(i * plankW, y, plankW, len);
      // grain
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(120, 85, 50, ${0.03 + r() * 0.05})`;
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        const x0 = i * plankW + r() * plankW, ph = r() * 6, amp = 1 + r() * 3;
        for (let yy = y; yy < y + len; yy += 16) g.lineTo(x0 + Math.sin(yy / 90 + ph) * amp, yy);
        g.stroke();
      }
      g.fillStyle = `rgba(70, 50, 30, ${a})`;
      g.fillRect(i * plankW, y, plankW, 2);           // butt joint
      y += len;
    }
    g.fillStyle = 'rgba(70, 50, 30, 0.14)';
    g.fillRect(i * plankW, 0, 1.5, 2048);              // seam
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
export const wallMaterial = () => new THREE.MeshStandardMaterial({ color: '#f1ece4', roughness: 0.94 });
export const oakMaterial = () => new THREE.MeshStandardMaterial({ color: '#d2b48c', roughness: 0.55 });

// soft corner shading: surfaces darken where they meet the other walls, floor and ceiling
function roomAO(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRoom = { value: new THREE.Vector3(ROOM.x, ROOM.h, ROOM.z) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform vec3 uRoom;
        float aoTerm(float d) { return d < 0.004 ? 1.0 : mix(0.58, 1.0, smoothstep(0.0, 0.85, d)); }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float ao = aoTerm(uRoom.x - abs(vWPos.x)) * aoTerm(uRoom.z - abs(vWPos.z)) * aoTerm(vWPos.y) * aoTerm(uRoom.y - vWPos.y);
        reflectedLight.indirectDiffuse *= ao;
        reflectedLight.directDiffuse *= mix(1.0, ao, 0.4);`);
  };
  return mat;
}

function labelTexture(work) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#2b2620';
  g.font = 'italic 64px "Instrument Serif", serif'; g.fillText(work.title, 36, 98);
  g.fillStyle = 'rgba(43,38,32,.6)';
  g.font = '400 26px "Inter Tight", sans-serif';
  g.fillText(`Mariëtte, ${work.year}`, 38, 150);
  g.fillText(fmtSize(work), 38, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createGallery(container, { onStop, onLight } = {}) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  canvas.style.touchAction = 'none';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.4 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ece7df');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#fff8f0', '#cdbb9f', 0.35));
  RectAreaLightUniformsLib.init();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);

  // ---------- the room ----------
  const wallMat = roomAO(wallMaterial());
  const floorTex = makeOakTexture(); floorTex.repeat.set(ROOM.x * 2 / 4, ROOM.z * 2 / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2),
    roomAO(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.4, envMapIntensity: 1.0 })));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), roomAO(new THREE.MeshStandardMaterial({ color: '#f7f5f1', roughness: 1, emissive: '#2c2a27' })));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM.h;
  scene.add(ceiling);

  const walls = [
    [ROOM.x * 2, [0, ROOM.h / 2, -ROOM.z], 0],
    [ROOM.x * 2, [0, ROOM.h / 2, ROOM.z], Math.PI],
    [ROOM.z * 2, [-ROOM.x, ROOM.h / 2, 0], Math.PI / 2],
    [ROOM.z * 2, [ROOM.x, ROOM.h / 2, 0], -Math.PI / 2],
  ];
  const gapMat = new THREE.MeshBasicMaterial({ color: '#3b352f' });
  for (const [w, p, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat);
    m.position.set(...p); m.rotation.y = ry; m.receiveShadow = true;
    scene.add(m);
    // shadow-gap skirting
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.014), gapMat);
    s.position.set(p[0], 0.007, p[2]); s.rotation.y = ry; s.translateZ(0.002);
    scene.add(s);
  }

  // skylight: a long soft slot of daylight
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  sky.rotation.x = Math.PI / 2; sky.position.set(0, ROOM.h - 0.001, 0.2);
  scene.add(sky);
  const skyLight = new THREE.RectAreaLight('#f3f5ff', 2.6, 5.4, 0.8);
  skyLight.position.set(0, ROOM.h - 0.01, 0.2); skyLight.lookAt(0, 0, 0.2);
  scene.add(skyLight);

  // bench
  const oak = oakMaterial();
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.055, 0.46), oak); top.position.y = 0.44;
  bench.add(top);
  for (const x of [-0.78, 0.78]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.42), oak); leg.position.set(x, 0.21, 0); bench.add(leg);
  }
  bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  bench.position.set(0, 0, 0.35);
  scene.add(bench);

  // plinth with a stoneware vase
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42), new THREE.MeshStandardMaterial({ color: '#f3efe8', roughness: 0.9 }));
  plinth.position.set(-3.25, 0.475, -2.65); plinth.castShadow = plinth.receiveShadow = true;
  const prof = [[0, 0], [0.09, 0], [0.12, 0.05], [0.14, 0.16], [0.12, 0.28], [0.06, 0.36], [0.05, 0.42], [0.065, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
  const vase = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), new THREE.MeshStandardMaterial({ color: '#c9bba6', roughness: 0.85 }));
  vase.position.set(-3.25, 0.95, -2.65); vase.castShadow = true;
  scene.add(plinth, vase);

  // ---------- works ----------
  const items = [];
  const track = new THREE.MeshStandardMaterial({ color: '#1f1d1b', roughness: 0.5, metalness: 0.4 });
  async function hang(work) {
    const place = PLACES[work.id];
    const tex = await loadReliefTexture(work.id);
    const relief = createRelief(work, tex, { segments: mobile ? 192 : 320, steps: mobile ? 24 : 40 });
    relief.position.set(...place.pos); relief.rotation.y = place.rotY;
    scene.add(relief);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), place.rotY);
    const center = new THREE.Vector3(...place.pos);

    // ceiling track light aimed at the work
    const spotPos = center.clone().addScaledVector(normal, 1.35).setY(ROOM.h - 0.18);
    const spot = new THREE.SpotLight('#fff0dc', 0, 0, 0.5, 0.75, 2);
    spot.position.copy(spotPos); spot.target.position.copy(center);
    spot.castShadow = true;
    spot.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02; spot.shadow.radius = 6;
    spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 6;
    scene.add(spot, spot.target);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.14, 24), track);
    can.position.copy(spotPos); can.lookAt(center); can.rotateX(Math.PI / 2);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), track);
    stem.position.copy(spotPos).setY(ROOM.h - 0.06);
    scene.add(can, stem);

    // wall label
    const [OW] = outerSize(work);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ map: labelTexture(work), roughness: 0.9 }));
    label.position.copy(center).addScaledVector(normal, 0.004).setY(1.3);
    label.rotation.y = place.rotY;
    label.translateX(OW / 2 + 0.24);
    scene.add(label);

    const item = { work, relief, spot, spotPos, center, normal, intensity: 6, intensityTarget: 6 };
    relief.userData.setLightWorld(spotPos);
    items.push(item);
  }

  // ---------- guided walk: the visitor steps from stop to stop and never has to steer ----------
  // stop 0 is the entrance view, then the works in the order you meet them around the room
  const ORDER = ['drift', 'tree', 'feather', 'strata'];
  const ENTRANCE = { pos: new THREE.Vector3(1.6, EYE, 1.75), yaw: 0.46, pitch: -0.02 };
  const state = { pos: new THREE.Vector3(2.9, EYE, 2.6), yaw: 0.5, pitch: -0.03, stop: -1, focus: null, move: null };
  let stops = [];
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function workPose(it) {
    const [OW, OH] = outerSize(it.work);
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const portrait = camera.aspect < 1;
    // phones: the work must fit in the top half, above the card
    const dist = (portrait ? Math.max(OH / 0.38, OW / camera.aspect / 0.78) : Math.max(OH, OW / camera.aspect) / 0.62) / (2 * Math.tan(vfov / 2));
    const pos = it.center.clone().addScaledVector(it.normal, dist).setY(it.center.y);
    const half = dist * Math.tan(vfov / 2);
    if (camera.aspect > 1.25) {   // leave room for the card on the left
      const side = new THREE.Vector3().crossVectors(it.normal, new THREE.Vector3(0, 1, 0));
      pos.addScaledVector(side, half * camera.aspect * 0.18);
    }
    if (portrait) pos.y -= half * 0.24;   // lift the work above the card
    return { pos, yaw: Math.atan2(it.normal.x, it.normal.z), pitch: 0 };
  }

  function goTo(i, quick = false) {
    if (!stops.length) return;
    i = (i + stops.length) % stops.length;
    const it = stops[i];
    const target = it ? workPose(it) : ENTRANCE;
    const from = state.pos.clone(), to = target.pos.clone();
    // bow the path toward the middle of the room, like stepping back and walking over
    const mid = from.clone().lerp(to, 0.5).multiplyScalar(0.55).setY(EYE);
    const far = from.distanceTo(to);
    state.move = {
      curve: new THREE.QuadraticBezierCurve3(from, mid, to), t: 0,
      dur: quick ? 0.5 : THREE.MathUtils.clamp(far * 0.42, 1.1, 2.6),
      yaw0: state.yaw, dyaw: Math.atan2(Math.sin(target.yaw - state.yaw), Math.cos(target.yaw - state.yaw)),
      pitch0: state.pitch, pitch1: target.pitch,
    };
    const changed = state.stop !== i;
    state.stop = i; state.focus = it;
    if (it && changed) {
      hand.pos.copy(it.spotPos);
      hand.last = -1e9;
    }
    if (changed) onStop?.({ index: i, count: stops.length - 1, work: it?.work ?? null });
  }
  const next = () => goTo(state.stop + 1), prev = () => goTo(state.stop - 1);
  const focus = id => { const i = stops.findIndex(s => s?.work.id === id); if (i > 0) goTo(i); };

  addEventListener('keydown', e => {
    if (!running || e.target.closest('input,textarea')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'Escape') goTo(0);
  });
  let wheelAcc = 0, wheelLock = 0;
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 60) { wheelAcc > 0 ? next() : prev(); wheelAcc = 0; wheelLock = performance.now() + 1200; }
  }, { passive: false });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const setNdc = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const pickWork = e => {
    setNdc(e);
    const hit = ray.intersectObjects(items.flatMap(i => [i.relief.userData.caster, i.relief.userData.face]), false)[0];
    return hit?.object.userData.workId;
  };

  // the hand light: hover with a mouse, drag with a finger
  const hand = { pos: new THREE.Vector3(), target: new THREE.Vector3(), last: -1e9 };
  const handPlane = new THREE.Plane(), hp = new THREE.Vector3();
  function handLight(e) {
    const it = state.focus; if (!it) return;
    setNdc(e);
    handPlane.setFromNormalAndCoplanarPoint(it.normal, it.center.clone().addScaledVector(it.normal, 0.28));
    if (ray.ray.intersectPlane(handPlane, hp)) { hand.target.copy(hp); hand.last = performance.now(); onLight?.(); }
  }
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    if (state.focus) handLight(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (state.focus && (e.pointerType === 'mouse' || down)) { handLight(e); canvas.style.cursor = 'none'; return; }
    canvas.style.cursor = !state.focus && pickWork(e) ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || state.focus) return;
    const id = pickWork(e);   // at the entrance: tap a work to walk to it
    if (id) focus(id); else next();
  });

  // ---------- loop ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 72 : 58;
    camera.updateProjectionMatrix();
    if (state.focus && !state.move) goTo(state.stop, true);
  }
  new ResizeObserver(resize).observe(container);

  let running = false, ambient = 1;
  const clock = new THREE.Clock(), tmp = new THREE.Vector3();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const mv = state.move;
    if (mv) {
      mv.t = Math.min(1, mv.t + dt / mv.dur);
      const k = ease(mv.t);
      state.pos.copy(mv.curve.getPoint(k));
      state.yaw = mv.yaw0 + mv.dyaw * k;
      state.pitch = mv.pitch0 + (mv.pitch1 - mv.pitch0) * k;
      if (mv.t >= 1) state.move = null;
    }
    camera.position.copy(state.pos);
    camera.position.y += Math.sin(t * 0.9) * 0.004;   // breathing
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');

    // lights: the room dims while you hold the light to a work
    ambient += ((state.focus ? 0.4 : 1) - ambient) * 0.05;
    scene.environmentIntensity = 0.55 * ambient;
    skyLight.intensity = 2.6 * ambient;
    for (const it of items) {
      const u = it.relief.userData.uniforms;
      const focused = state.focus === it;
      if (focused) {
        if (performance.now() - hand.last > 3500) {   // idle: let the light drift across the work
          const [W, H] = it.relief.userData.size, a = t * 0.32;
          tmp.set(Math.cos(a) * W * 0.78, Math.sin(a * 1.3) * H * 0.35 + H * 0.12, 0.28);
          hand.target.copy(it.relief.localToWorld(tmp));
        }
        hand.pos.lerp(hand.target, 0.12);
        it.relief.userData.setLightWorld(hand.pos);
        it.spot.position.copy(hand.pos);
        it.intensityTarget = 0.32;
      } else {
        it.spot.position.lerp(it.spotPos, 0.08);
        it.relief.userData.setLightWorld(it.spot.position);
        it.intensityTarget = 6;
      }
      it.intensity += (it.intensityTarget - it.intensity) * 0.08;
      u.uIntensity.value = it.intensity;
      u.uAmbient.value = 0.3 * (0.45 + 0.55 * ambient);
      it.spot.intensity = it.intensity * SPOT_PER_RELIEF;
      it.spot.angle = focused ? 1.1 : 0.5;
      it.relief.userData.update(camera, t);
    }
    renderer.render(scene, camera);
  }

  const ready = Promise.all(WORKS.map(hang)).then(() => {
    stops = [null, ...ORDER.map(id => items.find(i => i.work.id === id)).filter(Boolean)];
    goTo(0);
  });
  return {
    ready, canvas, next, prev, goTo, focus,
    blur: () => goTo(0),
    start() { if (!running) { running = true; resize(); clock.getDelta(); renderer.setAnimationLoop(tick); } },
    stop() { running = false; renderer.setAnimationLoop(null); },
  };
}
