// "In your room": place a work on a photo of the visitor's own wall, at true scale, in their light.
import * as THREE from 'three';
import { createRelief, loadReliefTexture, outerSize, shapeGLSL, STANDOFF, RELIEF } from './relief.js';
import { makeOakTexture, wallMaterial, oakMaterial } from './gallery.js';

const PLASTER = new THREE.Color('#efe9df').convertSRGBToLinear();

// wall shadow + LED glow as one transparent layer: rgb is added light, alpha is how much of the photo it darkens
const shadowFrag = /* glsl */`
  uniform vec3 uLight; uniform vec2 uOuter; uniform float uCircle, uStrength, uGlow;
  varying vec2 vXY;
  ${shapeGLSL}
  void main() {
    float panelZ = ${(STANDOFF + RELIEF * 0.4).toFixed(4)};
    vec3 P = vec3(vXY, 0.0);
    vec3 Lv = uLight - P;
    float sh = 1.0;
    if (uLight.z > panelZ) {
      vec3 Q = P + Lv * (panelZ / uLight.z);
      float pen = 0.07 * panelZ / max(uLight.z - panelZ, 0.01) + 0.002;
      sh = smoothstep(-pen, pen, sdShape(Q.xy, uOuter, uCircle));
    }
    float rim = max(sdShape(P.xy, uOuter, uCircle), 0.0);
    float dark = (1.0 - sh) * 0.5 * uStrength + 0.22 * exp(-rim / 0.03);
    vec3 glow = vec3(1.0, 0.66, 0.36) * uGlow * (0.75 * exp(-rim / 0.06) + 0.12 * exp(-rim / 0.3));
    gl_FragColor = vec4(glow, clamp(dark * (1.0 - uGlow * 0.8), 0.0, 0.85));
  }`;

export function renderSampleRoom(w = 1600, h = 1066) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setSize(w, h, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 30);
  const D = 3.6;
  cam.position.set(0, 1.45, D); cam.lookAt(0, 1.45, 0);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), wallMaterial()); wall.position.y = 3; wall.receiveShadow = true;
  const floorTex = makeOakTexture(); floorTex.repeat.set(3, 1.5); floorTex.rotation = Math.PI / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 3; floor.receiveShadow = true;
  const oak = oakMaterial();
  const board = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.42), oak); body.position.y = 0.38; board.add(body);
  for (const x of [-0.92, 0.92]) for (const z of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.13, 12), new THREE.MeshStandardMaterial({ color: '#2a2622' }));
    leg.position.set(x, 0.065, z); board.add(leg);
  }
  for (let i = 0; i < 4; i++) {   // slatted doors
    const gap = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.44, 0.005), new THREE.MeshStandardMaterial({ color: '#7a6248' }));
    gap.position.set(-0.75 + i * 0.5, 0.38, 0.211); board.add(gap);
  }
  board.position.z = 0.25;
  board.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  const prof = [[0, 0], [0.07, 0], [0.1, 0.05], [0.11, 0.15], [0.08, 0.25], [0.04, 0.3], [0.045, 0.33]].map(([x, y]) => new THREE.Vector2(x, y));
  const vase = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({ color: '#cbbda9', roughness: 0.85 }));
  vase.position.set(0.62, 0.63, 0.25); vase.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#6d5845', roughness: 0.7, side: THREE.DoubleSide }));
  bowl.scale.y = 0.4; bowl.position.set(-0.55, 0.69, 0.25); bowl.castShadow = true;
  const sun = new THREE.DirectionalLight('#fff1de', 2.4); sun.position.set(-3, 3.2, 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -1; sun.shadow.radius = 8;
  scene.add(wall, floor, board, vase, bowl, sun, new THREE.HemisphereLight('#f6f1ea', '#b9a58a', 1.1));
  r.render(scene, cam);
  const url = canvas.toDataURL('image/jpeg', 0.92);
  r.dispose(); r.forceContextLoss();
  const visibleH = 2 * D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  return { url, pxPerMeter: h / visibleH, light: { x: 0.12, y: 0.12 } };   // light handle as a fraction of the image (top left)
}

