import { WORKS, byId, fmtPrice, fmtSize } from './works.js';

// PLACEHOLDER: where purchase requests and commission enquiries go, until Mariëtte gives her address
const CONTACT_EMAIL = 'hello@example.com';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const body = document.body;

// ---------- collection (cart) ----------
const store = {
  get() { try { return JSON.parse(localStorage.getItem('mariette-collection') || '[]'); } catch { return []; } },
  set(ids) { try { localStorage.setItem('mariette-collection', JSON.stringify(ids)); } catch {} },
};
let bag = store.get().filter(byId);
const drawer = $('.drawer'), scrim = $('.scrim');

function renderBag() {
  const n = $('.bag-n'); n.textContent = bag.length;
  n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump');
  drawer.classList.toggle('empty', !bag.length);
  $('.bag-list').innerHTML = bag.map(id => {
    const w = byId(id);
    return `<li><img src="art/${w.id}/thumb.jpg" alt="" class="${w.shape}">
      <div><h4>${w.title}</h4><p>${fmtSize(w)}</p><p>${fmtPrice(w.price)}</p></div>
      <button class="link" data-remove="${w.id}" type="button">Remove</button></li>`;
  }).join('');
  $('.bag-sum').textContent = fmtPrice(bag.reduce((s, id) => s + byId(id).price, 0));
  $$('.w-add, .room-add').forEach(b => {
    const id = b.dataset.id; if (!id) return;
    b.textContent = bag.includes(id) ? 'In your collection ✓' : 'Add to collection';
  });
}
function addToBag(work) {
  if (!bag.includes(work.id)) { bag.push(work.id); store.set(bag); }
  renderBag(); openBag();
}
function openBag() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false; }
function closeBag() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.hidden = true; }
$('.bag').addEventListener('click', openBag);
$('.drawer-close').addEventListener('click', closeBag);
scrim.addEventListener('click', () => { closeBag(); $('.compose').hidden = true; });
$('.bag-list').addEventListener('click', e => {
  const id = e.target.dataset.remove; if (!id) return;
  bag = bag.filter(x => x !== id); store.set(bag); renderBag();
});
// email links do not open everywhere, so the message is shown ready to copy, with the address beside it
function showMessage(subject, text) {
  const box = $('.compose');
  $('.compose-to', box).textContent = CONTACT_EMAIL;
  $('.compose-text', box).value = text;
  $('.compose-mail', box).href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  box.hidden = false; scrim.hidden = false;
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Select and copy'; }
  setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
}
$$('.compose [data-copy]').forEach(b => { b.dataset.label = b.textContent; b.addEventListener('click', () => {
  const src = b.dataset.copy === 'to' ? $('.compose-to').textContent : $('.compose-text').value;
  if (b.dataset.copy === 'text') $('.compose-text').select();
  copy(src, b);
}); });
$('.compose-close').addEventListener('click', () => { $('.compose').hidden = true; if (!drawer.classList.contains('open')) scrim.hidden = true; });
$('.enquire').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const lines = bag.map(id => { const w = byId(id); return `• ${w.title} (${fmtSize(w)}), ${fmtPrice(w.price)}`; });
  const text = `Hi Mariëtte,\n\nI'd like to buy:\n${lines.join('\n')}\n\n${f.get('msg') || ''}\n\n${f.get('name')}\n${f.get('email')}`.replace(/\n{3,}/g, '\n\n');
  closeBag();
  showMessage('Purchase request: ' + bag.map(id => byId(id).title).join(', '), text);
});
$('.studio-ask').addEventListener('click', () => {
  showMessage('Commission enquiry', `Hi Mariëtte,\n\nI'd love to talk about a commission.\n\nSize:\nWhere it will hang:\nIdeas:\n\n`);
});

// ---------- catalogue ----------
$('#v-works .grid').innerHTML = WORKS.map(w => `
  <a class="card" href="#/work/${w.id}">
    <div class="pic"><img src="art/${w.id}/insitu.jpg" alt="${w.title} in a room" loading="lazy">
      <img class="flat ${w.shape}" src="art/${w.id}/thumb.jpg" alt="" loading="lazy"></div>
    <h3>${w.title}</h3>
    <p><span>${fmtSize(w)}</span><span>${fmtPrice(w.price)}</span></p>
  </a>`).join('');

// ---------- lazily created 3D parts ----------
let gallery = null, viewer = null, room = null;

async function getGallery() {
  if (gallery) return gallery;
  const { createGallery } = await import('./gallery.js');
  const card = $('.g-card'), hint = $('.g-hint'), view = $('#v-gallery');
  let lit = false;
  gallery = createGallery($('.g-stage'), {
    onStop({ index, count, work }) {
      view.classList.toggle('at-entrance', !work);
      card.hidden = false;
      card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
      if (work) {
        $('.g-eyebrow').textContent = `${String(index).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
        $('.g-title').textContent = work.title;
        $('.g-meta').textContent = `${fmtSize(work)} · ${fmtPrice(work.price)}`;
        $('.g-view').href = `#/work/${work.id}`;
        $('.g-room').href = `#/room/${work.id}`;
        hint.hidden = lit;
      } else {
        $('.g-eyebrow').textContent = 'Welcome';
        $('.g-title').textContent = "Mariëtte's Art Gallery";
        $('.g-meta').textContent = `${count} plaster reliefs. Walk from work to work and hold the light to each one.`;
        hint.hidden = true;
      }
      $('.g-dots').innerHTML = Array.from({ length: count }, (_, i) =>
        `<button type="button" data-stop="${i + 1}" aria-label="Work ${i + 1}" aria-current="${i + 1 === index}"></button>`).join('');
    },
    onLight() { if (!lit) { lit = true; hint.hidden = true; } },
  });
  $$('#v-gallery .prev').forEach(b => b.addEventListener('click', () => gallery.prev()));
  $$('#v-gallery .next').forEach(b => b.addEventListener('click', () => gallery.next()));
  $('.g-dots').addEventListener('click', e => { const s = e.target.dataset.stop; if (s) gallery.goTo(+s); });
  await document.fonts.ready;
  gallery.ready.then(() => setTimeout(() => $('.veil').classList.add('gone'), 300));
  return gallery;
}

