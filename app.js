/* ================== 데이터 ================== */
const KEY = 'outfit.v1';
const CATS = [
  {k:'outer',  label:'아우터'},
  {k:'top',    label:'상의'},
  {k:'bottom', label:'하의'},
  {k:'extra',  label:'소품'},
];
const MODE = Object.fromEntries(MODES.map(m => [m.id, m]));
const emptyItems = () => ({outer:[], top:[], bottom:[], extra:[]});
// 여러 나라 기상청 예보 모델 (Open-Meteo 무료 제공). 데이터 없는 모델은 자동으로 빠져요.
const WX_MODELS = ['ecmwf_ifs025','gfs_seamless','icon_seamless','jma_seamless','kma_seamless','metno_seamless',
  'gem_seamless','meteofrance_seamless','ukmo_seamless','cma_grapes_global'];

function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e){}
  if (!s || !Array.isArray(s.records)) s = {records:[]};
  // v1 → v2 이전: 기존 기록은 일상복으로
  s.records.forEach(r => { r.mode ||= 'daily'; });
  if (!s.custom || Array.isArray(s.custom.outer)) s.custom = {daily: s.custom || emptyItems()};
  s.modes = (s.modes || ['daily']).filter(id => MODE[id]); if (!s.modes.length) s.modes = ['daily'];
  if (!MODE[s.mode] || !s.modes.includes(s.mode)) s.mode = s.modes[0];
  s.when ||= {};
  s.stats ??= true;
  s.useDays ||= 0;
  s.pinged ||= {date:'', keys:[]};
  if (s.wx && !s.wx.main) s.wx = null; // 옛 날씨 캐시 형식
  return s;
}
let S = load();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){ toast('저장 공간이 부족해요'); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
const customOf = id => (S.custom[id] ||= emptyItems());

/* ================== 유틸 ================== */
const $ = s => document.querySelector(s);
const ymd = d => { const z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const todayStr = () => ymd(new Date());
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hueOf = t => 215 + (Math.max(-10, Math.min(35, t)) + 10) / 45 * 165; // 파랑→보라→분홍→주황
const tColor = t => `hsl(${hueOf(t)} 65% 58%)`;
const emo = (n, cat) => EMOJI[n] || CAT_EMOJI[cat] || '•';
const RATE = {cold:'🥶', good:'😊', hot:'🥵'};
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),2200); }
const allItems = o => CATS.flatMap(c => o[c.k] || []);
const outfitKey = o => CATS.map(c => [...(o[c.k]||[])].sort().join(',')).join('|');
const fmtDate = s => { const d=new Date(s+'T00:00'); return `${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; };
const clone = o => JSON.parse(JSON.stringify(o));
const cur = () => MODE[S.mode];
const whenOf = m => m.when ? (S.when[m.id] || m.when) : null;
const hoursOf = m => m.when ? WHEN[whenOf(m)].h : m.hours;
const modeLabel = m => m.when ? `${m.name} · ${WHEN[whenOf(m)].label}` : m.name;

/* ================== 사용 통계 (GoatCounter, 익명) ================== */
const GC = (window.APP_CONFIG || {}).goatcounter;
let gcQueue = [];
function track(path, title){
  if (!GC || !S.stats) return;
  const send = () => window.goatcounter.count({path, title: title || path, event: true});
  window.goatcounter && window.goatcounter.count ? send() : gcQueue.push(send);
}
function trackDaily(path, title){ // 하루에 한 번만
  const t = todayStr();
  if (S.pinged.date !== t) S.pinged = {date:t, keys:[]};
  if (S.pinged.keys.includes(path)) return;
  S.pinged.keys.push(path); save(); track(path, title);
}
function startAnalytics(){
  if (!GC || !S.stats || document.getElementById('gc')) return;
  const s = document.createElement('script');
  s.id = 'gc'; s.async = true; s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${GC}.goatcounter.com/count`;
  s.onload = () => { const q = gcQueue; gcQueue = []; setTimeout(() => q.forEach(f => f()), 300); };
  document.head.appendChild(s);
}
function dailyStats(){
  const t = todayStr();
  if (S.lastDay !== t){ S.lastDay = t; S.useDays++; save(); }
  const d = S.useDays, bucket = d<=1?'1일째':d<=3?'2-3일':d<=7?'4-7일':d<=14?'8-14일':d<=30?'15-30일':'31일+';
  trackDaily(`active/${bucket}`, `사용한 날 수: ${bucket}`);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  trackDaily(standalone ? 'open/home-screen' : 'open/browser', standalone ? '홈 화면 앱으로 실행' : '브라우저로 실행');
  const n = S.records.length, rb = n===0?'0':n<5?'1-4':n<20?'5-19':'20+';
  trackDaily(`records/${rb}`, `누적 기록 수: ${rb}`);
}