export function createRoomTool(root, { works, onAdd }) {
  const $ = s => root.querySelector(s);
  const stage = $('.room-stage'), frame = $('.room-frame'), img = $('.room-photo'), sunEl = $('.room-sun'), svg = $('.room-measure');
  const mobile = matchMedia('(pointer: coarse)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'room-gl';
  frame.insertBefore(canvas, sunEl);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 2000);
  camera.position.z = 1000;

  const shadowU = {
    uLight: { value: new THREE.Vector3() }, uOuter: { value: new THREE.Vector2(1, 1) },
    uCircle: { value: 0 }, uStrength: { value: 1 }, uGlow: { value: 0 },
  };
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: shadowU, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `varying vec2 vXY; void main() { vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: shadowFrag,
  }));

  const st = {
    work: works[0], relief: null, holder: new THREE.Group(),
    pxPerMeter: 300,       // stage pixels per metre on the wall
    photoPxPerMeter: null, // natural-image pixels per metre, once known
    at: { x: 0.5, y: 0.42 },      // work centre as a fraction of the photo
    sun: { x: 0.12, y: 0.12 },    // light handle, fraction of the photo
    rake: 0.45, glow: false,
    tint: new THREE.Color(1, 1, 1), exposure: 1, ambient: 0.32,
    natural: { w: 1600, h: 1066 }, ready: false,
  };
  scene.add(st.holder);
  st.holder.add(shadow);

  // ---------- photo ----------
  function analysePhoto() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; r /= n * 255; gg /= n * 255; b /= n * 255;
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const m = Math.max(r, gg, b);
    st.tint.setRGB(0.55 + 0.45 * r / m, 0.55 + 0.45 * gg / m, 0.55 + 0.45 * b / m).convertSRGBToLinear();
    st.exposure = THREE.MathUtils.clamp(lum / 0.6, 0.5, 1.12);
    st.ambient = THREE.MathUtils.clamp(0.18 + lum * 0.3, 0.2, 0.42);
  }

  function setPhoto(url, { pxPerMeter = null, light = null } = {}) {
    return new Promise(res => {
      img.onload = () => {
        st.natural = { w: img.naturalWidth, h: img.naturalHeight };
        analysePhoto();
        // without a measurement assume the photo shows about 3.2 m of wall across
        st.photoPxPerMeter = pxPerMeter ?? st.natural.w / 3.2;
        if (light) st.sun = { ...light };
        st.at = { x: 0.5, y: pxPerMeter ? 0.36 : 0.42 };
        root.classList.add('has-photo');
        st.ready = true;
        layout(); res();
      };
      img.src = url;
    });
  }

  // ---------- layout: fit the photo inside the stage ----------
  function layout() {
    if (!st.ready) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const k = Math.min(sw / st.natural.w, sh / st.natural.h);
    const w = Math.round(st.natural.w * k), h = Math.round(st.natural.h * k);
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    camera.right = w; camera.top = h; camera.updateProjectionMatrix();
    st.pxPerMeter = st.photoPxPerMeter * k;
    st.size = { w, h, k };
    place();
  }
  new ResizeObserver(layout).observe(stage);

  function place() {
    if (!st.relief || !st.size) return;
    const { w, h } = st.size, s = st.pxPerMeter;
    st.holder.position.set(st.at.x * w, (1 - st.at.y) * h, 0);
    st.holder.scale.setScalar(s);
    sunEl.style.left = st.sun.x * w + 'px'; sunEl.style.top = st.sun.y * h + 'px';
    render();
  }

  function render() {
    if (!st.relief || !st.size) return;
    const { w, h } = st.size, s = st.pxPerMeter;
    // the light handle sits in the photo; the lamp is in front of the wall at a height set by the angle slider
    const lx = (st.sun.x - st.at.x) * w / s, ly = ((1 - st.sun.y) - (1 - st.at.y)) * h / s;
    const lz = THREE.MathUtils.lerp(2.2, 0.35, st.rake);
    const L = new THREE.Vector3(lx, ly, lz);
    const u = st.relief.userData.uniforms;
    st.relief.userData.setLightLocal(L);
    u.uIntensity.value = L.lengthSq() * 0.95 * st.exposure * (st.glow ? 0.35 : 1);
    u.uAmbient.value = st.ambient * st.exposure;
    u.uGlow.value = st.glow ? 1 : 0;
    u.uPlaster.value.copy(PLASTER).multiply(st.tint);
    shadowU.uLight.value.copy(L);
    shadowU.uStrength.value = st.glow ? 0.35 : 1;
    shadowU.uGlow.value = st.glow ? 1 : 0;
    st.relief.userData.update(camera, 0);
    renderer.render(scene, camera);
  }

  async function setWork(work) {
    st.work = work;
    root.querySelectorAll('.room-works button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === work.id)));
    $('.room-glow').hidden = !work.glow;
    if (!work.glow) { st.glow = false; $('.room-glow input').checked = false; }
    $('.room-size').textContent = work.shape === 'circle' ? `Ø ${work.size[0]} cm` : `${work.size[0]} × ${work.size[1]} cm`;
    const tex = await loadReliefTexture(work.id);
    if (st.work !== work) return;
    if (st.relief) { st.holder.remove(st.relief); st.relief.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    st.relief = createRelief(work, tex, { segments: 256, steps: 48 });
    st.relief.userData.uniforms.uPlaster.value = PLASTER.clone();
    const [OW, OH] = outerSize(work);
    shadow.geometry.dispose();
    shadow.geometry = new THREE.PlaneGeometry(OW * 3.2, OH * 3.2);   // in metres, like the relief
    shadow.position.z = -0.001;
    shadowU.uOuter.value.set(OW, OH);
    shadowU.uCircle.value = work.shape === 'circle' ? 1 : 0;
    st.holder.add(st.relief);
    place();
  }

  // ---------- interaction ----------
  let drag = null;
  const frac = e => { const r = frame.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  frame.addEventListener('pointerdown', e => {
    if (!st.ready) return;
    const p = frac(e);
    frame.setPointerCapture(e.pointerId);
    if (root.classList.contains('measuring')) { drag = { kind: 'measure', a: p, b: p }; drawMeasure(drag); return; }
    if (e.target === sunEl || sunEl.contains(e.target)) { drag = { kind: 'sun' }; return; }
    drag = { kind: 'art', dx: st.at.x - p.x, dy: st.at.y - p.y };
  });
  frame.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = frac(e);
    if (drag.kind === 'sun') st.sun = { x: THREE.MathUtils.clamp(p.x, 0, 1), y: THREE.MathUtils.clamp(p.y, 0, 1) };
    else if (drag.kind === 'art') st.at = { x: p.x + drag.dx, y: p.y + drag.dy };
    else { drag.b = p; drawMeasure(drag); return; }
    place();
  });
  frame.addEventListener('pointerup', () => {
    if (drag?.kind === 'measure') {
      const { w, h } = st.size;
      const px = Math.hypot((drag.b.x - drag.a.x) * w, (drag.b.y - drag.a.y) * h);
      if (px > 12) { st.measurePx = px / st.size.k; root.classList.add('measured'); $('.room-cm').focus(); }
    }
    drag = null;
  });
  function drawMeasure(d) {
    const { w, h } = st.size;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<line x1="${d.a.x * w}" y1="${d.a.y * h}" x2="${d.b.x * w}" y2="${d.b.y * h}" />
      <circle cx="${d.a.x * w}" cy="${d.a.y * h}" r="4" /><circle cx="${d.b.x * w}" cy="${d.b.y * h}" r="4" />`;
  }

  $('.room-upload input').addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return;
    setPhoto(URL.createObjectURL(f));
    e.target.value = '';
  });
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', e => {
    e.preventDefault(); stage.classList.remove('drop');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) setPhoto(URL.createObjectURL(f));
  });
  let sample = null;
  $('.room-sample').addEventListener('click', () => { sample ??= renderSampleRoom(); setPhoto(sample.url, sample); });

  $('.room-measure-btn').addEventListener('click', () => {
    root.classList.toggle('measuring');
    root.classList.remove('measured');
    svg.innerHTML = '';
  });
  $('.room-apply').addEventListener('click', () => {
    const cm = parseFloat($('.room-cm').value);
    if (!(cm > 0) || !st.measurePx) return;
    st.photoPxPerMeter = st.measurePx / (cm / 100);
    root.classList.remove('measuring', 'measured');
    svg.innerHTML = '';
    layout();
  });
  $('.room-rake').addEventListener('input', e => { st.rake = +e.target.value; render(); });
  $('.room-glow input').addEventListener('change', e => { st.glow = e.target.checked; render(); });
  $('.room-add').addEventListener('click', () => onAdd?.(st.work));
  $('.room-saved button').addEventListener('click', () => { $('.room-saved').hidden = true; });

  $('.room-save').addEventListener('click', () => {
    // re-render the overlay at the photo's own resolution and composite
    const { w: nw, h: nh } = st.natural;
    const scale = Math.min(1, 2400 / Math.max(nw, nh));
    const W = Math.round(nw * scale), H = Math.round(nh * scale);
    const keep = { ...st.size, pr: renderer.getPixelRatio() };
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    camera.right = W; camera.top = H; camera.updateProjectionMatrix();
    st.size = { w: W, h: H, k: scale }; st.pxPerMeter = st.photoPxPerMeter * scale;
    place();
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const g = out.getContext('2d');
    g.drawImage(img, 0, 0, W, H); g.drawImage(canvas, 0, 0, W, H);
    renderer.setPixelRatio(keep.pr);
    layout();
    // show the picture to save (a script-started download is blocked in some viewers)
    out.toBlob(b => {
      const box = root.querySelector('.room-saved');
      box.querySelector('img').src = URL.createObjectURL(b);
      box.hidden = false;
    }, 'image/jpeg', 0.92);
  });

  // works picker
  const list = $('.room-works');
  list.innerHTML = works.map(w => `<button data-id="${w.id}" aria-pressed="false" title="${w.title}">
    <img src="art/${w.id}/thumb.jpg" alt="${w.title}" class="${w.shape}"><span>${w.title}</span></button>`).join('');
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setWork(works.find(w => w.id === b.dataset.id)); });

  return {
    async open(workId) {
      const w = works.find(x => x.id === workId) ?? st.work;
      await setWork(w);
      if (!st.ready) { sample ??= renderSampleRoom(); await setPhoto(sample.url, sample); }
      else layout();
    },
  };
}