async function getViewer() {
  if (viewer) return viewer;
  const { createViewer } = await import('./viewer.js');
  viewer = createViewer($('.w-stage'));
  $$('#v-work .chips button').forEach(b => b.addEventListener('click', () => {
    viewer.setMode(b.dataset.mode);
    $$('#v-work .chips button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
  }));
  $('#v-work .rake input').addEventListener('input', e => viewer.setRake(+e.target.value));
  $('.w-stage').addEventListener('lightmove', () => $('.w-hint').classList.add('gone'));
  return viewer;
}

async function getRoom() {
  if (room) return room;
  const { createRoomTool } = await import('./room.js');
  room = createRoomTool($('#v-room'), { works: WORKS, onAdd: addToBag });
  return room;
}

function fillWork(w) {
  const i = WORKS.indexOf(w);
  $('.w-no').textContent = `Work ${String(i + 1).padStart(2, '0')} / ${String(WORKS.length).padStart(2, '0')}`;
  $('.w-title').textContent = w.title;
  $('.w-medium').textContent = w.medium;
  $('.w-price').textContent = fmtPrice(w.price);
  $('.w-note').textContent = w.note;
  $('.w-facts').innerHTML = `<dt>Size</dt><dd>${fmtSize(w)}</dd><dt>Year</dt><dd>${w.year}</dd>
    <dt>Edition</dt><dd>One of a kind</dd><dt>Delivery</dt><dd>Arranged with you after purchase</dd>`;
  $('.w-insitu img').src = `art/${w.id}/insitu.jpg`;
  $('.w-insitu img').alt = `${w.title} in a room`;
  $('.w-room').href = `#/room/${w.id}`;
  $('.w-add').dataset.id = w.id;
  const prev = WORKS[(i + WORKS.length - 1) % WORKS.length], next = WORKS[(i + 1) % WORKS.length];
  $('.w-next').innerHTML = `<a href="#/work/${prev.id}"><small>Previous</small>${prev.title}</a><a href="#/work/${next.id}"><small>Next</small>${next.title}</a>`;
  $('#v-work [data-mode="glow"]').hidden = !w.glow;
  if (!w.glow && $('#v-work [data-mode="glow"]').getAttribute('aria-pressed') === 'true') $('#v-work [data-mode="hand"]').click();
}
$('.w-add').addEventListener('click', e => addToBag(byId(e.currentTarget.dataset.id)));
$('.w-walk').addEventListener('click', () => { walkTarget = $('.w-add').dataset.id; go('#/'); });
let walkTarget = null;

// ---------- router ----------
// in-page router: works with '#/work/tree' locally and with plain '#works' style anchors in a shared link
let current = location.hash;
function go(h) {
  if (h === current) return;
  current = h;
  try { history.pushState(null, '', h); } catch {}
  route();
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
addEventListener('popstate', () => { current = location.hash; route(); });
addEventListener('hashchange', () => { if (location.hash !== current) { current = location.hash; route(); } });

async function route() {
  let [view = '', id] = current.replace(/^#\/?/, '').split('/');
  if (!id && view.includes('-')) [view, id] = view.split('-');
  const name = { '': 'gallery', works: 'works', work: 'work', room: 'room', studio: 'studio' }[view] ?? 'gallery';
  body.dataset.view = name;
  $$('.nav a, .sheet a').forEach(a => a.toggleAttribute('aria-current', a.dataset.route === (name === 'work' ? 'works' : name)));
  $$('.nav a, .sheet a').forEach(a => a.getAttribute('aria-current') !== null && a.setAttribute('aria-current', 'page'));
  closeMenu();
  if (name !== 'gallery') gallery?.stop();
  if (name !== 'work') viewer?.stop();
  scrollTo(0, 0);

  if (name === 'gallery') {
    const g = await getGallery();
    if (body.dataset.view !== 'gallery') return;
    g.start();
    if (walkTarget) { const t = walkTarget; walkTarget = null; g.ready.then(() => g.focus(t)); }
  } else if (name === 'work') {
    const w = byId(id) ?? WORKS[0];
    fillWork(w);
    renderBag();
    const v = await getViewer();
    if (body.dataset.view !== 'work') return;
    await v.show(w);
    v.start();
  } else if (name === 'room') {
    const r = await getRoom();
    $('.room-add').dataset.id = id || WORKS[0].id;
    await r.open(id);
    renderBag();
  }
  document.title = name === 'work' ? `${byId(id)?.title ?? 'Work'} · Mariëtte's Art Gallery` : "Mariëtte's Art Gallery";
}

// room "add" button follows the work picked in the tool
document.addEventListener('click', e => {
  const b = e.target.closest('.room-works button');
  if (b) { $('.room-add').dataset.id = b.dataset.id; renderBag(); }
});

// ---------- mobile menu ----------
const menuBtn = $('.menu'), sheet = $('.sheet');
function closeMenu() { sheet.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const open = sheet.hidden; sheet.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
});

renderBag();
route();
