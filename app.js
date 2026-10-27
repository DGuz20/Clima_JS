const $ = s => document.querySelector(s);
const API = 'https://api.openweathermap.org/data/2.5';
const cfgKey = () => { const k = window.CONFIG?.API_KEY || ''; return k && !k.startsWith('TU_') ? k : ''; };
let KEY = cfgKey() || localStorage.getItem('owm_key') || '';
const S = { units: localStorage.getItem('units') || 'metric', last: null, data: null };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Red: peticiones asíncronas + JSON ---------- */
async function api(path, params) {
  const q = new URLSearchParams({ ...params, appid: KEY, units: S.units, lang: 'es' });
  let r;
  try { r = await fetch(`${API}/${path}?${q}`); }
  catch { throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error({
    401: 'API key inválida o aún no activada. Las keys nuevas pueden tardar hasta 2 horas.',
    404: 'No encontré esa ciudad. Prueba con "Ciudad, País" (ej. Madrid, ES).',
    429: 'Demasiadas peticiones. Espera un minuto e inténtalo otra vez.'
  }[r.status] || d.message || 'Error inesperado. Inténtalo de nuevo.');
  return d;
}

async function load(params) {
  if (!KEY) return openDlg();
  const { label, ...p } = params;
  setLoading();
  try {
    const [w, f] = await Promise.all([api('weather', p), api('forecast', p)]);
    S.last = params; S.label = label || null;
    localStorage.setItem('last', JSON.stringify(params));
    saveRecent(`${S.label?.name || w.name}${(S.label?.country || w.sys?.country) ? ', ' + (S.label?.country || w.sys.country) : ''}`);
    hideMsg(); render(w, f);
  } catch (e) {
    showMsg(e.message);
    S.data ? render(S.data.w, S.data.f) : welcome();
  }
}

/* ---------- Geolocalización ---------- */
$('#geo').onclick = () => {
  if (!navigator.geolocation) return showMsg('Tu navegador no soporta geolocalización.');
  const b = $('#geo'); b.classList.add('busy'); b.textContent = 'Localizando…';
  const done = () => { b.classList.remove('busy'); b.textContent = 'Mi ubicación'; };
  navigator.geolocation.getCurrentPosition(
    p => { done(); load({ lat: p.coords.latitude, lon: p.coords.longitude }); },
    e => { done(); showMsg({1:'Permiso de ubicación denegado. Actívalo en tu navegador o busca una ciudad.',2:'No se pudo determinar tu ubicación.',3:'Se agotó el tiempo al buscar tu ubicación.'}[e.code] || 'Error de geolocalización.'); },
    { timeout: 10000, maximumAge: 300000 }
  );
};

/* ---------- Render ---------- */
function render(w, f) {
  S.data = { w, f };
  const u = S.units, tz = w.timezone, tu = u === 'metric' ? '°C' : '°F';
  const lt = t => new Date((t + tz) * 1000);
  const hm = t => lt(t).toLocaleTimeString('es', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
  const icon = c => `https://openweathermap.org/img/wn/${c}@2x.png`;
  const wx = w.weather[0];
  const wind = Math.round(u === 'metric' ? w.wind.speed * 3.6 : w.wind.speed) + (u === 'metric' ? ' km/h' : ' mph');
  const vis = w.visibility == null ? '—' : u === 'metric' ? (w.visibility / 1000).toFixed(1) + ' km' : (w.visibility / 1609).toFixed(1) + ' mi';
  const date = cap(lt(w.dt).toLocaleDateString('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }));

  const details = [
    ['Sensación', Math.round(w.main.feels_like) + tu], ['Humedad', w.main.humidity + '%'],
    ['Viento', wind], ['Presión', w.main.pressure + ' hPa'],
    ['Visibilidad', vis], ['Nubosidad', w.clouds.all + '%'],
    ['Amanecer', hm(w.sys.sunrise)], ['Atardecer', hm(w.sys.sunset)]
  ].map(([k, v], i) => `<div class="det" style="--i:${i}"><span>${k}</span><b>${v}</b></div>`).join('');

  const H = f.list.slice(0, 16), W = 88;
  const tp = H.map(i => i.main.temp), tmin = Math.min(...tp), tspan = (Math.max(...tp) - tmin) || 1;
  const pts = tp.map((t, i) => [i * W + W / 2, 78 - (t - tmin) / tspan * 56]);
  const ln = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const chart = `<svg class="chart" width="${H.length * W}" height="96" viewBox="0 0 ${H.length * W} 96" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${ln}L${pts.at(-1)[0]} 96L${pts[0][0]} 96Z" fill="url(#g)"/><path class="ln" d="${ln}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="currentColor"/>`).join('')}</svg>`;
  const cards = H.map((i, n) => {
    const d = lt(i.dt), nd = n === 0 || d.getUTCHours() < 3;
    const sp = Math.round(u === 'metric' ? i.wind.speed * 3.6 : i.wind.speed) + (u === 'metric' ? ' km/h' : ' mph');
    return `<div class="hr${nd ? ' nd' : ''}" style="--i:${n}"><em>${nd ? (n === 0 ? 'Hoy' : cap(d.toLocaleDateString('es', { timeZone: 'UTC', weekday: 'short' }))) : '&nbsp;'}</em><span>${hm(i.dt)}</span><img src="${icon(i.weather[0].icon)}" alt="${esc(i.weather[0].description)}"><b>${Math.round(i.main.temp)}°</b><small>Lluvia ${Math.round((i.pop || 0) * 100)}%</small><small>${sp}</small><small>Hum. ${i.main.humidity}%</small></div>`;
  }).join('');
  const hours = `<div class="hin" style="width:${H.length * W}px">${chart}<div class="hrs">${cards}</div></div>`;

  const groups = {};
  f.list.forEach(i => (groups[lt(i.dt).toISOString().slice(0, 10)] ??= []).push(i));
  const days = Object.entries(groups).slice(0, 5).map(([d, it]) => {
    const mid = it.reduce((a, b) => Math.abs(lt(b.dt).getUTCHours() - 12) < Math.abs(lt(a.dt).getUTCHours() - 12) ? b : a);
    return { d, min: Math.min(...it.map(i => i.main.temp_min)), max: Math.max(...it.map(i => i.main.temp_max)), ic: mid.weather[0], pop: Math.max(...it.map(i => i.pop || 0)) };
  });
  const lo = Math.min(...days.map(x => x.min)), hi = Math.max(...days.map(x => x.max)), span = (hi - lo) || 1;
  const daily = days.map((x, n) => {
    const name = n === 0 ? 'Hoy' : cap(new Date(x.d + 'T00:00:00Z').toLocaleDateString('es', { timeZone: 'UTC', weekday: 'long' }));
    return `<div class="day" style="--i:${n}"><span class="dn">${name}</span><img src="${icon(x.ic.icon)}" alt=""><small class="dd">${esc(cap(x.ic.description))}</small><span class="mn">${Math.round(x.min)}°</span><div class="bar"><i style="margin-left:${(x.min - lo) / span * 100}%;width:${Math.max(8, (x.max - x.min) / span * 100)}%"></i></div><span class="mx">${Math.round(x.max)}°</span></div>`;
  }).join('');

  $('#view').innerHTML = `
  <section class="hero card">
    <div class="main">
      <p class="place">${esc(S.label?.name || w.name)}<small>${esc(S.label?.country || w.sys?.country || '')}</small></p>
      <p class="when">${date} · ${hm(w.dt)} hora local</p>
      <div class="temp"><span id="t">0</span><sup>${tu}</sup></div>
      <p class="desc"><img src="${icon(wx.icon)}" alt="">${esc(cap(wx.description))}</p>
      <p class="mm">Máx ${Math.round(w.main.temp_max)}° · Mín ${Math.round(w.main.temp_min)}°</p>
    </div>
    <div class="dets">${details}</div>
  </section>
  <section class="card pad"><h2>Próximas 48 horas</h2><div class="hours">${hours}</div></section>
  <section class="card pad"><h2>Próximos 5 días</h2><div class="days">${daily}</div></section>`;

  document.body.dataset.theme = theme(wx);
  fx(document.body.dataset.theme);
  countUp($('#t'), Math.round(w.main.temp));
  document.title = `${Math.round(w.main.temp)}${tu} en ${w.name} · Clima`;
}

function theme(wx) {
  const n = wx.icon.endsWith('n'), m = wx.main;
  if (m === 'Clear') return n ? 'night' : 'sunny';
  if (m === 'Clouds') return 'cloudy';
  if (m === 'Rain' || m === 'Drizzle') return 'rain';
  if (m === 'Thunderstorm') return 'storm';
  if (m === 'Snow') return 'snow';
  return 'mist';
}

function fx(t) {
  const b = $('#fx'); b.innerHTML = '';
  if (!['rain', 'storm', 'snow'].includes(t)) return;
  const snow = t === 'snow';
  for (let i = 0; i < (snow ? 50 : 70); i++) {
    const e = document.createElement('i');
    e.className = snow ? 'flake' : 'drop';
    e.style.cssText = `left:${Math.random() * 100}%;animation-duration:${snow ? 6 + Math.random() * 5 : .6 + Math.random() * .6}s;animation-delay:${-Math.random() * 6}s;opacity:${.25 + Math.random() * .5}`;
    b.append(e);
  }
}

function countUp(el, to) {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return el.textContent = to;
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min((now - t0) / 800, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Estados de la UI ---------- */
function setLoading() {
  $('#view').innerHTML = `<div class="card sk big"></div><div class="card sk mid"></div><div class="card sk mid"></div>`;
}
function welcome() {
  document.body.dataset.theme = 'default'; fx('');
  $('#view').innerHTML = `<section class="card welcome"><h2>¿Cómo está el cielo hoy?</h2><p>Busca una ciudad o usa tu ubicación para ver el clima actual, las próximas horas y el pronóstico de 5 días.</p></section>`;
}
let mt;
function showMsg(t) { const m = $('#msg'); m.textContent = t; m.hidden = false; clearTimeout(mt); mt = setTimeout(hideMsg, 7000); }
function hideMsg() { $('#msg').hidden = true; }

/* ---------- Búsquedas recientes ---------- */
function saveRecent(c) {
  const l = [c, ...JSON.parse(localStorage.getItem('recent') || '[]').filter(x => x !== c)].slice(0, 5);
  localStorage.setItem('recent', JSON.stringify(l)); renderRecent();
}
function renderRecent() {
  const l = JSON.parse(localStorage.getItem('recent') || '[]');
  $('#recent').innerHTML = l.map(c => `<button class="chip" type="button">${esc(c)}</button>`).join('');
}
$('#recent').onclick = e => { const c = e.target.closest('.chip'); if (c) load({ q: c.textContent }); };

/* ---------- Eventos ---------- */
$('#form').onsubmit = e => { e.preventDefault(); hideSug(); const v = $('#q').value.trim(); if (v) load({ q: v }); };
const setUnits = () => $('#units').textContent = S.units === 'metric' ? '°C' : '°F';
$('#units').onclick = () => {
  S.units = S.units === 'metric' ? 'imperial' : 'metric';
  localStorage.setItem('units', S.units); setUnits();
  if (S.last) load(S.last);
};
const dlg = $('#dlg');
function openDlg() { $('#keyIn').value = KEY; dlg.showModal(); }
$('#cfg').onclick = openDlg;
$('#keyCancel').onclick = () => dlg.close();
$('#keySave').onclick = () => {
  KEY = $('#keyIn').value.trim(); localStorage.setItem('owm_key', KEY); dlg.close();
  if (S.last) load(S.last); else if (KEY) { const l = JSON.parse(localStorage.getItem('last') || 'null'); l && load(l); }
};

/* ---------- Inicio ---------- */
setUnits(); renderRecent();
const last = JSON.parse(localStorage.getItem('last') || 'null');
if (!KEY) { welcome(); showMsg('Agrega tu API key de OpenWeatherMap con el botón Key.'); }
else if (last) load(last); else welcome();

/* ---------- Autocompletado (Geocoding API) ---------- */
let st, sIdx = -1, sItems = [];
const sug = $('#sug');
function hideSug() { sug.hidden = true; sIdx = -1; }
$('#q').addEventListener('input', e => {
  clearTimeout(st);
  const v = e.target.value.trim();
  if (v.length < 2 || !KEY) return hideSug();
  st = setTimeout(async () => {
    try {
      const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?${new URLSearchParams({ q: v, limit: 5, appid: KEY })}`);
      if (!r.ok || v !== $('#q').value.trim()) return;
      sItems = await r.json(); sIdx = -1;
      sug.innerHTML = sItems.map((c, i) => `<li role="option" data-i="${i}">${esc(c.name)}<small>${esc([c.state, c.country].filter(Boolean).join(', '))}</small></li>`).join('');
      sug.hidden = !sItems.length;
    } catch { hideSug(); }
  }, 300);
});
const pick = c => { hideSug(); $('#q').value = c.name; load({ lat: c.lat, lon: c.lon, label: { name: c.name, country: c.country } }); };
sug.onmousedown = e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(sItems[li.dataset.i]); } };
$('#q').addEventListener('keydown', e => {
  if (sug.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sItems.length) % sItems.length;
    [...sug.children].forEach((li, i) => li.classList.toggle('on', i === sIdx));
  } else if (e.key === 'Enter' && sIdx >= 0) { e.preventDefault(); pick(sItems[sIdx]); }
  else if (e.key === 'Escape') hideSug();
});
$('#q').addEventListener('blur', () => setTimeout(hideSug, 150));

/* ---------- Modo claro / oscuro ---------- */
function setMode(m) {
  document.body.dataset.mode = m; localStorage.setItem('mode', m);
  $('#mode').textContent = m === 'dark' ? 'Claro' : 'Oscuro';
  document.querySelector('meta[name=theme-color]').content = m === 'dark' ? '#0f172a' : '#e2e8f0';
}
$('#mode').onclick = () => setMode(document.body.dataset.mode === 'dark' ? 'light' : 'dark');
setMode(document.body.dataset.mode);

/* ---------- PWA (instalable y con caché de la app) ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