/* ================== 날씨 ================== */
const WX = c => c===0?['☀️','맑음']:c<=2?['🌤️','구름 조금']:c===3?['☁️','흐림']:c<=48?['🌫️','안개']:c<=57?['🌦️','이슬비']:
  c<=67?['🌧️','비']:c<=77?['🌨️','눈']:c<=82?['🌧️','소나기']:c<=86?['🌨️','눈']:['⛈️','뇌우'];
let day = 0;

async function fetchWeather(){
  if (!S.loc) return;
  const {lat, lon} = S.loc;
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=2`;
  const mainUrl = base + `&current=temperature_2m,apparent_temperature,weather_code` +
    `&hourly=apparent_temperature,precipitation_probability,wind_speed_10m,wind_gusts_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&wind_speed_unit=ms`;
  const modelUrl = base + `&hourly=apparent_temperature&models=${WX_MODELS.join(',')}`;
  const get = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.json(); });
  const [m, e] = await Promise.allSettled([get(mainUrl), get(modelUrl)]);
  if (m.status === 'fulfilled'){
    S.wx = {main: m.value, models: e.status === 'fulfilled' ? e.value : null, at: Date.now()}; save();
  } else toast(S.wx ? '오프라인이에요 · 마지막 날씨를 보여줘요' : '날씨를 불러오지 못했어요');
  render();
}

// 시간별로 여러 모델 값을 모아 극단값을 뺀 평균(절사평균)과 모델 간 차이를 계산
function ensemble(){
  const d = S.wx.main, md = S.wx.models;
  const out = d.hourly.time.map((t, k) => ({t, a: d.hourly.apparent_temperature[k], spread: null, n: 1}));
  if (!md || !md.hourly) return {hours: out, n: 1};
  const idx = Object.fromEntries(md.hourly.time.map((t, k) => [t, k]));
  const series = [], sigs = new Set();
  for (const id of WX_MODELS){
    const v = md.hourly['apparent_temperature_' + id];
    if (!v || v.every(x => x == null)) continue;
    const sig = v.join(','); if (sigs.has(sig)) continue; // 다른 모델을 그대로 가져다 쓰는 경우 중복 제거
    sigs.add(sig); series.push(v);
  }
  if (!series.length) return {hours: out, n: 1};
  for (const h of out){
    const k = idx[h.t]; if (k == null) continue;
    const vals = series.map(s => s[k]).filter(x => x != null).sort((a,b) => a-b);
    if (!vals.length) continue;
    const trimmed = vals.length >= 5 ? vals.slice(1, -1) : vals;
    h.a = trimmed.reduce((s,x) => s+x, 0) / trimmed.length;
    h.spread = vals[vals.length-1] - vals[0]; h.n = vals.length;
  }
  return {hours: out, n: series.length};
}

function dayInfo(i, mode = cur()){
  if (!S.wx) return null;
  const d = S.wx.main, date = d.daily.time[i]; if (!date) return null;
  const [h0, h1] = hoursOf(mode);
  const ens = ensemble();
  const sel = ens.hours.map((h, k) => ({...h, p: d.hourly.precipitation_probability[k], w: d.hourly.wind_speed_10m[k], g: d.hourly.wind_gusts_10m[k]}))
    .filter(h => h.t.startsWith(date) && +h.t.slice(11,13) >= h0 && +h.t.slice(11,13) <= h1 && h.a != null);
  if (!sel.length) return null;
  const avg = a => a.reduce((s,x) => s+x, 0) / a.length;
  const spreads = sel.map(h => h.spread).filter(x => x != null);
  return {
    date, base: Math.round(avg(sel.map(h => h.a))),
    amin: Math.round(Math.min(...sel.map(h => h.a))), amax: Math.round(Math.max(...sel.map(h => h.a))),
    code: d.daily.weather_code[i], tmin: Math.round(d.daily.temperature_2m_min[i]), tmax: Math.round(d.daily.temperature_2m_max[i]),
    rain: Math.max(0, ...sel.map(h => h.p ?? 0)), wind: Math.round(Math.max(...sel.map(h => h.w ?? 0))),
    gust: Math.round(Math.max(...sel.map(h => h.g ?? 0))), uv: d.daily.uv_index_max?.[i] ?? 0,
    now: i === 0 ? Math.round(d.current.temperature_2m) : null,
    models: ens.n, spread: spreads.length ? avg(spreads) : null,
  };
}
const isToday = info => info && info.date === todayStr();

/* ================== 추천 ================== */
function defaultOutfit(mode, t){ return mode.rules.find(([min]) => t >= min)[1]; }

function recommend(mode, t){
  const now = Date.now();
  const cands = S.records.filter(r => r.mode === mode.id && allItems(r.items).length && typeof r.temp === 'number').map(r => {
    const adj = r.temp + (r.rating==='cold' ? 3 : r.rating==='hot' ? -3 : 0); // 추웠으면 더 따뜻한 날용, 더웠으면 더 추운 날용
    const d = Math.abs(adj - t);
    const age = (now - new Date(r.date+'T12:00')) / 864e5;
    const score = d + Math.min(age, 365)/120 + (r.rating ? 0 : 0.8) - (r.rating==='good' ? 0.5 : 0);
    return {r, d, score};
  }).filter(c => c.d <= 4).sort((a,b) => a.score - b.score);

  const out = [], seen = new Set();
  for (const c of cands){
    const k = outfitKey(c.r.items); if (seen.has(k)) continue; seen.add(k);
    const r = c.r, when = fmtDate(r.date);
    let why = `${when} 체감 ${r.temp}°에 입었던 옷이에요`;
    if (r.rating==='good') why = `${when} 체감 ${r.temp}°에 입고 <b>딱 좋았던</b> 옷이에요 😊`;
    if (r.rating==='cold') why = `${when} 체감 ${r.temp}°에 추웠던 옷이라, 오늘처럼 더 따뜻한 날 딱이에요`;
    if (r.rating==='hot')  why = `${when} 체감 ${r.temp}°에 더웠던 옷이라, 오늘처럼 더 쌀쌀한 날 딱이에요`;
    out.push({items:r.items, why, label:when.replace(/ \(.\)/,''), mine:true});
    if (out.length >= 4) break;
  }
  const def = defaultOutfit(mode, t);
  if (!seen.has(outfitKey(def)))
    out.push({items:def, label:'기본 추천', why: out.length ? `일반적인 ${mode.name} 기온별 옷차림이에요` :
      `일반적인 ${mode.name} 기온별 옷차림이에요. 입은 옷을 기록하면 점점 맞춤 추천이 돼요!`});
  return out;
}

/* ================== 렌더: 오늘 ================== */
let pick = 0, recs = [];
function renderModes(){
  $('#modes').innerHTML = S.modes.map(id => { const m = MODE[id];
    return `<button class="mode ${id===S.mode?'on':''}" data-m="${id}">${m.emoji} ${esc(m.name.replace(/ \(.*\)/,''))}</button>`; }).join('') +
    `<button class="mode add" id="addMode">＋ ${S.modes.length < 2 ? '운동복 · 아이옷' : '추가'}</button>`;
}

function render(){
  const mode = cur();
  $('#placeName').textContent = S.loc ? S.loc.name : '위치를 설정해 주세요';
  $('#setLocName').textContent = S.loc ? S.loc.name : '없음';
  renderModes();
  document.querySelectorAll('.daytabs button').forEach(b => b.classList.toggle('on', +b.dataset.day === day));
  $('#whenTabs').hidden = !mode.when;
  if (mode.when) $('#whenTabs').innerHTML = Object.entries(WHEN).map(([k, w]) =>
    `<button class="${whenOf(mode)===k?'on':''}" data-w="${k}">${w.label}</button>`).join('');

  const info = dayInfo(day);
  if (!info){
    $('#bigTemp').innerHTML = '<small>체감온도</small>–°';
    $('#heroSub').textContent = S.loc ? '날씨를 불러오는 중이에요' : '위에서 위치를 설정해 주세요';
    $('#src').textContent = ''; $('#hints').innerHTML = '';
    $('#recCard').hidden = true; renderRate(); renderInstall(); return;
  }
  $('#recCard').hidden = false;
  document.documentElement.style.setProperty('--hue', hueOf(info.base));
  const [ic, wxName] = WX(info.code);
  const dayWord = day ? '내일' : '오늘';
  $('#bigTemp').innerHTML = `<small>${dayWord} ${mode.when ? WHEN[whenOf(mode)].label + ' ' : ''}체감온도</small>${info.base}°`;
  $('#wxIcon').textContent = ic;
  $('#heroSub').textContent = `${wxName} · 최저 ${info.tmin}° / 최고 ${info.tmax}°` + (info.now!=null ? ` · 지금 ${info.now}°` : '');
  $('#src').textContent = info.models > 1
    ? `🛰️ 세계 기상모델 ${info.models}곳 종합 · 예보 차이 ±${Math.max(0.5, Math.round(info.spread / 2 * 2) / 2)}°`
    : '🛰️ 기상모델 1곳 기준';

  const hints = [];
  if (info.rain >= 50) hints.push(`☂️ 비 올 확률 ${info.rain}% · 우산 챙기기`);
  else if (info.rain >= 30) hints.push(`🌂 비 소식 ${info.rain}% · 작은 우산`);
  if (info.amax - info.amin >= 8) hints.push(`🌡️ 체감 ${info.amin}°~${info.amax}° · 일교차 커요, 겉옷 챙기기`);
  if (info.spread != null && info.spread >= 4) hints.push('🤔 예보마다 차이가 커요 · 한 겹 더 챙기면 안심');
  if (mode.windy && info.wind >= 5) hints.push(`💨 바람 ${info.wind}m/s${info.gust >= 10 ? ` (돌풍 ${info.gust})` : ''} · 바람막이 필수`);
  else if (info.wind >= 8) hints.push(`💨 바람 강해요 ${info.wind}m/s`);
  if (info.uv >= 7) hints.push('🧴 자외선 강해요');
  hints.push(...mode.tips(info));
  $('#hints').innerHTML = hints.map(h => `<span class="hint">${h}</span>`).join('');

  recs = recommend(mode, info.base); if (pick >= recs.length) pick = 0;
  const rec = recs[pick];
  $('#recTitle').textContent = `${dayWord} ${mode.id === 'daily' ? '' : mode.emoji + ' '}${mode.title}`;
  $('#recWhy').innerHTML = rec.why;
  $('#recRows').innerHTML = CATS.filter(c => (rec.items[c.k]||[]).length).map(c => `
    <div class="row"><div class="row-label">${c.label}</div><div class="items">
      ${rec.items[c.k].map(n => `<span class="item"><span class="e">${emo(n, c.k)}</span>${esc(n)}</span>`).join('')}
    </div></div>`).join('');
  $('#recActions').hidden = !isToday(info);
  $('#alts').innerHTML = recs.length > 1 ? recs.map((r,i) => `
    <button class="alt ${i===pick?'on':''}" data-i="${i}"><b>${r.mine ? '💛 ' : '📘 '}${esc(r.label)}</b>
    <span>${allItems(r.items).map(esc).join(' · ')}</span></button>`).join('') : '';
  renderRate(); renderInstall();
  trackDaily(`mode/${mode.id}`, `추천 확인: ${mode.name}`);
  trackDaily(`learned/${rec.mine ? 'yes' : 'no'}`, rec.mine ? '내 기록 기반 추천' : '기본 추천');
}

function renderRate(){
  const cutoff = ymd(new Date(Date.now() - 3*864e5)), t = todayStr(), hr = new Date().getHours();
  const r = S.records.filter(r => !r.rating && r.date >= cutoff && r.date <= t && MODE[r.mode])
    .filter(r => r.date !== t || hr >= (r.when ? WHEN[r.when].h[1] : 16)) // 오늘 기록은 활동이 끝난 뒤에 물어봐요
    .sort((a,b) => b.date.localeCompare(a.date))[0];
  const el = $('#rateCard');
  if (!r || day !== 0){ el.hidden = true; return; }
  const m = MODE[r.mode];
  el.hidden = false;
  el.innerHTML = `<h2>${r.date === t ? '오늘' : fmtDate(r.date)} ${m.emoji} ${esc(m.name.replace(/ \(.*\)/,''))} 옷차림 어땠어요?</h2>
    <div class="why" style="margin:0">${allItems(r.items).map(esc).join(' · ')} (체감 ${r.temp}°)</div>
    <div class="rate-btns">${Object.entries({cold:'추웠어',good:'딱 좋아',hot:'더웠어'}).map(([k,v]) =>
      `<button data-r="${k}" data-id="${r.id}"><span class="e">${RATE[k]}</span>${v}</button>`).join('')}</div>`;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => track('install/android', '앱 설치 (안드로이드)'));
function renderInstall(){
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const el = $('#installBanner');
  if (standalone || S.hideInstall){ el.hidden = true; return; }
  el.hidden = false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `<button class="x" id="hideInstall">✕</button><b>📲 홈 화면에 추가하면 앱처럼 쓸 수 있어요</b><br>` +
    (deferredPrompt ? `<button class="btn primary" id="installNow" style="margin-top:10px;width:100%">홈 화면에 추가</button>` :
     ios ? 'Safari 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>' : 'Chrome 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>');
}

/* ================== 렌더: 기록 ================== */
let histFilter = 'all';
function renderHist(){
  const used = [...new Set([...S.modes, ...S.records.map(r => r.mode)])].filter(id => MODE[id]);
  if (histFilter !== 'all' && !used.includes(histFilter)) histFilter = 'all';
  $('#histFilter').innerHTML = used.length > 1 ? [['all','전체'], ...used.map(id => [id, MODE[id].emoji + ' ' + MODE[id].name.replace(/ \(.*\)/,'')])]
    .map(([id, l]) => `<button class="mode ${histFilter===id?'on':''}" data-f="${id}">${esc(l)}</button>`).join('') : '';
  const recs = S.records.filter(r => histFilter === 'all' || r.mode === histFilter).sort((a,b) => b.date.localeCompare(a.date) || a.mode.localeCompare(b.mode));
  const rated = recs.filter(r => r.rating);
  const good = rated.filter(r => r.rating === 'good').length;
  $('#stats').innerHTML = `<div><b>${recs.length}</b><span>기록</span></div>
    <div><b>${rated.length ? Math.round(good / rated.length * 100) + '%' : '–'}</b><span>딱 좋았던 날</span></div>`;
  if (!recs.length){
    $('#histList').innerHTML = `<div class="empty"><div class="e">👗</div>아직 기록이 없어요.<br>오늘 입은 옷을 기록해 보세요!</div>`; return;
  }
  let html = '', mm0 = '';
  for (const r of recs){
    const mm = r.date.slice(0,7), m = MODE[r.mode] || MODE.daily;
    if (mm !== mm0){ mm0 = mm; html += `<div class="month">${+mm.slice(0,4)}년 ${+mm.slice(5)}월</div>`; }
    html += `<button class="rec" data-id="${r.id}">
      <div class="tbadge" style="background:${tColor(r.temp)}">${r.temp}°</div>
      <div class="rec-body"><div class="rec-date">${m.emoji} ${fmtDate(r.date)}${r.when ? ' · ' + WHEN[r.when].label : ''}</div>
      <div class="rec-items">${allItems(r.items).map(esc).join(' · ') || '–'}</div></div>
      <div class="rec-rate">${r.rating ? RATE[r.rating] : '<span style="font-size:12px;color:var(--sub)">평가 전</span>'}</div></button>`;
  }
  $('#histList').innerHTML = html;
}

/* ================== 렌더: 설정 ================== */
function renderSettings(){
  $('#setModesName').textContent = S.modes.map(id => MODE[id].emoji).join(' ');
  $('#statsSwitch').classList.toggle('on', !!S.stats);
  $('#statsRow').hidden = !GC;
}

function renderModeSheet(){
  const groups = [...new Set(MODES.map(m => m.group))];
  $('#modeList').innerHTML = groups.map(g => `<div class="group-title">${g}</div>` + MODES.filter(m => m.group === g).map(m => `
    <button class="mrow ${S.modes.includes(m.id)?'on':''}" data-m="${m.id}">
      <span class="e">${m.emoji}</span><span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span><span class="check">✓</span>
    </button>`).join('')).join('');
}

/* ================== 탭 / 시트 ================== */
function showView(v){
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-'+v));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'hist') renderHist();
  if (v === 'home') render();
  if (v === 'set') renderSettings();
  scrollTo(0,0);
}
let openSheetEl = null;
function openSheet(id){ if (openSheetEl) openSheetEl.classList.remove('on'); openSheetEl = $(id); $('#dim').classList.add('on'); openSheetEl.classList.add('on'); }
function closeSheet(){ if (openSheetEl) openSheetEl.classList.remove('on'); $('#dim').classList.remove('on'); openSheetEl = null; }

/* ---- 기록 시트 ---- */
let edit = null; // {id?, date, mode, when?, temp, items, rating}
function newRecord(mode, items){
  const info = dayInfo(0, mode);
  return {date: todayStr(), mode: mode.id, when: whenOf(mode), temp: isToday(info) ? info.base : '', items: items ? clone(items) : emptyItems(), rating: null};
}
function openLog(rec){
  edit = clone(rec);
  const m = MODE[edit.mode];
  $('#logTitle').textContent = `${m.emoji} ${m.name.replace(/ \(.*\)/,'')} ${rec.id ? '기록 수정' : '입은 옷 기록'}`;
  $('#logDate').value = edit.date; $('#logTemp').value = edit.temp;
  $('#logDel').hidden = !rec.id;
  renderLogCats(); renderLogRate(); openSheet('#logSheet');
}
function renderLogCats(){
  const m = MODE[edit.mode], cu = customOf(edit.mode);
  $('#logCats').innerHTML = CATS.map(c => {
    const list = [...new Set([...m.presets[c.k], ...cu[c.k], ...edit.items[c.k]])];
    return `<div class="cat"><div class="cat-title">${c.label}</div><div class="chips">
      ${list.map(n => `<button class="chip ${edit.items[c.k].includes(n)?'on':''}" data-c="${c.k}" data-n="${esc(n)}">${emo(n, c.k)} ${esc(n)}</button>`).join('')}
      <button class="chip add" data-add="${c.k}">＋ 직접 입력</button></div></div>`;
  }).join('');
}
function renderLogRate(){ document.querySelectorAll('#logRate button').forEach(b => b.classList.toggle('on', b.dataset.r === edit.rating)); }

$('#logCats').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.add){
    const k = b.dataset.add, n = (prompt(`추가할 ${CATS.find(c=>c.k===k).label} 이름`) || '').trim();
    if (!n) return;
    const cu = customOf(edit.mode);
    if (!cu[k].includes(n) && !MODE[edit.mode].presets[k].includes(n)) { cu[k].push(n); save(); track('custom-item', '옷 직접 입력'); }
    if (!edit.items[k].includes(n)) edit.items[k].push(n);
    renderLogCats(); return;
  }
  const arr = edit.items[b.dataset.c], n = b.dataset.n, i = arr.indexOf(n);
  i >= 0 ? arr.splice(i,1) : arr.push(n);
  b.classList.toggle('on');
});
$('#logRate').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  edit.rating = edit.rating === b.dataset.r ? null : b.dataset.r; renderLogRate();
});
$('#logSave').onclick = () => {
  edit.date = $('#logDate').value || todayStr();
  const t = parseFloat($('#logTemp').value);
  if (isNaN(t)) { toast('체감온도를 입력해 주세요'); return; }
  edit.temp = Math.round(t);
  if (!allItems(edit.items).length) { toast('입은 옷을 하나 이상 골라주세요'); return; }
  const same = S.records.find(r => r.date === edit.date && r.mode === edit.mode && r.id !== edit.id);
  if (same && !confirm(`${fmtDate(edit.date)} ${MODE[edit.mode].name} 기록이 이미 있어요. 바꿀까요?`)) return;
  const isNew = !edit.id;
  S.records = S.records.filter(r => r.id !== edit.id && !(r.date === edit.date && r.mode === edit.mode));
  S.records.push({...edit, id: edit.id || Date.now().toString(36)});
  save(); closeSheet(); toast('기록했어요 ✨'); render(); renderHist();
  if (isNew) track(`record/${edit.mode}`, `기록 저장: ${MODE[edit.mode].name}`);
  if (edit.rating) track(`rating/${edit.rating}`, `평가: ${RATE[edit.rating]}`);
};
$('#logDel').onclick = () => {
  if (!confirm('이 기록을 지울까요?')) return;
  S.records = S.records.filter(r => r.id !== edit.id); save(); closeSheet(); render(); renderHist(); toast('지웠어요');
};

/* ---- 위치 ---- */
function useGPS(){
  if (!navigator.geolocation){ toast('위치 기능을 쓸 수 없어요'); openSheet('#locSheet'); return; }
  $('#placeName').textContent = '위치 확인 중…';
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
    let name = '현재 위치';
    try {
      const r = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`)).json();
      name = r.locality || r.city || r.principalSubdivision || name;
    } catch(e){}
    S.loc = {lat, lon, name, gps:true}; save(); closeSheet(); render(); fetchWeather();
  }, () => { toast('위치 권한이 없어서 도시를 검색해 주세요'); render(); openSheet('#locSheet'); setTimeout(()=>$('#locSearch').focus(),300); },
  {timeout:10000, maximumAge:600000});
}
let searchT;
$('#locSearch').addEventListener('input', e => {
  clearTimeout(searchT); const q = e.target.value.trim();
  if (q.length < 1){ $('#locResults').innerHTML=''; return; }
  searchT = setTimeout(async () => {
    try {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ko`)).json();
      $('#locResults').innerHTML = (r.results||[]).map(x => `<button class="result" data-lat="${x.latitude}" data-lon="${x.longitude}" data-name="${esc(x.name)}">
        ${esc(x.name)}<span>${esc([x.admin1, x.country].filter(Boolean).join(', '))}</span></button>`).join('') ||
        '<div class="empty" style="padding:30px">검색 결과가 없어요</div>';
    } catch(e){ $('#locResults').innerHTML = '<div class="empty" style="padding:30px">인터넷 연결을 확인해 주세요</div>'; }
  }, 300);
});
$('#locResults').addEventListener('click', e => {
  const b = e.target.closest('.result'); if (!b) return;
  S.loc = {lat:+b.dataset.lat, lon:+b.dataset.lon, name:b.dataset.name, gps:false}; save();
  closeSheet(); $('#locSearch').value=''; $('#locResults').innerHTML=''; render(); fetchWeather();
});

/* ---- 이벤트 ---- */
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => showView(b.dataset.view));
document.querySelectorAll('.daytabs button').forEach(b => b.onclick = () => { day = +b.dataset.day; pick = 0; render(); });
$('#whenTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.when[S.mode] = b.dataset.w; save(); pick = 0; render(); };
$('#modes').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'addMode'){ renderModeSheet(); openSheet('#modeSheet'); return; }
  S.mode = b.dataset.m; save(); pick = 0; render();
};
$('#modeList').onclick = e => {
  const b = e.target.closest('.mrow'); if (!b) return;
  const id = b.dataset.m, on = S.modes.includes(id);
  if (on && S.modes.length === 1){ toast('최소 하나는 있어야 해요'); return; }
  if (on) S.modes = S.modes.filter(x => x !== id);
  else { S.modes = MODES.map(m => m.id).filter(x => S.modes.includes(x) || x === id); track(`mode-added/${id}`, `종류 추가: ${MODE[id].name}`); }
  if (!S.modes.includes(S.mode)) S.mode = S.modes[0];
  if (!on) S.mode = id;
  save(); renderModeSheet(); render(); renderSettings();
};
$('#modeDone').onclick = closeSheet;
$('#histFilter').onclick = e => { const b = e.target.closest('button'); if (b){ histFilter = b.dataset.f; renderHist(); } };
$('#placeBtn').onclick = $('#setLoc').onclick = () => openSheet('#locSheet');
$('#setModes').onclick = () => { renderModeSheet(); openSheet('#modeSheet'); };
$('#gpsBtn').onclick = $('#setGps').onclick = useGPS;
$('#refreshBtn').onclick = () => { toast('날씨를 새로 불러와요'); S.loc?.gps ? useGPS() : fetchWeather(); };
$('#dim').onclick = closeSheet;
$('#alts').onclick = e => { const b = e.target.closest('.alt'); if (b){ pick = +b.dataset.i; render(); } };
$('#woreBtn').onclick = () => {
  const mode = cur(), info = dayInfo(0); if (!isToday(info)) return;
  const exist = S.records.find(r => r.date === todayStr() && r.mode === mode.id);
  if (exist && !confirm(`오늘 ${mode.name} 기록이 이미 있어요. 이 옷차림으로 바꿀까요?`)) return;
  S.records = S.records.filter(r => !(r.date === todayStr() && r.mode === mode.id));
  S.records.push({...newRecord(mode, recs[pick].items), id: Date.now().toString(36)});
  save(); render();
  toast(mode.when ? '기록했어요! 끝나고 어땠는지 알려주세요 🙌' : '기록했어요! 저녁에 어땠는지 알려주세요 🙌');
  track(`wore-recommended/${mode.id}`, `추천대로 입음: ${mode.name}`);
};
$('#otherBtn').onclick = () => {
  const mode = cur();
  const r = S.records.find(r => r.date === todayStr() && r.mode === mode.id);
  openLog(r || newRecord(mode, recs[pick]?.items));
};
$('#addRecBtn').onclick = () => openLog(newRecord(histFilter !== 'all' ? MODE[histFilter] : cur()));
$('#histList').onclick = e => { const b = e.target.closest('.rec'); if (b) openLog(S.records.find(r => r.id === b.dataset.id)); };
$('#rateCard').onclick = e => {
  const b = e.target.closest('button[data-r]'); if (!b) return;
  const r = S.records.find(r => r.id === b.dataset.id); if (!r) return;
  r.rating = b.dataset.r; save(); render();
  toast({cold:'다음엔 더 따뜻하게 추천할게요 🧣', good:'좋아요! 기억해 둘게요 😊', hot:'다음엔 더 가볍게 추천할게요 👕'}[r.rating]);
  track(`rating/${r.rating}`, `평가: ${RATE[r.rating]}`);
};
$('#installBanner').onclick = async e => {
  if (e.target.id === 'hideInstall'){ S.hideInstall = true; save(); renderInstall(); }
  if (e.target.id === 'installNow' && deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderInstall(); }
};
$('#statsRow').onclick = () => { S.stats = !S.stats; save(); renderSettings(); if (S.stats) startAnalytics(); };
$('#exportBtn').onclick = async () => {
  const data = JSON.stringify({app:'outfit', v:2, at:new Date().toISOString(), records:S.records, custom:S.custom, modes:S.modes}, null, 1);
  const name = `옷차림백업_${todayStr()}.json`;
  const file = new File([data], name, {type:'application/json'});
  track('backup/export', '백업 저장');
  if (navigator.canShare && navigator.canShare({files:[file]})) {
    try { await navigator.share({files:[file], title:name}); return; } catch(e){ if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!Array.isArray(d.records)) throw 0;
    if (!confirm(`기록 ${d.records.length}개를 불러올까요? (같은 날짜·종류는 백업 내용으로 바뀌어요)`)) return;
    d.records.forEach(r => { r.mode ||= 'daily'; });
    const keys = new Set(d.records.map(r => r.date + r.mode));
    S.records = [...S.records.filter(r => !keys.has(r.date + r.mode)), ...d.records];
    const cust = d.custom && Array.isArray(d.custom.outer) ? {daily: d.custom} : (d.custom || {});
    for (const [id, c] of Object.entries(cust)) { const mine = customOf(id); for (const k of CATS.map(c => c.k)) mine[k] = [...new Set([...mine[k], ...(c[k]||[])])]; }
    if (Array.isArray(d.modes)) S.modes = MODES.map(m => m.id).filter(id => S.modes.includes(id) || d.modes.includes(id));
    save(); render(); toast('불러왔어요 ✨');
  } catch(err){ toast('올바른 백업 파일이 아니에요'); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => {
  if (!confirm('모든 옷차림 기록을 지울까요? 되돌릴 수 없어요.')) return;
  S.records = []; save(); render(); toast('모두 지웠어요');
};

/* ---- 시작 ---- */
startAnalytics();
render();
dailyStats();
const stale = () => !S.wx || Date.now() - S.wx.at > 30*60e3 || S.wx.main.daily.time[0] !== todayStr();
if (!S.loc) useGPS();
else if (stale()) (S.loc.gps ? useGPS() : fetchWeather());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible'){ dailyStats(); if (S.loc && stale()) fetchWeather(); }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
