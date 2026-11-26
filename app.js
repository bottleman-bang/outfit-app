/* ================== 주소 이전 ==================
   config.js의 canonical(새 주소)이 정해지면, 예전 주소로 들어온 사람의 기록을 새 주소로 옮기고 이동시켜요.
   (휴대폰은 사이트 주소마다 저장공간이 따로라서 이렇게 옮겨줘야 해요) */
(function moveToCanonical(){
  const C = (window.APP_CONFIG || {}).canonical;
  if (!C || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  const target = new URL(C);
  if (location.origin === target.origin) return;
  let payload = '';
  try {
    const d = JSON.parse(localStorage.getItem('outfit.v1') || 'null');
    if (d && ((d.records || []).length || (d.places || []).length)){
      delete d.wx; delete d.wxc; delete d.pinged;
      payload = '#import=' + btoa(unescape(encodeURIComponent(JSON.stringify(d))));
    }
  } catch(e){}
  document.body.innerHTML = '<p style="font:600 16px sans-serif;text-align:center;margin-top:40vh">새 주소로 옮기는 중이에요…</p>';
  location.replace(target.origin + target.pathname + payload);
  throw new Error('moving to canonical address');
})();
(function importFromOldAddress(){
  const m = location.hash.match(/^#import=(.+)$/); if (!m) return;
  try {
    const inc = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    const cur = JSON.parse(localStorage.getItem('outfit.v1') || 'null') || {records: []};
    const have = new Set((cur.records || []).map(r => r.date + (r.mode || 'daily')));
    const add = (inc.records || []).filter(r => !have.has(r.date + (r.mode || 'daily')));
    const out = {...inc, ...cur, records: [...(cur.records || []), ...add]};
    out.modes = [...new Set([...(cur.modes || []), ...(inc.modes || [])])];
    if (!(cur.places || []).length) out.places = inc.places || [];
    if (!cur.gps) out.gps = inc.gps;
    if (!cur.locSel) out.locSel = inc.locSel;
    out.moved = add.length || 1; out.hideInstall = false;
    localStorage.setItem('outfit.v1', JSON.stringify(out));
  } catch(e){}
  history.replaceState(null, '', location.pathname);
})();

/* ================== 데이터 ================== */
const KEY = 'outfit.v1';
// 추천 종류: 고정 종류(일상·운동) + 아이별 종류(등록한 아이마다 하나씩)
const BASE_MODES = MODES.filter(m => !m.template);
const TPL = {baby: MODES.find(m => m.id === 'tpl-baby'), kid: MODES.find(m => m.id === 'tpl-kid')};
const MODE = {};
const kidModeId = k => 'kid-' + k.id;
const kidAge = k => new Date().getFullYear() - k.year; // 연 나이(만 나이와 1살 차이 날 수 있음)
function kidMode(k){
  const age = kidAge(k), t = age <= 2 ? TPL.baby : TPL.kid, name = k.name || `${k.year}년생`;
  return {...t, id: kidModeId(k), template: false, kid: k, name, emoji: age <= 2 ? '👶' : '🧒',
    desc: `${k.year}년생 · ${age <= 0 ? '1살 미만' : age + '살'} · ${age <= 2 ? '아기 기준' : '어린이 기준'}`, title: `${name} 옷`};
}
function buildModes(kids){
  for (const k in MODE) delete MODE[k];
  BASE_MODES.forEach(m => MODE[m.id] = m);
  (kids || []).forEach(k => MODE[kidModeId(k)] = kidMode(k));
}
const allModeIds = () => [...BASE_MODES.map(m => m.id), ...(S.kids || []).map(kidModeId)];
// 여러 나라 기상 모델 (Open-Meteo 무료 제공). 데이터 없는 모델은 자동으로 빠져요.
const WX_MODELS = ['ecmwf_ifs025','gfs_seamless','icon_seamless','jma_seamless','kma_seamless','metno_seamless',
  'gem_seamless','meteofrance_seamless','ukmo_seamless','cma_grapes_global'];
const DAYS = 16; // 16일 예보

const ruleOf = (mode, t) => mode.rules.find(([min]) => t >= min)[1];
const lvFromArr = a => ({outer:a[0], top:a[1], bottom:a[2], extra:a[3]});
const maxLv = (mode, k) => mode.levels[k].length - 1;

const MAX_PLACES = 3; // 현재 위치 + 저장 지역 3곳 (휴대폰 화면 폭에 맞춘 개수)
const locKey = l => l ? `${(+l.lat).toFixed(3)},${(+l.lon).toFixed(3)}` : '';

// 예전 '옷 종류' 기록 → '두께 단계'로 변환
function itemsToLevels(mode, items, temp){
  const def = lvFromArr(ruleOf(mode, typeof temp === 'number' ? temp : 15));
  const out = {};
  for (const c of CATS){
    const its = items[c.k] || [];
    let best = -1;
    mode.levels[c.k].forEach((lv, i) => { if (its.some(n => lv.ex.includes(n))) best = Math.max(best, i); });
    out[c.k] = best >= 0 ? best : (its.length ? def[c.k] : (c.none ? 0 : def[c.k]));
  }
  return out;
}

function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e){}
  if (!s || !Array.isArray(s.records)) s = {records:[]};
  // 예전 '아기/어린이' 종류 → 아이별 등록으로 이전
  s.kids ||= [];
  const y = new Date().getFullYear(), oldKid = {baby: ['아기', y - 1], kid: ['어린이', y - 5]};
  for (const old in oldKid){
    if ((s.modes || []).includes(old) || s.records.some(r => r.mode === old)){
      const k = {id: old === 'baby' ? 'b1' : 'c1', name: oldKid[old][0], year: oldKid[old][1]};
      if (!s.kids.some(x => x.id === k.id)) s.kids.push(k);
      s.records.forEach(r => { if (r.mode === old) r.mode = kidModeId(k); });
      s.modes = (s.modes || []).map(m => m === old ? kidModeId(k) : m);
      if (s.mode === old) s.mode = kidModeId(k);
      if (s.custom) delete s.custom[old];
    }
  }
  buildModes(s.kids);
  s.records.forEach(r => {
    r.mode ||= 'daily';
    if (!MODE[r.mode]) return;
    if (!r.levels && r.items) r.levels = itemsToLevels(MODE[r.mode], r.items, r.temp);
  });
  s.records = s.records.filter(r => r.levels && MODE[r.mode]);
  s.modes = (s.modes || ['daily']).filter(id => MODE[id]); if (!s.modes.length) s.modes = ['daily'];
  if (!MODE[s.mode] || !s.modes.includes(s.mode)) s.mode = s.modes[0];
  s.when ||= {};
  s.stats ??= true;
  s.useDays ||= 0;
  s.pinged ||= {date:'', keys:[]};
  s.fcTab ||= 'hourly';
  s.fcStep = {daily: 3, sport: 1, kid: 3, ...(s.fcStep || {})}; // 시간별 예보 간격 (운동은 1시간이 기본)
  s.newsCats ||= ['markets','economy','bonds','commodities','crypto','tech','people','korea','world'];
  s.newsOrig ??= false; s.upColor ||= 'kr'; s.mkt ||= 'kr'; s.life ??= true;
  s.periods = (s.periods || ['am','pm','eve']).filter(k => ['dawn','am','pm','eve','night'].includes(k)); if (!s.periods.length) s.periods = ['am','pm','eve'];
  // 위치: 현재 위치(gps) + 저장 지역(places), 날씨는 지역별로 저장
  s.places ||= []; s.wxc ||= {};
  if (!s.locSel){
    if (s.loc && !s.loc.gps){ const p = {id:'p1', name:s.loc.name, full:s.loc.full || s.loc.name, lat:s.loc.lat, lon:s.loc.lon}; s.places = [p]; s.locSel = 'p1'; }
    else { if (s.loc) s.gps = {lat:s.loc.lat, lon:s.loc.lon, name:s.loc.name, full:s.loc.name}; s.locSel = 'gps'; }
    if (s.wx && s.loc) s.wxc[locKey(s.loc)] = s.wx;
  }
  for (const k in s.wxc) if (!s.wxc[k].main || !s.wxc[k].main.hourly.cloud_cover) delete s.wxc[k]; // 옛 날씨 캐시 형식
  if (!s.places.some(p => p.id === s.locSel)) s.locSel = 'gps';
  s.loc = s.locSel === 'gps' ? (s.gps ? {...s.gps, gps:true} : null) : {...s.places.find(p => p.id === s.locSel), gps:false};
  s.wx = s.loc ? s.wxc[locKey(s.loc)] || null : null;
  return s;
}
let S = load();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S, function(k, v){ return this === S && k === 'wx' ? undefined : v; })); } catch(e){ toast('저장 공간이 부족해요'); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});

/* ================== 유틸 ================== */
const $ = s => document.querySelector(s);
const ymd = d => { const z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const todayStr = () => ymd(new Date());
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const avg = a => a.length ? a.reduce((s,x) => s+x, 0) / a.length : 0;
const r1 = x => Math.round(x * 10) / 10;
// 기온 → 부드러운 파스텔 색상 (하늘색 → 민트 → 연두 → 버터 → 살구 → 코랄)
const HUES = [[-10,215],[0,205],[8,188],[14,160],[19,100],[23,50],[27,30],[33,12]];
function hueOf(t){
  t = Math.max(-10, Math.min(33, t));
  for (let i = 1; i < HUES.length; i++) if (t <= HUES[i][0]) {
    const [t0,h0] = HUES[i-1], [t1,h1] = HUES[i];
    return h0 + (h1 - h0) * (t - t0) / (t1 - t0);
  }
  return 12;
}
const RATE = {cold:'🥶', good:'😊', hot:'🥵'};
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),2200); }
const WD = '일월화수목금토';
const fmtDate = s => { const d=new Date(s+'T00:00'); return `${d.getMonth()+1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const fmtRange = (a, b) => { // 오전 9시~11시 / 오전 9시~오후 6시
  const x = fmtHour(a), y = fmtHour(b), px = x.split(' ')[0], py = y.split(' ')[0];
  return `${x}~${px === py && /^(오전|오후)$/.test(px) ? y.slice(px.length + 1) : y}`;
};
const fmtHour = h => h === 0 || h === 24 ? '자정' : h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h-12}시`;
const cur = () => MODE[S.mode];
const whenOf = m => { if (!m.when) return null; const k = S.when[m.id]; return k && WHEN[k] && (!WHEN[k].opt || S.periods.includes(k)) ? k : m.when; };
const hoursOf = m => m.when ? WHEN[whenOf(m)].h : m.hours;
const shortName = m => m.name.replace(/ \(.*\)/,'');
const levelsText = (mode, lv) => CATS.filter(c => !(c.k === 'extra' && !lv.extra)).map(c => `${c.label} ${mode.levels[c.k][lv[c.k]].n}`).join(' · ');

/* ================== 사용 통계 (GoatCounter, 익명) ================== */
const GC = (window.APP_CONFIG || {}).goatcounter;
let gcQueue = [];
function track(path, title){
  if (!GC || !S.stats) return;
  const send = () => window.goatcounter.count({path, title: title || path, event: true});
  window.goatcounter && window.goatcounter.count ? send() : gcQueue.push(send);
}
function trackDaily(path, title){
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
  trackDaily(`browser/${BR.ios ? 'ios' : BR.android ? 'android' : 'pc'}-${BR.app}`, `브라우저: ${BR.ios ? '아이폰' : BR.android ? '안드로이드' : 'PC'} ${BR_NAME[BR.app]}`);
  trackDaily(standalone ? 'open/home-screen' : 'open/browser', standalone ? '홈 화면 앱으로 실행' : '브라우저로 실행');
  const n = S.records.length, rb = n===0?'0':n<5?'1-4':n<20?'5-19':'20+';
  trackDaily(`records/${rb}`, `누적 기록 수: ${rb}`);
}

/* ================== 날씨 받아오기 ================== */
async function fetchWeather(){
  if (!S.loc) return;
  const L = S.loc, {lat, lon} = L;
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=${DAYS}`;
  const mainUrl = base + `&past_days=1&current=temperature_2m,apparent_temperature,weather_code,is_day` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,relative_humidity_2m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&wind_speed_unit=ms`;
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=5&hourly=pm10,pm2_5,dust,ozone`;
  const modelUrl = base + `&hourly=apparent_temperature&models=${WX_MODELS.join(',')}`;
  const get = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.json(); });
  const [m, e, q] = await Promise.allSettled([get(mainUrl), get(modelUrl), get(aqUrl)]);
  if (m.status === 'fulfilled'){
    const w = {main: m.value, models: e.status === 'fulfilled' ? e.value : null, aq: q.status === 'fulfilled' ? q.value : null, at: Date.now()};
    S.wxc[locKey(L)] = w;
    if (locKey(S.loc) === locKey(L)){ S.wx = w; WXC = null; }
    save();
  } else toast(S.wx ? '오프라인이에요 · 마지막 날씨를 보여줘요' : '날씨를 불러오지 못했어요');
  render();
}

/* ================== 날씨 가공 ================== */
let WXC = null; // 계산 캐시
function wx(){
  if (!S.wx) return null;
  if (WXC && WXC.at === S.wx.at) return WXC;
  const d = S.wx.main, h = d.hourly, md = S.wx.models;
  // 여러 모델 체감온도: 시간마다 극단값 빼고 평균(절사평균)
  const series = [], sigs = new Set();
  let midx = null;
  if (md && md.hourly){
    midx = Object.fromEntries(md.hourly.time.map((t, k) => [t, k]));
    for (const id of WX_MODELS){
      const v = md.hourly['apparent_temperature_' + id];
      if (!v || v.every(x => x == null)) continue;
      const sig = v.join(','); if (sigs.has(sig)) continue; // 다른 모델을 그대로 쓰는 경우 중복 제거
      sigs.add(sig); series.push(v);
    }
  }
  const aqh = S.wx.aq && S.wx.aq.hourly, aqi = aqh ? Object.fromEntries(aqh.time.map((t, k) => [t, k])) : {};
  const av = (key, t) => { const k = aqi[t]; return k == null || !aqh[key] ? null : aqh[key][k] ?? null; };
  const H = h.time.map((t, k) => {
    let a = h.apparent_temperature[k], spread = null, n = 1;
    const mk = midx && midx[t];
    if (mk != null && series.length){
      const vals = series.map(s => s[mk]).filter(x => x != null).sort((x,y) => x-y);
      if (vals.length){
        const tr = vals.length >= 5 ? vals.slice(1, -1) : vals;
        a = avg(tr); spread = vals[vals.length-1] - vals[0]; n = vals.length;
      }
    }
    return { t, date: t.slice(0,10), hour: +t.slice(11,13), a, temp: h.temperature_2m[k],
      p: h.precipitation_probability[k] ?? 0, mm: h.precipitation[k] ?? 0, snow: h.snowfall[k] ?? 0,
      code: h.weather_code[k] ?? 0, cloud: h.cloud_cover[k] ?? 0, w: h.wind_speed_10m[k] ?? 0,
      g: h.wind_gusts_10m[k] ?? 0, dir: h.wind_direction_10m[k] ?? 0, day: h.is_day[k], spread, n,
      am: h.apparent_temperature[k], rh: h.relative_humidity_2m ? h.relative_humidity_2m[k] : null,
      pm10: av('pm10', t), pm25: av('pm2_5', t), dust: av('dust', t), o3: av('ozone', t) };
  }).filter(x => x.a != null);
  const D = d.daily.time.map((date, i) => {
    const hs = H.filter(x => x.date === date);
    const dayHs = hs.filter(x => x.hour >= 6 && x.hour <= 21);
    const ag = agg(dayHs.length ? dayHs : hs);
    return { i, date, tmax: Math.round(d.daily.temperature_2m_max[i]), tmin: Math.round(d.daily.temperature_2m_min[i]),
      mm: d.daily.precipitation_sum[i] ?? 0, p: d.daily.precipitation_probability_max[i] ?? 0,
      w: Math.round(d.daily.wind_speed_10m_max[i] ?? 0), uv: d.daily.uv_index_max?.[i] ?? 0,
      sky: sky({...ag, day: 1}), models: Math.max(1, ...hs.map(x => x.n)),
      sunrise: d.daily.sunrise ? d.daily.sunrise[i] : null, sunset: d.daily.sunset ? d.daily.sunset[i] : null };
  });
  const today = d.current.time.slice(0, 10);
  const yd = new Date(today + 'T12:00'); yd.setDate(yd.getDate() - 1);
  const Y = H.filter(x => x.date === ymd(yd));
  const DD = D.filter(x => !isNaN(x.tmax) && x.date >= today).map((x, j) => ({...x, i: j}));
  const nowT = d.current.time.slice(0, 13);
  return (WXC = { at: S.wx.at, H, D: DD, Y, nowT, nowTemp: Math.round(d.current.temperature_2m), today });
}

// 여러 시간을 하나로 묶기 (3시간 칸, 하루 등)
function agg(hs){
  if (!hs.length) return null;
  const mid = hs[Math.floor(hs.length / 2)];
  return { n: hs.length, a: avg(hs.map(x => x.a)), temp: avg(hs.map(x => x.temp)),
    mm: hs.reduce((s,x) => s + x.mm, 0), mmMax: Math.max(...hs.map(x => x.mm)), snow: hs.reduce((s,x) => s + x.snow, 0),
    p: Math.max(...hs.map(x => x.p)), w: Math.max(...hs.map(x => x.w)), g: Math.max(...hs.map(x => x.g)),
    cloud: avg(hs.map(x => x.cloud)), code: Math.max(...hs.map(x => x.code)), dir: mid.dir, day: mid.day,
    spread: avg(hs.map(x => x.spread).filter(x => x != null)), models: Math.max(...hs.map(x => x.n)) };
}

// 하늘 상태 판정 → 아이콘 종류 + 이름
function sky(o){
  if (!o) return {kind:'partly-day', label:'–'};
  const long = o.n >= 10, dn = o.day ? 'day' : 'night';
  const rainMin = long ? 1 : 0.2;
  if (o.code >= 95) return {kind:'thunder', label:'뇌우'};
  if (o.snow >= (long ? 0.5 : 0.1) || ([71,73,75,77,85,86].includes(o.code) && o.mm > 0)) return {kind:'snow', label:'눈'};
  if (o.mm >= rainMin){
    const heavy = long ? o.mm >= 20 : o.mm / o.n >= 3;
    return heavy ? {kind:'heavyrain', label:'강한 비'} : {kind:'rain', label:'비'};
  }
  if (o.code === 45 || o.code === 48) return {kind:'fog', label:'안개'};
  if (o.w >= 9 || o.g >= 16) return {kind:'wind', label:'바람 강함'};
  if (o.cloud < 30) return {kind:'clear-' + dn, label:'맑음'};
  if (o.cloud < 60) return {kind:'partly-' + dn, label:'구름 조금'};
  if (o.cloud < 85) return {kind:'mostly-' + dn, label:'구름 많음'};
  return {kind:'overcast', label:'흐림'};
}

// 선택한 날짜 + 추천 종류의 활동 시간대 정보
// 일상복·아이옷은 아침/낮/저녁으로 나눠서 브리핑·추천
const PERIODS = [{k:'dawn', label:'새벽', h:[5,7], t:'5~7시'}, {k:'am', label:'아침', h:[9,10], t:'9~10시'}, {k:'pm', label:'낮', h:[13,15], t:'1~3시'},
  {k:'eve', label:'저녁', h:[18,20], t:'6~8시'}, {k:'night', label:'밤', h:[22,23], t:'10~12시'}];
const PS = () => PERIODS.filter(p => S.periods.includes(p.k)); // 설정에서 고른 시간대 (기본: 아침·낮·저녁)
const periodic = m => !m.when;
const periodLabel = k => (PERIODS.find(p => p.k === k) || {}).label || '';
function dayInfo(i, mode = cur(), hrs = null){
  const W = wx(); if (!W || !W.D[i]) return null;
  const Dd = W.D[i], [h0, h1] = hrs || hoursOf(mode);
  const hs = W.H.filter(x => x.date === Dd.date && x.hour >= h0 && x.hour <= h1);
  if (!hs.length) return null;
  const ag = agg(hs);
  const raw = ag.a;
  const pen = ag.mm >= 1 ? 2 : ag.mm >= 0.2 ? 1 : 0; // 비에 젖으면 더 춥게
  return { ...ag, i, date: Dd.date, hs, h0, h1, raw, pen, base: Math.round(raw - pen),
    amin: Math.round(Math.min(...hs.map(x => x.a))), amax: Math.round(Math.max(...hs.map(x => x.a))),
    chill: ag.temp - ag.a, rainHours: hs.filter(x => x.mm >= 0.1).map(x => x.hour),
    tmin: Dd.tmin, tmax: Dd.tmax, uv: Dd.uv, sky: sky({...ag, day: hrs ? ag.day : 1}), D: Dd,
    now: i === 0 ? W.nowTemp : null, models: ag.models, ...extraInfo(W, i, hs, h0, h1, Dd) };
}
// 습도·미세먼지·일출일몰·전날과 비교
function extraInfo(W, i, hs, h0, h1, Dd){
  const vals = k => hs.map(x => x[k]).filter(v => v != null);
  const mean = k => { const v = vals(k); return v.length ? Math.round(avg(v)) : null; };
  const mx = k => { const v = vals(k); return v.length ? Math.round(Math.max(...v)) : null; };
  const prev = (i === 0 ? W.Y : W.H.filter(x => x.date === W.D[i - 1].date)).filter(x => x.hour >= h0 && x.hour <= h1 && x.am != null);
  const curA = hs.filter(x => x.am != null);
  return { rh: mean('rh'), pm10: mean('pm10'), pm10max: mx('pm10'), pm25: mean('pm25'), pm25max: mx('pm25'), dust: mx('dust'), o3: mx('o3'),
    vsPrev: prev.length >= 3 && curA.length ? Math.round(avg(curA.map(x => x.am)) - avg(prev.map(x => x.am))) : null,
    prevLabel: i === 0 ? '어제' : i === 1 ? '오늘' : '전날', sunrise: Dd.sunrise, sunset: Dd.sunset };
}
const aqGrade = (v, t) => v == null ? null : t === 'pm10' ? (v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4) : (v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4);
const AQ_NAME = ['', '좋음', '보통', '나쁨', '매우 나쁨'];
const uvLevel = u => u == null ? null : u <= 2 ? [1, '낮음'] : u <= 5 ? [2, '보통'] : u <= 7 ? [3, '높음'] : u <= 10 ? [4, '매우 높음'] : [4, '위험'];
const worstAQ = info => Math.max(aqGrade(info.pm10max, 'pm10') || 0, aqGrade(info.pm25max, 'pm25') || 0);
const isToday = info => info && info.date === todayStr();

/* ================== 체감 브리핑 ================== */
function feelBand(t){
  return t <= -5 ? 'vcold' : t <= 3 ? 'cold' : t <= 9 ? 'chilly' : t <= 15 ? 'cool' : t <= 21 ? 'mild' : t <= 26 ? 'warm' : t <= 30 ? 'hot' : 'vhot';
}
function feelDaga(t){ // 쌀쌀하다가, 춥다가 …
  return t <= -5 ? '아주 춥다가' : t <= 3 ? '춥다가' : t <= 9 ? '쌀쌀하다가' : t <= 15 ? '선선하다가' : t <= 21 ? '포근하다가' : t <= 26 ? '따뜻하다가' : t <= 30 ? '덥다가' : '무덥다가';
}
function feelWord(t){
  return t <= -5 ? '아주 추워요' : t <= 3 ? '추워요' : t <= 9 ? '쌀쌀해요' : t <= 15 ? '선선해요' :
    t <= 21 ? '포근해요' : t <= 26 ? '따뜻해요' : t <= 30 ? '더워요' : '무더워요';
}
function briefing(info, mode){
  const span = info.h1 - info.h0 + 1, snowy = info.snow >= 0.5, w = snowy ? '눈' : '비';
  let cond;
  if (info.rainHours.length){
    const s = info.rainHours[0], e = info.rainHours[info.rainHours.length - 1] + 1;
    cond = info.rainHours.length >= span * 0.7 ? say(snowy ? PH.snowAll : PH.rainAll, 'cond.all') :
      say(snowy ? PH.snowAt : PH.rainAt, 'cond.at', {r: e > info.h1 ? `${fmtHour(s)}부터` : fmtRange(s, e)});
  } else if (info.w >= 8) cond = say(PH.windy, 'cond.wind');
  else cond = PH.sky[info.sky.label] ? say(PH.sky[info.sky.label], 'cond.sky') : '';
  const items = [];

  // 체감온도 흐름
  const pts = [info.hs[0], info.hs[Math.floor(info.hs.length / 2)], info.hs[info.hs.length - 1]];
  const flow = [...new Map(pts.map(x => [x.hour, x])).values()].map(x => `${fmtHour(x.hour)} ${Math.round(x.a)}°`).join(' → ');
  items.push(['🌡️', `체감 ${flow}` + (info.amax - info.amin >= 8 ? ' · <b>일교차 커요, 벗기 쉬운 겉옷</b>' : '')]);

  // 비·눈
  if (info.mm >= 0.1){
    const adv = snowy ? '미끄럼 조심' : info.mm < 1 ? '작은 우산' : info.mm < 5 ? '우산 챙기기' : '우산 + 방수 신발';
    items.push([snowy ? '🌨️' : '🌧️', `${w} ${snowy ? r1(info.snow) + 'cm' : r1(info.mm) + 'mm'} (시간당 최대 ${r1(info.mmMax)}mm)${mode.when ? '' : ` · <b>${adv}</b>`}` +
      (info.pen ? ` · 젖으면 추워서 ${info.pen}° 더 춥게 잡았어요` : '')]);
  } else if (info.p >= 40) items.push(['🌂', `비 올 확률 ${info.p}% · 작은 우산 있으면 안심`]);

  // 바람
  if (info.w >= 4){
    const word = info.w >= 10 ? '아주 강한 바람' : info.w >= 7 ? '강한 바람' : '조금 부는 바람';
    items.push(['💨', `${word} ${Math.round(info.w)}m/s` + (info.g >= info.w + 4 ? ` (돌풍 ${Math.round(info.g)})` : '') +
      (info.chill >= 1.5 ? ` · 실제 기온 ${Math.round(info.temp)}°보다 <b>${Math.round(info.chill)}° 춥게</b> 느껴져요` : '') +
      (mode.windy && info.w >= 5 ? ' · 바람막이 필수' : '')]);
  }
  if (info.uv >= 6 && info.h0 < 16) items.push(['☀️', say(PH.uvHigh, 'uv', {u: Math.round(info.uv)})]);
  const g = worstAQ(info);
  if (g >= 4) items.push(['😷', say(PH.aq.vbad, 'aq.vb', {pm25: info.pm25max ?? '–'})]);
  else if (g === 3) items.push(['😷', say(PH.aq.bad, 'aq.b', {g: AQ_NAME[3], pm25: info.pm25max ?? '–'})]);
  else if (g === 1 && (aqGrade(info.pm25max, 'pm25') || 0) === 1) items.push(['🍃', say(PH.aq.good, 'aq.g')]);
  if ((info.dust || 0) >= 80) items.push(['🌪️', say(PH.aq.dust, 'aq.d', {d: info.dust})]);
  if (info.amax >= 33) items.push(['🥵', say(PH.special.heat, 'sp.h', {t: info.amax})]);
  else if (info.base >= 30) items.push(['🥵', say(PH.special.hot, 'sp.ho')]);
  if (info.tmin >= 25) items.push(['🌙', say(PH.special.tropical, 'sp.tr', {t: info.tmin})]);
  if (info.tmin <= -12) items.push(['🥶', say(PH.special.coldwave, 'sp.cw', {t: info.tmin})]);
  if (info.rh != null && info.rh <= 30) items.push(['🏜️', say(PH.special.dry, 'sp.dr', {h: info.rh})]);
  else if (info.rh != null && info.rh >= 80 && info.base >= 24) items.push(['💦', say(PH.special.humid, 'sp.hu', {h: info.rh})]);
  if (mode.id === 'daily' && isToday(info)){
    const dow = new Date().getDay(), arr = PH.dow[dow];
    if (arr && (window.VSEED.length % 2 === 0)) items.push(['🗓️', say(arr, 'dow')]);
  }
  mode.tips(info).forEach(t => { const k = t.indexOf(' '); items.push([t.slice(0, k), t.slice(k + 1)]); });
  if (info.spread >= 4) items.push(['🤔', '예보끼리 차이가 커요 · <b>한 겹 더 챙기면 안심</b>']);
  if (info.i >= 7) items.push(['📅', '먼 날짜라 예보가 바뀔 수 있어요 · 가까워지면 다시 확인해 주세요']);
  const feel = say(PH.feel[feelBand(info.base)], 'feel');
  return { headline: cond ? say(PH.headJoin, 'hj', {f: feel, c: cond}) : feel, items };
}

// 비·눈이 기준 이상이면 우산 알림
// 비: 1mm 이상 또는 확률 60% 이상 → 꼭 챙기기 / 0.1mm 이상 또는 40% 이상 → 작은 우산
// 눈: 0.5cm 이상 → 우산 + 미끄럼 주의 (3cm 이상이면 방한화)
function umbrellaAlert(info, mode){
  const hrs = info.rainHours || [];
  const when = hrs.length && hrs.length < (info.h1 - info.h0 + 1) * 0.7
    ? `${fmtRange(hrs[0], hrs[hrs.length - 1] + 1)} ` : hrs.length ? '하루 종일 ' : '';
  const kid = mode && mode.kid ? ' · 아이는 <b>우비·장화</b>' : '';
  if (info.snow >= 0.5)
    return {lv: 2, html: say(PH.umb.snow, 'umb.s', {d: `${when}눈 ${r1(info.snow)}cm · ${info.snow >= 3 ? '<b>미끄럼 주의, 방한화</b>' : '미끄럼 주의'}`}) + kid};
  if (info.mm >= 1 || info.p >= 60)
    return {lv: 2, html: say(PH.umb.rain, 'umb.r', {d: (info.mm >= 0.1 ? `${when}비 ${r1(info.mm)}mm` : `비 올 확률 ${info.p}%`) + (info.mm >= 10 ? ' · <b>방수 신발</b>' : '')}) + kid};
  if (info.mm >= 0.1 || info.p >= 40)
    return {lv: 1, html: say(PH.umb.light, 'umb.l', {d: info.mm >= 0.1 ? `${when}비 조금 (${r1(info.mm)}mm)` : `비 올 확률 ${info.p}%`}) + kid};
  return null;
}
// 운동별 비·눈·바람 판단 (취소 추천 등). 강수는 활동 시간대의 '시간당 최대' 기준
function sportAlert(info, mode){
  const mx = info.mmMax || 0, tot = info.mm || 0, sn = info.snow || 0, p = info.p || 0, w = info.w || 0;
  const T = (lv, arr, key, v = {}) => ({lv, html: say(arr, 'sa.' + key, {x: r1(mx), t: r1(tot), s: r1(sn), p, w: Math.round(w), m: mode.name, ...v})});
  if (info.code >= 95) return T(3, PH.sport.thunder, 'th');
  const P = PH.sport[mode.id];
  switch (mode.id){
    case 'golf':
      if (sn >= 0.5) return T(3, P.stopSnow, 'g1');
      if (mx > 2) return T(3, P.stopRain, 'g2');
      if (mx >= 0.1) return T(2, P.umb, 'g3');
      if (p >= 60) return T(2, P.prob, 'g4');
      if (p >= 40) return T(1, P.maybe, 'g5');
      if (w >= 10) return T(1, P.windy, 'g6');
      break;
    case 'running':
      if (sn >= 0.5) return T(3, P.stopSnow, 'r1');
      if (mx >= 3) return T(3, P.stopRain, 'r2');
      if (mx >= 0.5) return T(2, P.rain, 'r3');
      if (mx >= 0.1 || p >= 50) return T(1, P.drizzle, 'r4');
      break;
    case 'hiking':
      if (mx >= 1 || tot >= 5) return T(3, P.stopRain, 'h1');
      if (sn >= 0.5) return T(2, P.snow, 'h2');
      if (mx >= 0.1 || p >= 50) return T(2, P.rain, 'h3', {d: mx >= 0.1 ? '비 ' + r1(tot) + 'mm' : '비 올 확률 ' + p + '%'});
      if (w >= 10) return T(2, P.windTop, 'h4');
      break;
    case 'cycling':
      if (sn >= 0.1) return T(3, P.stopSnow, 'c1');
      if (mx >= 0.5) return T(3, P.stopRain, 'c2');
      if (mx >= 0.1 || p >= 50) return T(2, P.wet, 'c3');
      if (w >= 8) return T(2, P.windStop, 'c4');
      break;
    case 'tennis':
      if (mx >= 0.2 || tot >= 0.5) return T(3, P.stopRain, 't1');
      if (p >= 60) return T(2, P.prob, 't2');
      if (w >= 7) return T(1, P.windy, 't3');
      break;
  }
  return null;
}
function periodLine(inf){
  const parts = [`<b>${feelWord(inf.base)}</b>`];
  if (inf.mm >= 0.1){
    const sn = inf.snow >= 0.3;
    parts.push(`${sn ? '눈 ' + r1(inf.snow) + 'cm' : '비 ' + r1(inf.mm) + 'mm'} · ${inf.mm >= 1 ? '<b>우산</b>' : '작은 우산'}`);
  } else if (inf.p >= 40) parts.push(`비 확률 ${inf.p}%`);
  else parts.push(inf.sky.label);
  if (inf.w >= 4) parts.push(`바람 ${Math.round(inf.w)}m/s` + (inf.chill >= 1.5 ? ` (${Math.round(inf.chill)}° 더 춥게)` : ''));
  if (inf.pen) parts.push(`비 감안 −${inf.pen}°`);
  return parts.join(' · ');
}
// 시간 흐름에 따라 느껴질 체감 (아침→낮→저녁)
function flowBrief(PP, infos){
  const n = infos.length, b = infos.map(x => x.base), out = [], F = PH.flow;
  if (n < 2) return out;
  const mx = Math.max(...b), mn = Math.min(...b), iMax = b.indexOf(mx), L = j => PP[j].label;
  if (iMax > 0 && mx - b[0] >= 5)
    out.push(['🌡️', say(F.riseBig, 'f.rb', {a: L(0), at: b[0], b: L(iMax), bt: mx, d: mx - b[0], daga: feelDaga(b[0])})]);
  else if (iMax > 0 && mx - b[0] >= 3) out.push(['🌡️', say(F.riseSmall, 'f.rs', {a: L(0), b: L(iMax), d: mx - b[0]})]);
  if (iMax === 0 && mx - b[n - 1] >= 4)
    out.push(['📉', say(F.dropAll, 'f.da', {a: L(0), at: mx, c: L(n - 1), ct: b[n - 1], d: mx - b[n - 1]})]);
  else if (iMax < n - 1 && mx - b[n - 1] >= 4)
    out.push(['🌇', say(F.fall, 'f.fa', {b: L(iMax), bt: mx, c: L(n - 1), ct: b[n - 1], d: mx - b[n - 1]})]);
  if (mx - mn <= 2) out.push(['🌡️', say(F.flat, 'f.fl', {mn, mx})]);
  for (let j = 1; j < n; j++) if (infos[j].w >= 5 && infos[j].w - infos[j - 1].w >= 3){
    out.push(['💨', say(F.windUp, 'f.wu', {p: L(j), w: Math.round(infos[j].w)})]); break; }
  const wetI = infos.map(x => x.mm >= 0.1);
  for (let j = 1; j < n; j++){
    if (wetI[j] && !wetI[j - 1]){ out.push(['🌧️', say(F.rainStart, 'f.rst', {p: L(j)})]); break; }
    if (!wetI[j] && wetI[j - 1]){ out.push(['🌤️', say(F.rainEnd, 'f.ren', {p: L(j)})]); break; }
  }
  const mid = infos[PP.findIndex(p => p.k === 'pm')];
  if (mid && clearSky(mid) && mid.uv >= 4 && mid.base >= 12) out.push(['☀️', say(F.sunWarm, 'f.sun')]);
  else if (infos.every(x => x.sky.label === '흐림') && mx <= 12) out.push(['☁️', say(F.overcastCold, 'f.oc')]);
  if (mx <= 5) out.push(['🏠', say(F.indoorWarm, 'f.iw')]);
  else if (mn >= 27) out.push(['🏠', say(F.indoorCool, 'f.ic')]);
  return out.slice(0, 5);
}
// 옷차림 한 줄 정리 (겉옷·상의·하의를 넘어 전체 요약)
function totalBrief(mode, infos, cols, PP, umb, main){
  const lines = [], b = infos.map(x => x.base), mx = Math.max(...b), mn = Math.min(...b), L = j => PP ? PP[j].label : '', T = PH.total;
  let mainTxt;
  if (PP && cols){
    const lv = cols.map(c => c.lv), varying = lv.some(x => x.outer !== lv[0].outer || x.top !== lv[0].top);
    const maxO = Math.max(...lv.map(x => x.outer)), O = mode.levels.outer;
    // 벗어서 들고 다니기 쉬운 가벼운 겉옷 예시 (두꺼운 단계부터 찾아 내려가요)
    const LIGHT = /경량|가디건|자켓|바람막이|조끼|베스트|집업|후리스|플리스|점퍼|셔츠/;
    const ex = [...new Set([maxO, maxO - 1, maxO - 2].filter(k => k >= 1).flatMap(k => O[k].ex).filter(n => LIGHT.test(n)))].slice(0, 2).join('·');
    const lo = b.indexOf(mn), hi = b.indexOf(mx);
    if (varying || mx - mn >= 5)
      mainTxt = say(T.vary, 't.v', {lo: L(lo), hi: L(hi), lot: mn, hit: mx, d: mx - mn, easy: ex ? say(T.easy, 't.e', {ex}) : ''});
    else if (mx <= 5) mainTxt = say(T.cold, 't.c');
    else if (mn >= 26) mainTxt = say(T.hot, 't.h');
    else mainTxt = say(T.same, 't.s', {o: O[lv[0].outer].n, t: mode.levels.top[lv[0].top].n});
    let lighter = false, warmer = false;
    for (let j = 1; j < lv.length; j++){
      const a = lv[j - 1], c = lv[j];
      if (!lighter && (c.outer < a.outer || c.top < a.top)){ lighter = true; lines.push(say(T.lighter, 't.li', {p: L(j)})); }
      else if (!warmer && (c.outer > a.outer || c.top > a.top)){ warmer = true; lines.push(say(T.warmer, 't.wa', {p: L(j)})); }
    }
  } else {
    const i = infos[0], d = i.amax - i.amin, v = {mn: i.amin, mx: i.amax, d};
    mainTxt = d >= 5 ? say(T.sportVary, 't.sv', v) : say(T.sportFlat, 't.sf', v);
    if (T.sport[mode.id]) lines.push(say(T.sport[mode.id], 't.sp'));
  }
  if (infos.some(x => x.w >= 7)) lines.push(say(T.wind, 't.wi'));
  if (mode.kid) lines.push(say(T.kid, 't.k'));
  const yl = main && yesterdayLine(mode, main); if (yl) lines.unshift(yl);
  if (umb) lines.unshift({stop: umb.lv === 3, html: umb.html});
  const bring = bringList(mode, infos, umb, cols);
  return `<div class="total"><div class="tt">💡 옷차림 한 줄 정리</div><div>${mainTxt}</div>` +
    (bring.length ? `<div class="bring"><span style="border:0;background:none;padding-left:0">🎒 챙길 것</span>${bring.map(b => `<span>${b}</span>`).join('')}</div>` : '') +
    (lines.length ? `<ul>${lines.map(l => typeof l === 'string' ? `<li>${l}</li>` : `<li class="${l.stop ? 'stop' : 'umbl'}">${l.html}</li>`).join('')}</ul>` : '') + '</div>';
}
// 어제 입은 기록과 비교한 한 줄
function yesterdayLine(mode, main){
  if (!isToday(main) || main.vsPrev == null) return null;
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const r = S.records.find(x => x.date === ymd(yd) && x.mode === mode.id);
  const n = Math.abs(main.vsPrev), Y = PH.yrec;
  if (!r) return null;
  const lv = levelsText(mode, r.levels);
  if (r.rating === 'cold') return '🧣 ' + say(Y.wasCold, 'yr.c');
  if (r.rating === 'hot') return '🌬️ ' + say(Y.wasHot, 'yr.h');
  if (main.vsPrev <= -3) return '📉 ' + say(Y.colder, 'yr.co', {n, lv});
  if (main.vsPrev >= 3) return '📈 ' + say(Y.warmer, 'yr.wa', {n, lv});
  if (r.rating === 'good') return '😊 ' + say(Y.goodSame, 'yr.g', {lv});
  return null;
}
// 챙길 것
function bringList(mode, infos, umb, cols){
  const out = [], has = s => out.includes(s), add = s => { if (!has(s)) out.push(s); };
  const all = infos.filter(Boolean), mxB = Math.max(...all.map(x => x.base)), mnB = Math.min(...all.map(x => x.base));
  if (umb && umb.lv >= 2) add(all.some(x => x.snow >= 0.5) ? '☂️ 우산 · 🥾 미끄럼 방지 신발' : '☂️ 우산');
  else if (umb) add('🌂 작은 우산');
  if (all.some(x => x.mm >= 5)) add(mode.kid ? '👢 장화·우비' : '👟 방수 신발');
  const g = Math.max(...all.map(worstAQ));
  if (g >= 4) add('😷 KF94 마스크'); else if (g === 3) add('😷 마스크');
  if (all.some(x => x.uv >= 6 && x.h0 < 16)) add('🧴 선크림');
  if (all.some(x => clearSky(x) && x.uv >= 5 && x.h0 < 16)) add('🕶️ 선글라스');
  if (mxB >= 28) { add('💧 물'); add(mode.kid ? '🧢 모자' : '🧢 모자·양산'); }
  if (mnB <= 0) add('🧤 장갑');
  if (mnB <= -5) add('♨️ 핫팩');
  if (cols && cols.some(c => c.lv.extra >= 1) && mnB <= 5) add('🧣 목도리');
  if (all.length > 1 && mxB - mnB >= 7) add('🧥 걸칠 겉옷');
  if (all.some(x => x.rh != null && x.rh <= 35)) add('💄 립밤·보습');
  if (mode.kid) add('👕 여벌 옷');
  return out.slice(0, 7);
}
function periodBriefing(main, infos, mode){
  const br = briefing(main, mode);
  const bases = infos.map(x => x.base);
  const common = br.items.filter(([e]) => !['🌡️','🌧️','🌨️','🌂','💨'].includes(e));
  return { headline: br.headline, flow: flowBrief(PS(), infos), lines: infos.map((inf, j) => ({label: PS()[j].label, base: inf.base, kind: inf.sky.kind, text: periodLine(inf)})), items: common };
}

/* ================== 추천 (두께 단계) ================== */
function shift(mode, lv, dir){
  const o = {...lv};
  if (dir > 0){
    if (o.outer < maxLv(mode,'outer')) o.outer++; else if (o.top < maxLv(mode,'top')) o.top++; else if (o.extra < maxLv(mode,'extra')) o.extra++;
  } else if (dir < 0){
    if (o.outer > 0) o.outer--; else if (o.top > 0) o.top--; else if (o.bottom > 0) o.bottom--;
  }
  return o;
}
function recommend(mode, t){
  const def = lvFromArr(ruleOf(mode, t));
  const recs = S.records.filter(r => r.mode === mode.id && r.levels && typeof r.temp === 'number');
  const now = Date.now();
  // 추웠던 날은 한 단계 따뜻하게, 더웠던 날은 한 단계 가볍게 고친 값을 '정답'으로 학습
  const near = recs.map(r => {
    const d = Math.abs(r.temp - t), age = (now - new Date(r.date + 'T12:00')) / 864e5;
    const target = r.rating === 'cold' ? shift(mode, r.levels, 1) : r.rating === 'hot' ? shift(mode, r.levels, -1) : r.levels;
    const w = (1 / (1 + d)) * Math.exp(-Math.min(age, 730) / 180) * (r.rating === 'good' ? 1.5 : r.rating ? 1.1 : 0.7);
    return {r, d, w, target};
  }).filter(c => c.d <= 4);

  if (near.length){
    const W0 = 0.5, sw = near.reduce((s,c) => s + c.w, 0), lv = {};
    for (const c of CATS) lv[c.k] = Math.max(0, Math.min(maxLv(mode, c.k),
      Math.round((near.reduce((s,n) => s + n.w * n.target[c.k], 0) + W0 * def[c.k]) / (sw + W0))));
    const best = near.filter(n => n.r.rating === 'good').sort((a,b) => b.w - a.w)[0];
    return { lv, mine: true,
      why: say(PH.why.mine, 'w.m', {n: near.length}) + (best ? say(PH.why.best, 'w.b', {d: fmtDate(best.r.date), t: best.r.temp}) : '') };
  }
  const rated = recs.filter(r => r.rating).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
  const b = avg(rated.map(r => r.rating === 'cold' ? 1 : r.rating === 'hot' ? -1 : 0));
  if (rated.length >= 3 && Math.abs(b) >= 0.4)
    return { lv: shift(mode, def, Math.sign(b)), mine: true,
      why: b > 0 ? say(PH.why.coldy, 'w.c') : say(PH.why.hoty, 'w.h') };
  return { lv: def, mine: false,
    why: say(recs.length ? PH.why.defSome : PH.why.def, 'w.d', {m: mode.name}) };
}

/* ================== 렌더: 오늘 ================== */
let day = 0, variant = 0, shown = null, shownTemp = null, period = null;
function defaultPeriod(){
  const PP = PS();
  if (day !== 0) return Math.max(0, PP.findIndex(p => p.k === 'am'));
  const h = new Date().getHours(), i = PP.findIndex(p => h <= p.h[1]); // 지금 이후 가장 가까운 시간대
  return i < 0 ? PP.length - 1 : i;
}

function renderModes(){
  $('#modes').innerHTML = S.modes.map(id => { const m = MODE[id];
    return `<button class="mode ${id===S.mode?'on':''}" data-m="${id}">${m.emoji} ${esc(shortName(m))}</button>`; }).join('') +
    `<button class="mode add" id="addMode">＋ ${S.modes.length < 2 ? '운동복 · 아이옷' : '추가'}</button>`;
}

function renderDays(W){
  $('#days').innerHTML = W.D.map(d => {
    const dt = new Date(d.date + 'T00:00');
    const name = d.i === 0 ? '오늘' : d.i === 1 ? '내일' : WD[dt.getDay()];
    return `<button class="dchip ${d.i===day?'on':''} ${dt.getDay()===0?'sun':dt.getDay()===6?'sat':''}" data-d="${d.i}">
      <span class="dn">${name}</span><span class="dd">${dt.getDate()}</span>${wxIcon(d.sky.kind, 30)}
      <span class="dt">${d.tmin}° <b>${d.tmax}°</b></span></button>`;
  }).join('');
  const on = $('#days .dchip.on'); if (on && !renderDays.done){ renderDays.done = true; on.scrollIntoView({inline:'center', block:'nearest'}); }
}

function render(){
  const mode = cur(), W = wx();
  renderLocs();
  $('#setLocName').textContent = S.loc ? S.loc.full || S.loc.name : '없음';
  renderModes();
  $('#whenTabs').hidden = true;
  if (W && day >= W.D.length) day = 0;
  const info = W && dayInfo(day);
  if (!info){
    $('#days').innerHTML = ''; $('#heroDate').textContent = '';
    $('#bigTemp').innerHTML = '–°'; $('#heroIcon').innerHTML = wxIcon('partly-day', 84); $('#skyLabel').textContent = '';
    $('#heroSub').textContent = S.loc ? '날씨를 불러오는 중이에요' : '위에서 위치를 설정해 주세요';
    $('#brief').innerHTML = ''; $('#recCard').hidden = true; $('#fcCard').hidden = true;
    renderRate(); renderInstall(); return;
  }
  renderDays(W);
  $('#recCard').hidden = false; $('#fcCard').hidden = false;
  document.documentElement.style.setProperty('--h', hueOf(info.base).toFixed(0));

  // 문구 선택 기준: 날짜·지역·종류·시간대가 같으면 같은 문구, 바뀌면 다른 문구
  VSEED = `${info.date}|${S.locSel}|${mode.id}|${whenOf(mode) || ''}`;
  // 히어로
  const dt = new Date(info.date + 'T00:00'), P = periodic(mode);
  const PP = PS();
  const infos = P ? PP.map(p => dayInfo(day, mode, p.h)) : null;
  if (P && infos.some(x => !x)) return; // 데이터 부족
  if (period == null || period >= PP.length) period = defaultPeriod();
  const sel = P ? infos[period] : info;
  $('#heroDate').innerHTML = `${day === 0 ? '오늘' : day === 1 ? '내일' : ''} ${dt.getMonth()+1}월 ${dt.getDate()}일 (${WD[dt.getDay()]})`.trim() +
    `<span class="addr">📍 ${esc(S.loc.full || S.loc.name)}</span>`;
  $('#heroIcon').innerHTML = wxIcon(sel.sky.kind, 84);
  $('#skyLabel').textContent = sel.sky.label;
  $('#bigTemp').innerHTML = `${sel.base}°<small>${P ? PP[period].label + ' ' : mode.when ? WHEN[whenOf(mode)].label + ' ' : ''}체감${sel.pen ? ` · 비 감안 −${sel.pen}°` : ''}</small>`;
  $('#heroSub').textContent = `최저 ${info.tmin}° · 최고 ${info.tmax}°` + (info.now != null ? ` · 지금 ${info.now}°` : '');
  const vs = info.vsPrev;
  $('#vsY').hidden = vs == null;
  if (vs != null) $('#vsY').textContent = (vs <= -2 ? '📉 ' : vs >= 2 ? '📈 ' : '↔️ ') +
    say(vs <= -2 ? PH.yday.colder : vs >= 2 ? PH.yday.warmer : PH.yday.same, 'yd', {n: Math.abs(vs), pv: info.prevLabel});
  const tileHTML = (inf, label, t, on, attr) => `<button class="pbtn ${on ? 'on' : ''}" ${attr}>
      <span class="pl">${label} <small>${t}</small></span>
      ${wxIcon(inf.sky.kind, 34)}<b>${inf.base}°</b>
      <span class="px">${inf.mm >= 0.1 ? '💧' + r1(inf.mm) + 'mm' : inf.p >= 40 ? '💧' + inf.p + '%' : ''}${inf.w >= 5 ? ' 💨' + Math.round(inf.w) : ''}&nbsp;</span></button>`;
  if (!P){ // 운동: 아침·낮·저녁(+새벽·밤) 중 운동 시간을 칸으로 골라요
    const SW = Object.entries(WHEN).filter(([k, w]) => !w.opt || S.periods.includes(k)), wk = whenOf(mode);
    $('#periods').hidden = false; $('#periods').className = `periods n${SW.length}`;
    $('#periods').innerHTML = SW.map(([k, w]) => { const inf = dayInfo(day, mode, w.h); return inf ? tileHTML(inf, w.label, w.t, k === wk, `data-w="${k}"`) : ''; }).join('');
  }
  if (P){ $('#periods').hidden = false; $('#periods').className = `periods n${PP.length}`; }
  if (P) $('#periods').innerHTML = infos.map((inf, j) => `<button class="pbtn ${j===period?'on':''}" data-p="${j}">
      <span class="pl">${PP[j].label} <small>${PP[j].t}</small></span>
      ${wxIcon(inf.sky.kind, 34)}<b>${inf.base}°</b>
      <span class="px">${inf.mm >= 0.1 ? '💧' + r1(inf.mm) + 'mm' : inf.p >= 40 ? '💧' + inf.p + '%' : ''}${inf.w >= 5 ? ' 💨' + Math.round(inf.w) : ''}&nbsp;</span></button>`).join('');
  const umb = mode.when ? (sportAlert(info, mode) || umbrellaAlert(info, mode)) : umbrellaAlert(info, mode);
  const umbHTML = umb ? `<div class="umb lv${umb.lv}">${umb.html}</div>` : '';
  if (P){
    const pb = periodBriefing(info, infos, mode);
    $('#brief').innerHTML = umbHTML + `<div class="headline">${pb.headline}</div>` +
      pb.lines.map(l => `<div class="pline"><span class="pll">${l.label}</span><span class="plt">${l.base}°</span><span>${l.text}</span></div>`).join('') +
      (pb.flow.length ? '<div class="bsep"></div><div class="bsub">⏱️ 시간에 따라 이렇게 느껴져요</div>' + pb.flow.map(([e, t]) => `<div class="bi"><span class="be">${e}</span><span>${t}</span></div>`).join('') : '') +
      (pb.items.length ? '<div class="bsep"></div>' : '') +
      pb.items.map(([e, t]) => `<div class="bi"><span class="be">${e}</span><span>${t}</span></div>`).join('');
  } else {
    const br = briefing(info, mode);
    $('#brief').innerHTML = umbHTML + `<div class="headline">${br.headline}</div>` +
      br.items.map(([e, t]) => `<div class="bi"><span class="be">${e}</span><span>${t}</span></div>`).join('');
  }

  // 추천
  const dayWord = day === 0 ? '오늘' : day === 1 ? '내일' : `${dt.getDate()}일`;
  $('#recTitle').textContent = `${dayWord} ${mode.id === 'daily' ? '' : mode.emoji + ' '}${mode.title}`;
  const varWhy = variant > 0 ? '추천보다 <b>한 단계 따뜻하게</b> 바꿔 봤어요' : '추천보다 <b>한 단계 가볍게</b> 바꿔 봤어요';
  const barsOf = (c, i, sm) => mode.levels[c.k].map((_, k) => k === 0 && c.none ? '' : `<i class="${k <= i ? 'on' : ''}" style="height:${(sm ? 6 : 8) + k * (sm ? 3 : 4)}px"></i>`).join('');
  let rec;
  if (P){
    const cols = infos.map(inf => { const r = recommend(mode, inf.base); return {r, inf, lv: variant ? shift(mode, r.lv, variant) : {...r.lv}}; });
    rec = cols[period].r; shown = cols[period].lv; shownTemp = cols[period].inf.base;
    const cats = CATS.filter(c => c.k !== 'extra' || cols.some(x => x.lv.extra));
    const tips = []; let lighter = false, warmer = false;
    for (let j = 1; j < cols.length; j++){
      const a = cols[j-1].lv, b = cols[j].lv;
      if (!lighter && (b.outer < a.outer || b.top < a.top)){ lighter = true; tips.push(`☀️ ${PP[j].label}엔 겉옷을 벗거나 가볍게 해도 돼요`); }
      else if (!warmer && (b.outer > a.outer || b.top > a.top)){ warmer = true; tips.push(`🌙 ${PP[j].label}엔 다시 쌀쌀해져요 · 겉옷 꼭 챙기기`); }
    }
    $('#recTotal').innerHTML = totalBrief(mode, infos, cols, PP, umb, info);
    $('#recWhy').innerHTML = variant ? varWhy : rec.why;
    $('#recRows').innerHTML = `<div class="pgrid n${PP.length}">
      <div class="pcol plab"><div class="ph"></div>${cats.map(c => `<div class="pc"><span class="ce">${c.e}</span>${c.label}</div>`).join('')}</div>
      ${cols.map((x, j) => `<button class="pcol ${j===period?'on':''}" data-p="${j}">
        <div class="ph"><b>${PP[j].label}</b><span>${x.inf.base}°</span></div>
        ${cats.map(c => `<div class="pc ${j && x.lv[c.k] !== cols[j-1].lv[c.k] ? 'chg' : ''}"><span class="bars sm">${barsOf(c, x.lv[c.k], true)}</span><b>${mode.levels[c.k][x.lv[c.k]].n}</b></div>`).join('')}
      </button>`).join('')}</div>
      <div class="pdetail"><b>${PP[period].label} 예시</b>${cats.map(c => { const L = mode.levels[c.k][shown[c.k]];
        return `<div>${c.e} ${c.label} <b>${L.n}</b>${L.ex.length ? ' · ' + L.ex.slice(0, 3).map(esc).join(', ') : ''}</div>`; }).join('')}</div>`;
  } else {
    rec = recommend(mode, info.base);
    shown = variant ? shift(mode, rec.lv, variant) : {...rec.lv}; shownTemp = info.base;
    $('#recTotal').innerHTML = totalBrief(mode, [info], null, null, umb, info);
    $('#recWhy').innerHTML = variant ? varWhy : rec.why;
    $('#recRows').innerHTML = CATS.filter(c => !(c.k === 'extra' && !shown.extra)).map(c => {
      const i = shown[c.k], L = mode.levels[c.k][i];
      return `<div class="row"><div class="row-label"><span class="ce">${c.e}</span>${c.label}</div>
        <div class="lvl"><div class="lvl-top"><span class="bars">${barsOf(c, i)}</span><b>${L.n}</b></div>
        ${L.ex.length ? `<div class="ex">${L.ex.slice(0, 3).map(esc).join(' · ')}</div>` : c.k === 'outer' ? '<div class="ex">겉옷 없이 괜찮아요</div>' : ''}</div></div>`;
    }).join('');
  }
  document.querySelectorAll('#variants button').forEach(b => b.classList.toggle('on', +b.dataset.v === variant));
  $('#recActions').hidden = !isToday(info);
  $('#woreBtn').innerHTML = P ? `👍 ${PP[period].label} 차림대로 입었어요` : '👍 이대로 입었어요';

  renderLife(info, mode);
  renderForecast(W, info);
  renderRate(); renderInstall();
  trackDaily(`mode/${mode.kid ? 'kid' : mode.id}`, `추천 확인: ${mode.kid ? '아이' : mode.name}`);
  trackDaily(`learned/${rec.mine ? 'yes' : 'no'}`, rec.mine ? '내 기록 기반 추천' : '기본 추천');
}

/* ---- 생활 정보 (미세먼지·자외선·습도·일출일몰·생활지수) ---- */
function renderLife(info, mode){
  const el = $('#lifeCard');
  if (!S.life){ el.hidden = true; return; }
  el.hidden = false;
  const g10 = aqGrade(info.pm10, 'pm10'), g25 = aqGrade(info.pm25, 'pm25'), uv = uvLevel(info.uv);
  const tm = iso => iso ? iso.slice(11, 16) : '–';
  const T = (k, v, s, g) => `<div class="lt"><div class="lk">${k}</div><div class="lv ${g ? 'g' + g : ''}">${v}</div><div class="ls">${s}</div></div>`;
  let hum;
  if (info.temp >= 22 && info.rh != null){
    const t = info.temp, di = 0.81 * t + 0.01 * info.rh * (0.99 * t - 14.3) + 46.3;
    const lv = di >= 80 ? [4, '매우 높음'] : di >= 75 ? [3, '높음'] : di >= 68 ? [2, '보통'] : [1, '낮음'];
    hum = T('불쾌지수', lv[1], `습도 ${info.rh}% · ${Math.round(di)}`, lv[0]);
  } else hum = T('습도', info.rh != null ? info.rh + '%' : '–', info.rh == null ? '' : info.rh <= 35 ? '건조해요' : info.rh >= 80 ? '습해요' : '적당해요', info.rh == null ? 0 : info.rh <= 35 ? 3 : info.rh >= 80 ? 3 : 2);
  // 생활지수
  const W = wx(), next = W && W.D[info.i + 1], wet = info.mm >= 0.5 || info.p >= 60, gAir = worstAQ(info);
  const idx = [];
  idx.push(wet ? ['👕', '빨래', '실내에서', '비 소식'] : info.rh >= 75 ? ['👕', '빨래', '보통', '잘 안 말라요'] : clearSky(info) ? ['👕', '빨래', '좋음', '햇볕 좋아요'] : ['👕', '빨래', '보통', '']);
  const nextWet = next && (next.mm >= 1 || next.p >= 60);
  idx.push(info.mm >= 1 || nextWet ? ['🚗', '세차', '미루세요', nextWet ? `${info.i === 0 ? '내일' : '다음 날'} 비` : '비 소식'] : (info.dust || 0) >= 80 ? ['🚗', '세차', '미루세요', '황사'] : ['🚗', '세차', '좋음', '']);
  idx.push(gAir >= 3 ? ['🚶', '산책', '실내 추천', '미세먼지'] : wet ? ['🚶', '산책', '우산 필수', ''] : info.base <= -5 || info.base >= 31 ? ['🚶', '산책', '짧게', info.base <= -5 ? '추워요' : '더워요'] : info.base >= 8 && info.base <= 26 && info.w < 6 ? ['🚶', '산책', '좋음', ''] : ['🚶', '산책', '보통', '']);
  const swing = info.tmax - info.tmin;
  if (swing >= 10 || (info.base <= 0 && (info.rh ?? 100) <= 45)) idx.push(['🤧', '감기', '주의', swing >= 10 ? `일교차 ${swing}°` : '춥고 건조']);
  el.innerHTML = `<h2 style="font-size:17px;margin-bottom:10px">🌫️ 생활 정보</h2><div class="life">
    ${T('미세먼지', g10 ? AQ_NAME[g10] : '–', info.pm10 != null ? `PM10 ${info.pm10}㎍/㎥` : '5일 이후는 예보 없음', g10)}
    ${T('초미세먼지', g25 ? AQ_NAME[g25] : '–', info.pm25 != null ? `PM2.5 ${info.pm25}㎍/㎥` : '', g25)}
    ${T('자외선', uv ? uv[1] : '–', info.uv != null ? `지수 ${Math.round(info.uv)}` : '', uv ? uv[0] : 0)}
    ${hum}
    ${T('일출', tm(info.sunrise), '🌅', 0)}${T('일몰', tm(info.sunset), '🌇', 0)}
  </div><div class="lidx">${idx.map(([e, k, v, r]) => `<span>${e} ${k} ${v}${r ? ` <small>· ${r}</small>` : ''}</span>`).join('')}</div>`;
}

/* ---- 예보: 시간별 / 날짜별 ---- */
function renderForecast(W, info){
  document.querySelectorAll('#fcTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === S.fcTab));
  if (S.fcTab === 'daily') return renderDaily(W);
  // 오늘은 지금부터 24시간, 다른 날은 그날 0시부터 24시간 · 간격은 설정에서 (1·2·3시간)
  const mode = cur(), STEP = S.fcStep[stepGroup(mode)] || 3, [a0, a1] = hoursOf(mode);
  let start;
  if (day === 0){
    const nowH = +W.nowT.slice(11, 13);
    start = W.H.findIndex(x => x.date === W.today && x.hour === Math.floor(nowH / STEP) * STEP);
  } else start = W.H.findIndex(x => x.date === info.date && x.hour === 0);
  if (start < 0) start = 0;
  const slots = [];
  for (let k = start; k < W.H.length && slots.length < 24 / STEP; k += STEP) slots.push({h: W.H[k], ag: agg(W.H.slice(k, k + STEP))});
  // 운동은 고른 활동 시간을 강조
  const isAct = h => mode.when && h.date === info.date && h.hour + STEP - 1 >= a0 && h.hour <= a1;
  const maxMm = Math.max(2, ...slots.map(s => s.ag.mm));
  const cols = slots.map((s, j) => {
    const {h, ag} = s, sk = sky(ag);
    const dt = new Date(h.date + 'T00:00');
    const label = j === 0 && day === 0 ? '지금' : h.hour === 0 ? `<b>${h.date === W.D[1]?.date ? '내일' : WD[dt.getDay()] + ' ' + dt.getDate() + '일'}</b>` : `${h.hour}시`;
    const rainTxt = ag.mm >= 0.1 ? (ag.mm >= 10 ? Math.round(ag.mm) : r1(ag.mm)) : ag.p >= 30 ? `<span class="pp">${ag.p}%</span>` : '<span class="dim0">–</span>';
    const windCls = ag.w >= 8 ? 'strong' : ag.w >= 5 ? 'mid' : '';
    return `<div class="hcol ${h.hour === 0 && j ? 'nd' : ''} ${isAct(h) ? 'act' : ''}">
      <div class="ht">${label}</div>
      <div class="hi">${wxIcon(sk.kind, 36)}</div>
      <div class="hs">${sk.label}</div>
      <div class="ha" style="--th:${hueOf(ag.a).toFixed(0)}">${Math.round(ag.a)}°</div>
      <div class="hr"><i style="height:${Math.min(22, ag.mm / maxMm * 22).toFixed(1)}px"></i><span>${rainTxt}</span>${ag.mm >= 0.1 && ag.p ? `<small>${ag.p}%</small>` : ''}</div>
      <div class="hw ${windCls}"><span class="arr" style="transform:rotate(${(ag.dir + 180) % 360}deg)">↑</span>${Math.round(ag.w)}</div>
    </div>`;
  }).join('');
  $('#fcBody').innerHTML = `<div class="hwrap">
    <div class="hlab"><div class="ht"></div><div class="hi"></div><div class="hs"></div><div class="ha">체감</div><div class="hr">강수<small>mm</small></div><div class="hw">바람<small>m/s</small></div></div>
    <div class="hscroll">${cols}</div></div>
    <div class="fcnote">${STEP}시간 단위 · 강수량은 ${STEP === 1 ? '시간당' : STEP + '시간 합계'}${mode.when ? ' · 색칠된 칸이 운동 시간' : ''} · 화살표는 바람이 부는 방향 · 간격은 설정에서</div>`;
  const act = $('#fcBody .hcol.act');
  if (act) $('#fcBody .hscroll').scrollLeft = Math.max(0, act.offsetLeft - $('#fcBody .hscroll').offsetLeft - 60);
}
const stepGroup = m => m.kid ? 'kid' : m.when ? 'sport' : 'daily';

function renderDaily(W){
  const lo = Math.min(...W.D.map(d => d.tmin)), hi = Math.max(...W.D.map(d => d.tmax)), span = Math.max(1, hi - lo);
  $('#fcBody').innerHTML = W.D.map(d => {
    const dt = new Date(d.date + 'T00:00');
    const name = d.i === 0 ? '오늘' : d.i === 1 ? '내일' : WD[dt.getDay()];
    const left = (d.tmin - lo) / span * 100, width = Math.max(6, (d.tmax - d.tmin) / span * 100);
    const extra = [d.mm >= 0.1 ? `💧 ${d.mm >= 10 ? Math.round(d.mm) : r1(d.mm)}mm${d.p ? ` · ${d.p}%` : ''}` : d.p >= 30 ? `💧 ${d.p}%` : '',
      d.w >= 5 ? `💨 ${d.w}m/s` : ''].filter(Boolean).join('  ');
    return `<button class="drow ${d.i===day?'on':''}" data-d="${d.i}">
      <div class="dname ${dt.getDay()===0?'sun':dt.getDay()===6?'sat':''}"><b>${name}</b><span>${dt.getMonth()+1}.${dt.getDate()}</span></div>
      ${wxIcon(d.sky.kind, 36)}
      <div class="dmid"><b>${d.sky.label}</b><span>${extra || '&nbsp;'}</span></div>
      <div class="drange"><span class="lo">${d.tmin}°</span><span class="bar"><i style="left:${left}%;width:${width}%;
        background:linear-gradient(90deg,hsl(${hueOf(d.tmin).toFixed(0)} 60% 75%),hsl(${hueOf(d.tmax).toFixed(0)} 60% 72%))"></i></span><span class="hi">${d.tmax}°</span></div>
    </button>`;
  }).join('') + `<div class="fcnote">기온은 실제 기온 · 먼 날짜일수록 정확도가 낮아요</div>`;
}

function renderRate(){
  const cutoff = ymd(new Date(Date.now() - 3*864e5)), t = todayStr(), hr = new Date().getHours();
  const r = S.records.filter(r => !r.rating && r.date >= cutoff && r.date <= t && MODE[r.mode])
    .filter(r => r.date !== t || hr >= (r.when ? WHEN[r.when].h[1] : 16))
    .sort((a,b) => b.date.localeCompare(a.date))[0];
  const el = $('#rateCard');
  if (!r || day !== 0){ el.hidden = true; return; }
  const m = MODE[r.mode];
  el.hidden = false;
  el.innerHTML = `<h2>${r.date === t ? '오늘' : fmtDate(r.date)} ${m.emoji} ${esc(shortName(m))} 옷차림 어땠어요?</h2>
    <div class="why" style="margin:0">${levelsText(m, r.levels)} (체감 ${r.temp}°)</div>
    <div class="rate-btns">${Object.entries({cold:'추웠어',good:'딱 좋아',hot:'더웠어'}).map(([k,v]) =>
      `<button data-r="${k}" data-id="${r.id}"><span class="e">${RATE[k]}</span>${v}</button>`).join('')}</div>`;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => track('install/android', '앱 설치 (안드로이드)'));
// 사용 중인 브라우저를 알아내서 맞춤 설치 안내
function detectBrowser(){
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const iosVer = ios ? parseFloat(((ua.match(/OS (\d+)[_.](\d+)/) || []).slice(1).join('.')) || '0') : 0;
  const ipad = /iPad/.test(ua) || (ios && !/iPhone|iPod/.test(ua));
  let app = 'other';
  if (/KAKAOTALK/i.test(ua)) app = 'kakao';
  else if (/NAVER\(inapp|NAVER\//.test(ua)) app = 'naver';
  else if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|BAND\//.test(ua)) app = 'inapp';
  else if (/SamsungBrowser/.test(ua)) app = 'samsung';
  else if (/Whale\//.test(ua)) app = 'whale';
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) app = 'edge';
  else if (/FxiOS|Firefox\//.test(ua)) app = 'firefox';
  else if (/CriOS|Chrome\//.test(ua)) app = 'chrome';
  else if (/Safari\//.test(ua)) app = 'safari';
  return { ios, android, ipad, iosVer, app, mobile: ios || android };
}
const BR = detectBrowser();
const BR_NAME = {kakao:'카카오톡', naver:'네이버 앱', inapp:'앱 안의 브라우저', samsung:'삼성 인터넷', whale:'웨일', edge:'Edge', firefox:'Firefox', chrome:'Chrome', safari:'Safari', other:'브라우저'};

function installGuide(){
  const b = BR, url = location.href.split('#')[0];
  const share = b.ipad ? '주소창 오른쪽 위 <b>공유 버튼(□↑)</b>' : '<b>공유 버튼(□↑)</b>';
  const iosAdd = [`${share}을 눌러요 <span class="sm">(안 보이면 <b>⋯</b> 버튼 → <b>공유</b>)</span>`,
    '목록을 아래로 내려 <b>홈 화면에 추가</b>를 눌러요', '오른쪽 위 <b>추가</b>를 누르면 끝!'];
  // 카카오톡·네이버 등 앱 안의 브라우저 → 진짜 브라우저로 열어야 해요
  if (['kakao','naver','inapp'].includes(b.app)){
    const target = b.ios ? 'Safari' : 'Chrome';
    const btn = b.app === 'kakao' ? {label:`${target}로 열기`, href:'kakaotalk://web/openExternal?url=' + encodeURIComponent(url)}
      : b.android ? {label:'Chrome으로 열기', href:`intent://${url.replace(/^https?:\/\//,'')}#Intent;scheme=https;package=com.android.chrome;end`} : null;
    return { title:`지금은 ${BR_NAME[b.app]} 안에서 열려 있어요`, lead:`홈 화면에 추가하려면 먼저 <b>${target}</b>로 열어야 해요.`, btn,
      steps: b.ios ? ['아래 버튼을 누르거나, 오른쪽 아래(또는 위) <b>⋯ / 공유</b> 버튼 → <b>Safari로 열기</b>', 'Safari에서 다시 이 안내를 따라 주세요']
                   : ['아래 버튼을 누르거나, 오른쪽 위 <b>⋮</b> 메뉴 → <b>다른 브라우저로 열기</b>', 'Chrome에서 다시 이 안내를 따라 주세요'] };
  }
  if (b.ios){
    if (b.app === 'safari') return { title:'Safari에서 홈 화면에 추가하기', steps: iosAdd };
    if (b.iosVer && b.iosVer < 16.4)
      return { title:`${BR_NAME[b.app]}에서는 홈 화면 추가가 안 돼요`, lead:'이 아이폰(iOS 16.4 미만)은 <b>Safari</b>에서만 추가할 수 있어요.',
        steps:['이 페이지 주소를 복사해요', '<b>Safari</b>에 붙여넣어 열어요', 'Safari에서 공유(□↑) → <b>홈 화면에 추가</b>'] };
    return { title:`${BR_NAME[b.app]}에서 홈 화면에 추가하기`,
      steps:[`주소창 오른쪽의 <b>공유 버튼(□↑)</b>을 눌러요 <span class="sm">(${b.app === 'firefox' ? '☰ 메뉴 → 공유' : '안 보이면 ⋯ 메뉴 → 공유'})</span>`,
        '<b>홈 화면에 추가</b>를 눌러요', '<b>추가</b>를 누르면 끝!'] };
  }
  if (b.android){
    if (b.app === 'samsung') return { title:'삼성 인터넷에서 홈 화면에 추가하기',
      steps:['아래쪽 <b>메뉴(≡)</b>를 눌러요', '<b>현재 페이지 추가</b> → <b>홈 화면</b>을 눌러요', '<b>추가</b>를 누르면 끝!'] };
    if (b.app === 'whale') return { title:'웨일에서 홈 화면에 추가하기', steps:['<b>메뉴(≡ 또는 ⋮)</b>를 눌러요', '<b>홈 화면에 추가</b>를 눌러요', '<b>추가</b>를 누르면 끝!'] };
    if (b.app === 'firefox') return { title:'Firefox에서 홈 화면에 추가하기', steps:['오른쪽 <b>⋮</b> 메뉴를 눌러요', '<b>홈 화면에 추가</b> (또는 <b>설치</b>)를 눌러요', '<b>추가</b>를 누르면 끝!'] };
    if (b.app === 'edge') return { title:'Edge에서 홈 화면에 추가하기', steps:['아래쪽 <b>⋯</b> 메뉴를 눌러요', '<b>휴대폰에 추가</b> (또는 <b>앱 설치</b>)를 눌러요', '<b>설치</b>를 누르면 끝!'] };
    return { title:'Chrome에서 홈 화면에 추가하기', steps:['오른쪽 위 <b>⋮</b> 메뉴를 눌러요', '<b>홈 화면에 추가</b> (또는 <b>앱 설치</b>)를 눌러요', '<b>설치</b>를 누르면 끝!'] };
  }
  return { title:'휴대폰에서 열어 주세요', lead:'이 앱은 휴대폰 홈 화면에 추가해서 쓰도록 만들었어요. 휴대폰으로 이 주소를 열어 주세요.',
    steps:[`<b>${esc(url)}</b>`] };
}
function guideHTML(g, compact){
  return `<b class="gt">📲 ${g.title}</b>` + (g.lead ? `<div class="gl">${g.lead}</div>` : '') +
    (deferredPrompt && !compact && !g.btn ? '' : `<ol class="gs">${g.steps.map(s => `<li>${s}</li>`).join('')}</ol>`) +
    (deferredPrompt && !g.btn ? `<button class="btn primary" id="installNow" style="margin-top:8px;width:100%">한 번에 홈 화면에 추가</button>` : '') +
    (g.btn ? `<a class="btn primary gbtn" href="${g.btn.href}">${g.btn.label}</a>` : '');
}
function renderInstall(){
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const g = installGuide();
  if (S.moved){
    const el0 = $('#installBanner'); el0.hidden = false; $('#days').after(el0);
    el0.innerHTML = `<button class="x" id="hideMoved">✕</button><b class="gt">📦 새 주소로 이사 왔어요</b>
      <div class="gl">예전 기록을 그대로 옮겨왔어요. <b>홈 화면 아이콘은 새로 추가</b>해 주시고, 예전 아이콘은 지워도 돼요.</div>` + guideHTML(g, true).replace(/^<b class="gt">.*?<\/b>/, '');
    return;
  }
  $('#guideBox').innerHTML = standalone ? '<b class="gt">✅ 홈 화면 앱으로 쓰고 있어요</b><div class="gl">지금처럼 홈 화면 아이콘으로 열면 돼요.</div>' : guideHTML(g, true);
  const el = $('#installBanner');
  if (standalone || S.hideInstall || !BR.mobile && !deferredPrompt){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<button class="x" id="hideInstall">✕</button>` + guideHTML(g);
  if (g.btn) $('#days').after(el); else $('#fcCard').after(el); // 카톡 등 앱 안에서는 맨 위에
}

/* ================== 렌더: 기록 ================== */
let histFilter = 'all';
function renderHist(){
  const used = [...new Set([...S.modes, ...S.records.map(r => r.mode)])].filter(id => MODE[id]);
  if (histFilter !== 'all' && !used.includes(histFilter)) histFilter = 'all';
  $('#histFilter').innerHTML = used.length > 1 ? [['all','전체'], ...used.map(id => [id, MODE[id].emoji + ' ' + shortName(MODE[id])])]
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
    const mm = r.date.slice(0,7), m = MODE[r.mode];
    if (mm !== mm0){ mm0 = mm; html += `<div class="month">${+mm.slice(0,4)}년 ${+mm.slice(5)}월</div>`; }
    html += `<button class="rec" data-id="${r.id}">
      <div class="tbadge" style="--th:${hueOf(r.temp).toFixed(0)}">${r.temp}°</div>
      <div class="rec-body"><div class="rec-date">${m.emoji} ${fmtDate(r.date)}${r.when ? ' · ' + WHEN[r.when].label : r.period ? ' · ' + periodLabel(r.period) + ' 기준' : ''}</div>
      <div class="rec-items">${levelsText(m, r.levels)}</div></div>
      <div class="rec-rate">${r.rating ? RATE[r.rating] : '<span style="font-size:12px;color:var(--sub)">평가 전</span>'}</div></button>`;
  }
  $('#histList').innerHTML = html;
}

/* ================== 렌더: 설정 ================== */
function renderSettings(){
  $('#stepOpts').innerHTML = [['daily','👗 일상복'], ['sport','⛳ 운동'], ['kid','🧒 아이옷']].map(([g, l]) => `<div class="steprow"><span>${l}</span>
    <div class="seg2">${[1, 2, 3].map(n => `<button class="${S.fcStep[g] === n ? 'on' : ''}" data-g="${g}" data-n="${n}">${n}시간</button>`).join('')}</div></div>`).join('');
  $('#periodOpts').innerHTML = PERIODS.map(p => `<button class="chip ${S.periods.includes(p.k) ? 'on' : ''}" data-p="${p.k}">${p.label} <small>${p.t}</small></button>`).join('');
  $('#setModesName').textContent = S.modes.map(id => MODE[id].emoji).join(' ');
  const CN = {markets: '📈 증시', economy: '🏛️ 경제·정책', bonds: '💵 채권·금리', commodities: '🛢️ 원자재', crypto: '🪙 코인', tech: '🤖 빅테크·AI', people: '👤 인물·기관', korea: '🇰🇷 국내', world: '🌏 국제'};
  $('#newsCatOpts').innerHTML = Object.entries(CN).map(([k, l]) => `<button class="chip ${S.newsCats.includes(k) ? 'on' : ''}" data-k="${k}">${l}</button>`).join('');
  $('#newsOrigSwitch').classList.toggle('on', !!S.newsOrig);
  $('#lifeSwitch').classList.toggle('on', !!S.life);
  document.querySelectorAll('#upColorOpts button').forEach(b => b.classList.toggle('on', b.dataset.v === S.upColor));
  document.querySelectorAll('#mktOpts button').forEach(b => b.classList.toggle('on', b.dataset.v === S.mkt));
  $('#statsSwitch').classList.toggle('on', !!S.stats);
  $('#statsRow').hidden = !GC;
}
function renderModeSheet(){
  const row = m => `<button class="mrow ${S.modes.includes(m.id)?'on':''}" data-m="${m.id}">
      <span class="e">${m.emoji}</span><span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span>
      ${m.kid ? `<span class="kedit" data-k="${m.kid.id}">수정</span>` : ''}<span class="check">✓</span></button>`;
  const groups = [...new Set(BASE_MODES.map(m => m.group))];
  $('#modeList').innerHTML = groups.map(g => `<div class="group-title">${g}</div>` + BASE_MODES.filter(m => m.group === g).map(row).join('')).join('') +
    `<div class="group-title">아이 <span style="font-weight:600">· 아이마다 따로 기록하고 배워요</span></div>` +
    S.kids.map(k => row(MODE[kidModeId(k)])).join('') +
    `<button class="mrow addkid" id="addKid"><span class="e">➕</span><span><b>아이 추가</b><small>이름(선택)과 태어난 해만 고르면 돼요</small></span></button>`;
}
let kidEdit = null;
function openKidForm(k){
  kidEdit = k ? {...k} : {id: 'k' + Date.now().toString(36), name: '', year: new Date().getFullYear() - 3, isNew: true};
  const y = new Date().getFullYear();
  $('#kidTitle').textContent = kidEdit.isNew ? '아이 추가' : '아이 정보 수정';
  $('#kidName').value = kidEdit.name;
  $('#kidYear').innerHTML = Array.from({length: 16}, (_, i) => y - i)
    .map(v => `<option value="${v}" ${v === kidEdit.year ? 'selected' : ''}>${v}년생 (${y - v <= 0 ? '1살 미만' : (y - v) + '살'})</option>`).join('');
  $('#kidDel').hidden = !!kidEdit.isNew;
  openSheet('#kidSheet');
}
$('#kidSave').onclick = () => {
  const k = {id: kidEdit.id, name: $('#kidName').value.trim().slice(0, 10), year: +$('#kidYear').value};
  const i = S.kids.findIndex(x => x.id === k.id);
  if (i >= 0) S.kids[i] = k; else { S.kids.push(k); track('kid/added', '아이 추가'); }
  buildModes(S.kids);
  const id = kidModeId(k);
  if (!S.modes.includes(id)) S.modes = allModeIds().filter(x => S.modes.includes(x) || x === id);
  S.mode = id; variant = 0; save(); renderModeSheet(); render(); renderSettings(); openSheet('#modeSheet');
  toast(`${k.name || k.year + '년생'} 등록했어요 ✨`);
};
$('#kidDel').onclick = () => {
  const name = kidEdit.name || kidEdit.year + '년생', id = kidModeId(kidEdit);
  const n = S.records.filter(r => r.mode === id).length;
  if (!confirm(`'${name}'을(를) 지울까요?${n ? ` 기록 ${n}개도 함께 지워져요.` : ''}`)) return;
  S.kids = S.kids.filter(x => x.id !== kidEdit.id);
  S.records = S.records.filter(r => r.mode !== id);
  S.modes = S.modes.filter(x => x !== id); if (!S.modes.length) S.modes = ['daily'];
  if (S.mode === id) S.mode = S.modes[0];
  buildModes(S.kids); save(); renderModeSheet(); render(); renderSettings(); openSheet('#modeSheet');
};

/* ================== 탭 / 시트 ================== */
function showView(v){
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-'+v));
  const tab = v === 'hist' ? 'home' : v;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === tab));
  document.querySelectorAll('.subtabs button').forEach(b => b.classList.toggle('on', b.dataset.sub === v));
  if (v === 'hist') renderHist();
  if (v === 'home') render();
  if (v === 'set') renderSettings();
  if (v === 'news') renderNews();
  if (v === 'market') renderMarket();
  try { sessionStorage.setItem('view', v); } catch(e){}
  scrollTo(0,0);
}
document.querySelectorAll('.subtabs').forEach(el => el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.sub); }));
$('#nwRefresh').onclick = () => { toast('뉴스를 새로 불러와요'); renderNews(true); };
$('#mkRefresh').onclick = () => { toast('시장 데이터를 새로 불러와요'); renderMarket(true); };
let openSheetEl = null;
function openSheet(id){ if (openSheetEl) openSheetEl.classList.remove('on'); openSheetEl = $(id); $('#dim').classList.add('on'); openSheetEl.classList.add('on'); }
function closeSheet(){ if (openSheetEl) openSheetEl.classList.remove('on'); $('#dim').classList.remove('on'); openSheetEl = null; }

/* ---- 기록 시트 ---- */
let edit = null; // {id?, date, mode, when?, temp, levels, rating}
function newRecord(mode, levels, temp, per){
  const info = dayInfo(0, mode);
  const t = temp ?? (isToday(info) ? info.base : '');
  return {date: todayStr(), mode: mode.id, when: whenOf(mode), period: per || null, temp: t,
    levels: levels ? {...levels} : lvFromArr(ruleOf(mode, typeof t === 'number' ? t : 15)), rating: null};
}
function openLog(rec){
  edit = clone(rec);
  const m = MODE[edit.mode];
  $('#logTitle').textContent = `${m.emoji} ${shortName(m)} ${rec.id ? '기록 수정' : '입은 옷 기록'}`;
  $('#logDate').value = edit.date; $('#logTemp').value = edit.temp;
  $('#logDel').hidden = !rec.id;
  renderLogCats(); renderLogRate(); openSheet('#logSheet');
}
function renderLogCats(){
  const m = MODE[edit.mode];
  $('#logCats').innerHTML = CATS.map(c => {
    const lv = m.levels[c.k], i = edit.levels[c.k];
    return `<div class="cat"><div class="cat-title">${c.e} ${c.label}</div>
      <div class="seg" style="--n:${lv.length}">${lv.map((L, k) => `<button class="${k===i?'on':''}" data-c="${c.k}" data-i="${k}">${L.n}</button>`).join('')}</div>
      <div class="ex seg-ex">${lv[i].ex.length ? '예: ' + lv[i].ex.map(esc).join(' · ') : '&nbsp;'}</div></div>`;
  }).join('');
}
function renderLogRate(){ document.querySelectorAll('#logRate button').forEach(b => b.classList.toggle('on', b.dataset.r === edit.rating)); }

$('#logCats').addEventListener('click', e => {
  const b = e.target.closest('button[data-c]'); if (!b) return;
  edit.levels[b.dataset.c] = +b.dataset.i; renderLogCats();
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
  const same = S.records.find(r => r.date === edit.date && r.mode === edit.mode && r.id !== edit.id);
  if (same && !confirm(`${fmtDate(edit.date)} ${MODE[edit.mode].name} 기록이 이미 있어요. 바꿀까요?`)) return;
  const isNew = !edit.id;
  delete edit.items;
  S.records = S.records.filter(r => r.id !== edit.id && !(r.date === edit.date && r.mode === edit.mode));
  S.records.push({...edit, id: edit.id || Date.now().toString(36)});
  save(); closeSheet(); toast('기록했어요 ✨'); render(); renderHist();
  if (isNew) track(`record/${MODE[edit.mode].kid ? 'kid' : edit.mode}`, '기록 저장');
  if (edit.rating) track(`rating/${edit.rating}`, `평가: ${RATE[edit.rating]}`);
};
$('#logDel').onclick = () => {
  if (!confirm('이 기록을 지울까요?')) return;
  S.records = S.records.filter(r => r.id !== edit.id); save(); closeSheet(); render(); renderHist(); toast('지웠어요');
};

/* ---- 위치 ---- */
const SIDO_SHORT = x => ({경기도:'경기', 강원특별자치도:'강원', 강원도:'강원', 충청북도:'충북', 충청남도:'충남', 전라북도:'전북', 전북특별자치도:'전북',
  전라남도:'전남', 경상북도:'경북', 경상남도:'경남', 제주특별자치도:'제주', 세종특별자치시:'세종', 전남광주통합특별시:'전남광주'}[x] || x.replace(/특별시|광역시/, ''));
const shortAddr = a => { const t = (a || '').split(' '); if (t[0]) t[0] = SIDO_SHORT(t[0]); return t.join(' '); };
const sggFmt = g => g.replace(/^(.+?시)(.+구)$/, '$1 $2');
let KRD = null;
function krData(){
  if (KRD) return KRD;
  KRD = (window.KR_DONG || '').split('\n').filter(Boolean).map(line => {
    const [si, g, d, la, lo] = line.split('|'), sido = KR_SIDO[+si], ss = SIDO_SHORT(sido), gg = sggFmt(g);
    return {sido, ss, g: gg, d, lat: +la, lon: +lo, full: [ss, gg, d].filter(Boolean).join(' '), hay: `${sido} ${ss} ${g} ${gg} ${d}`};
  });
  return KRD;
}
const inKorea = (lat, lon) => lat > 33 && lat < 38.7 && lon > 124.5 && lon < 131;
function nearestKR(lat, lon){
  let best = null, bd = 1e9; const c = Math.cos(lat * Math.PI / 180);
  for (const r of krData()){ const dx = (r.lon - lon) * c, dy = r.lat - lat, d = dx*dx + dy*dy; if (d < bd){ bd = d; best = r; } }
  return best && Math.sqrt(bd) * 111 < 15 ? best : null;
}

// 카카오 (국내 주소·장소 검색) — config.js에 키가 있을 때만
let kakaoP = null;
function kakaoSDK(){
  const key = (window.APP_CONFIG || {}).kakaoKey; if (!key) return Promise.resolve(null);
  return kakaoP ||= new Promise(res => {
    const sc = document.createElement('script');
    sc.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    sc.onload = () => { try { kakao.maps.load(() => res(window.kakao)); } catch(e){ res(null); } };
    sc.onerror = () => res(null); document.head.appendChild(sc); setTimeout(() => res(null), 8000);
  });
}
async function kakaoSearch(q){
  const K = await kakaoSDK(); if (!K) return null;
  const sv = K.maps.services, OK = sv.Status.OK;
  const [a, k] = await Promise.all([
    new Promise(r => new sv.Geocoder().addressSearch(q, (res, st) => r(st === OK ? res : []), {size: 10})),
    new Promise(r => new sv.Places().keywordSearch(q, (res, st) => r(st === OK ? res : []), {size: 10})) ]);
  return [...a.map(x => ({name: x.address_name.split(' ').slice(/ADDR$/.test(x.address_type) ? -2 : -1).join(' '), full: shortAddr(x.address_name), lat: +x.y, lon: +x.x})),
          ...k.map(x => ({name: x.place_name, full: shortAddr(x.road_address_name || x.address_name), lat: +x.y, lon: +x.x}))];
}
async function kakaoReverse(lat, lon){
  const K = await kakaoSDK(); if (!K) return null;
  const sv = K.maps.services;
  return new Promise(r => new sv.Geocoder().coord2RegionCode(lon, lat, (res, st) => {
    if (st !== sv.Status.OK || !res.length) return r(null);
    const h = res.find(x => x.region_type === 'H') || res[0];
    r({name: h.region_3depth_name || h.region_2depth_name, full: shortAddr([h.region_1depth_name, h.region_2depth_name, h.region_3depth_name].filter(Boolean).join(' '))});
  }));
}
// 키가 없을 때 도로명 등은 OpenStreetMap으로
async function osmSearch(q){
  const js = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&accept-language=ko&limit=8&q=${encodeURIComponent(q)}`)).json();
  const seen = new Set();
  return js.map(x => {
    const parts = x.display_name.split(', ').filter(p => !/^\d{5}$/.test(p) && p !== '대한민국').reverse();
    if (parts[0]) parts[0] = SIDO_SHORT(parts[0]);
    return {name: x.name || parts[parts.length - 1], full: parts.join(' '), lat: +x.lat, lon: +x.lon};
  }).filter(x => !seen.has(x.full) && seen.add(x.full));
}
async function worldSearch(q){
  const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ko`)).json();
  return (r.results || []).filter(x => x.country_code !== 'KR' && x.country_code !== 'KP').map(x => ({name: x.name, full: [x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude}));
}
// 앱에 들어있는 행정구역 데이터로 즉시 검색: "도안동" → 해당 동, "상주" → 상주시의 읍·면·동 전체
function localSearch(q){
  const toks = q.split(/\s+/).filter(Boolean); if (!toks.length) return [];
  const last = toks[toks.length - 1];
  const rows = krData().filter(r => toks.every(t => r.hay.includes(t)));
  const dongs = rows.filter(r => r.d.includes(last))
    .sort((a, b) => (b.d.startsWith(last) - a.d.startsWith(last)) || a.d.length - b.d.length).slice(0, 12);
  const groups = new Map();
  for (const r of rows) if (!r.d.includes(last)) { const k = `${r.ss} ${r.g}`.trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = dongs.map(r => ({name: r.d, full: r.full, lat: r.lat, lon: r.lon}));
  const gs = [...groups.entries()], wide = gs.length > 3; // "대전"처럼 넓게 찾으면 시군구 목록만
  for (const [k, list] of gs.slice(0, wide ? 40 : 3)){
    out.push({name: list[0].g || list[0].ss, full: `${k} 전체`, lat: avg(list.map(x => x.lat)), lon: avg(list.map(x => x.lon)), group: true});
    if (!wide) list.forEach(r => out.push({name: r.d, full: r.full, lat: r.lat, lon: r.lon, child: true}));
  }
  return out;
}

let searchSeq = 0, RESULTS = [];
function doSearch(q){
  const seq = ++searchSeq, hangul = /[가-힣]/.test(q);
  const sec = {local: hangul ? localSearch(q) : [], road: hangul && q.length >= 2 ? null : [], world: null};
  const draw = () => {
    if (seq !== searchSeq) return;
    RESULTS = []; let html = '';
    const block = (title, list) => {
      if (!list || !list.length) return;
      html += `<div class="sec-title">${title}</div>` + list.map(x => { RESULTS.push(x);
        return `<button class="result ${x.group ? 'group' : ''} ${x.child ? 'child' : ''}" data-i="${RESULTS.length - 1}"><b>${esc(x.name)}</b><span>${esc(x.full)}</span></button>`; }).join('');
    };
    const localFull = new Set(sec.local.map(x => x.full));
    block('지역', sec.local); block('도로·장소', sec.road && sec.road.filter(x => !localFull.has(x.full))); block('해외', sec.world);
    const loading = sec.road === null || sec.world === null;
    $('#locResults').innerHTML = html || `<div class="empty" style="padding:30px">${loading ? '찾는 중…' : '검색 결과가 없어요'}</div>`;
  };
  draw();
  if (sec.road === null) kakaoSearch(q).then(r => r ?? osmSearch(q)).catch(() => []).then(r => { sec.road = r || []; draw(); });
  worldSearch(q).catch(() => []).then(r => { sec.world = r; draw(); });
}
let searchT;
$('#locSearch').addEventListener('input', e => {
  clearTimeout(searchT); const q = e.target.value.trim();
  if (!q){ $('#locResults').innerHTML = ''; return; }
  if (/[가-힣]/.test(q)) $('#locResults').innerHTML = ''; // 지역 결과는 바로
  searchT = setTimeout(() => doSearch(q), 400);
});
$('#locResults').addEventListener('click', e => {
  const b = e.target.closest('.result'); if (!b) return;
  addPlace(RESULTS[+b.dataset.i]);
});

function addPlace(x){
  const p = {id: 'p' + Date.now().toString(36), name: x.name, full: x.full, lat: +(+x.lat).toFixed(3), lon: +(+x.lon).toFixed(3)};
  const same = S.places.find(q => locKey(q) === locKey(p));
  if (same) return selectLoc(same.id), closeLocSheet();
  if (S.places.length >= MAX_PLACES){
    const old = S.places.find(q => q.id === S.locSel) || S.places[0];
    if (!confirm(`저장한 지역은 ${MAX_PLACES}곳까지예요. '${old.name}' 대신 '${p.name}'을(를) 넣을까요?`)) return;
    S.places = S.places.map(q => q.id === old.id ? p : q);
  } else S.places.push(p);
  track('place/added', '지역 추가');
  selectLoc(p.id); closeLocSheet();
}
function closeLocSheet(){ closeSheet(); $('#locSearch').value = ''; $('#locResults').innerHTML = ''; }
function selectLoc(sel){
  S.locSel = sel;
  S.loc = sel === 'gps' ? (S.gps ? {...S.gps, gps: true} : null) : {...S.places.find(p => p.id === sel), gps: false};
  S.wx = S.loc ? S.wxc[locKey(S.loc)] || null : null; WXC = null; renderDays.done = false;
  const keep = new Set([S.gps, ...S.places].filter(Boolean).map(locKey));
  for (const k in S.wxc) if (!keep.has(k)) delete S.wxc[k];
  save(); render(); renderSaved();
  if (!S.loc) useGPS(); else if (stale()) fetchWeather();
}
function renderLocs(){
  $('#locs').innerHTML = [`<button class="loc ${S.locSel === 'gps' ? 'on' : ''}" data-l="gps">📍 ${esc(S.gps ? S.gps.name : '현재 위치')}</button>`,
    ...S.places.map(p => `<button class="loc ${S.locSel === p.id ? 'on' : ''}" data-l="${p.id}">${esc(p.name)}</button>`),
    S.places.length < MAX_PLACES ? '<button class="loc add" data-l="add" aria-label="지역 추가">＋</button>' : ''].join('');
}
function renderSaved(){
  $('#savedList').innerHTML = `<div class="sec-title">저장한 지역 (${S.places.length}/${MAX_PLACES})</div>` + (S.places.length ? S.places.map(p => `
    <div class="saved"><div><b>${esc(p.name)}</b><span>${esc(p.full)}</span></div><button class="x" data-del="${p.id}" aria-label="삭제">✕</button></div>`).join('')
    : '<div class="why" style="padding:6px 4px">위에서 검색해서 고르면 맨 위 탭에 추가돼요.</div>');
}
function openLocSheet(){ renderSaved(); openSheet('#locSheet'); setTimeout(() => $('#locSearch').focus(), 300); }
$('#locs').onclick = e => {
  const b = e.target.closest('.loc'); if (!b) return;
  const l = b.dataset.l;
  if (l === 'add') return openLocSheet();
  if (l === S.locSel) return l === 'gps' ? (toast('현재 위치를 다시 찾아요'), useGPS()) : openLocSheet();
  selectLoc(l);
};
$('#savedList').onclick = e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  S.places = S.places.filter(p => p.id !== b.dataset.del);
  if (S.locSel === b.dataset.del) selectLoc('gps'); else { save(); renderLocs(); renderSaved(); }
};

async function placeName(lat, lon){
  if (inKorea(lat, lon)){
    const k = await kakaoReverse(lat, lon).catch(() => null); if (k) return k;
    const n = nearestKR(lat, lon); if (n) return {name: n.d, full: n.full};
  }
  try {
    const r = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`)).json();
    const name = r.locality || r.city || r.principalSubdivision || '현재 위치';
    return {name, full: [r.city && r.city !== name ? r.city : '', name, r.countryName].filter(Boolean).join(', ')};
  } catch(e){ return {name: '현재 위치', full: '현재 위치'}; }
}
function useGPS(){
  if (!navigator.geolocation){ toast('위치 기능을 쓸 수 없어요 · 지역을 검색해 주세요'); openLocSheet(); return; }
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
    S.gps = {lat, lon, ...(await placeName(lat, lon))};
    if (S.locSel === 'gps' || !S.loc){ closeSheet(); selectLoc('gps'); } else { save(); renderLocs(); }
  }, () => { toast('위치 권한이 없어서 지역을 검색해 주세요'); render(); if (!S.loc) openLocSheet(); },
  {timeout: 10000, maximumAge: 600000});
}

/* ---- 이벤트 ---- */
const selectDay = i => { day = i; variant = 0; period = defaultPeriod(); render(); };
$('#periods').onclick = e => { const b = e.target.closest('.pbtn'); if (!b) return; if (b.dataset.w){ S.when[S.mode] = b.dataset.w; save(); variant = 0; } else period = +b.dataset.p; render(); };
$('#recRows').onclick = e => { const b = e.target.closest('.pcol[data-p]'); if (b){ period = +b.dataset.p; render(); } };
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => showView(b.dataset.view));
$('#days').onclick = e => { const b = e.target.closest('.dchip'); if (b) selectDay(+b.dataset.d); };
$('#fcTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.fcTab = b.dataset.t; save(); render(); };
$('#fcBody').onclick = e => {
  const b = e.target.closest('.drow'); if (!b) return;
  S.fcTab = 'hourly'; save(); selectDay(+b.dataset.d);
  $('#hero').scrollIntoView({behavior:'smooth', block:'start'});
};
$('#whenTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.when[S.mode] = b.dataset.w; save(); variant = 0; render(); };
$('#variants').onclick = e => { const b = e.target.closest('button'); if (!b) return; variant = +b.dataset.v; render(); };
$('#modes').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'addMode'){ renderModeSheet(); openSheet('#modeSheet'); return; }
  S.mode = b.dataset.m; save(); variant = 0; render();
};
$('#modeList').onclick = e => {
  const ed = e.target.closest('.kedit'); if (ed) return openKidForm(S.kids.find(k => k.id === ed.dataset.k));
  if (e.target.closest('#addKid')) return openKidForm(null);
  const b = e.target.closest('.mrow'); if (!b) return;
  const id = b.dataset.m, on = S.modes.includes(id);
  if (on && S.modes.length === 1){ toast('최소 하나는 있어야 해요'); return; }
  if (on) S.modes = S.modes.filter(x => x !== id);
  else { S.modes = allModeIds().filter(x => S.modes.includes(x) || x === id); track(`mode-added/${MODE[id].kid ? 'kid' : id}`, '종류 추가'); }
  if (!S.modes.includes(S.mode)) S.mode = S.modes[0];
  if (!on) S.mode = id;
  save(); renderModeSheet(); render(); renderSettings();
};
$('#modeDone').onclick = closeSheet;
$('#histFilter').onclick = e => { const b = e.target.closest('button'); if (b){ histFilter = b.dataset.f; renderHist(); } };
$('#setLoc').onclick = openLocSheet;
$('#setModes').onclick = () => { renderModeSheet(); openSheet('#modeSheet'); };
$('#gpsBtn').onclick = () => { closeLocSheet(); selectLoc('gps'); if (S.gps) useGPS(); };
$('#setGps').onclick = () => { selectLoc('gps'); if (S.gps) useGPS(); };
$('#refreshBtn').onclick = () => { toast('날씨를 새로 불러와요'); S.loc?.gps ? useGPS() : fetchWeather(); };
$('#dim').onclick = closeSheet;
$('#woreBtn').onclick = () => {
  const mode = cur(), info = dayInfo(0); if (!isToday(info) || !shown) return;
  const exist = S.records.find(r => r.date === todayStr() && r.mode === mode.id);
  if (exist && !confirm(`오늘 ${mode.name} 기록이 이미 있어요. 이 옷차림으로 바꿀까요?`)) return;
  S.records = S.records.filter(r => !(r.date === todayStr() && r.mode === mode.id));
  S.records.push({...newRecord(mode, shown, shownTemp, periodic(mode) ? PS()[period].k : null), id: Date.now().toString(36)});
  save(); render();
  toast(mode.when ? '기록했어요! 끝나고 어땠는지 알려주세요 🙌' : '기록했어요! 저녁에 어땠는지 알려주세요 🙌');
  track(`wore-recommended/${mode.kid ? 'kid' : mode.id}`, '추천대로 입음');
};
$('#otherBtn').onclick = () => {
  const mode = cur();
  const r = S.records.find(r => r.date === todayStr() && r.mode === mode.id);
  openLog(r || newRecord(mode, shown, shownTemp, periodic(mode) ? PS()[period].k : null));
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
  if (e.target.id === 'hideMoved'){ S.moved = 0; save(); renderInstall(); }
  if (e.target.id === 'installNow' && deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderInstall(); }
};
$('#guideBox').onclick = $('#installBanner').onclick;
$('#statsRow').onclick = () => { S.stats = !S.stats; save(); renderSettings(); if (S.stats) startAnalytics(); };
$('#exportBtn').onclick = async () => {
  const data = JSON.stringify({app:'outfit', v:4, at:new Date().toISOString(), records:S.records, modes:S.modes, kids:S.kids}, null, 1);
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
    if (Array.isArray(d.kids)) { for (const k of d.kids) if (!S.kids.some(x => x.id === k.id)) S.kids.push(k); buildModes(S.kids); }
    const recs = d.records.map(r => { r.mode ||= 'daily'; if (MODE[r.mode] && !r.levels && r.items) r.levels = itemsToLevels(MODE[r.mode], r.items, r.temp); return r; })
      .filter(r => r.levels && MODE[r.mode]);
    const keys = new Set(recs.map(r => r.date + r.mode));
    S.records = [...S.records.filter(r => !keys.has(r.date + r.mode)), ...recs];
    if (Array.isArray(d.kids)) for (const k of d.kids) if (!S.kids.some(x => x.id === k.id)) S.kids.push(k);
    buildModes(S.kids);
    if (Array.isArray(d.modes)) S.modes = allModeIds().filter(id => S.modes.includes(id) || d.modes.includes(id));
    save(); render(); toast('불러왔어요 ✨');
  } catch(err){ toast('올바른 백업 파일이 아니에요'); }
  e.target.value = '';
};
$('#resetBtn').onclick = () => {
  if (!confirm('모든 옷차림 기록을 지울까요? 되돌릴 수 없어요.')) return;
  S.records = []; save(); render(); toast('모두 지웠어요');
};

/* ---- 처음 사용 안내 (한 번만) ---- */
let onbI = 0, onbSlides = [];
function showOnboarding(){
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const bars = [1, 2, 3, 4].map(k => `<i class="${k <= 3 ? 'on' : ''}" style="height:${8 + k * 6}px"></i>`).join('');
  onbSlides = [
    { art: `<img src="icon-192.png?v=2" width="88" height="88" alt="" style="border-radius:22px;box-shadow:0 6px 18px rgba(0,0,0,.1)">`,
      title: '오늘 뭐 입지에 오신 걸 환영해요',
      body: `<p class="onb-lead">날씨를 보고 <b>옷을 얼마나 두껍게 입을지</b> 알려드려요.<br>입은 옷을 기록할수록 <b>내 몸에 맞게</b> 추천이 바뀌어요.</p>` },
    { art: wxIcon('partly-day', 72),
      title: '날씨 보는 법',
      body: `<ul><li>📍 맨 위 탭은 <b>현재 위치 + 자주 가는 지역 3곳</b> (＋로 추가)</li>
        <li>📅 날짜를 누르면 <b>16일 뒤</b>까지 볼 수 있어요</li>
        <li>🌤️ <b>아침·낮·저녁</b> 체감온도와 비·바람, 시간에 따른 느낌까지 정리해 드려요</li>
        <li>☂️ 비나 눈이 오면 <b>우산 알림</b>이 떠요</li></ul>` },
    { art: `<span class="onb-bars bars">${bars}</span>`,
      title: '옷 추천과 기록',
      body: `<ul><li>막대가 많을수록 <b>두껍게</b> 입으라는 뜻이에요</li>
        <li>입고 나가면 <b>👍 이대로 입었어요</b>, 다르게 입었으면 <b>✏️ 다르게 입었어요</b></li>
        <li>저녁에 <b>🥶 추웠어 · 😊 딱 좋아 · 🥵 더웠어</b>를 누르면 다음 추천이 더 정확해져요</li></ul>` },
    { art: '<span class="onb-emo">⛳ 🏃 🧒</span>',
      title: '운동복·아이옷도 돼요',
      body: `<ul><li>위쪽 <b>＋ 추가</b>에서 골프·러닝·등산·자전거·테니스를 고를 수 있어요</li>
        <li>아이는 <b>태어난 해</b>로 여러 명 등록하고, 아이마다 따로 배워요</li>
        <li>기록은 이 폰에만 저장돼요 · <b>설정 → 백업</b>으로 옮길 수 있어요</li></ul>` },
  ];
  onbSlides.push({ art: '<span class="onb-emo">📰 📈</span>', title: '뉴스·증시도 한 곳에',
    body: `<ul><li>📰 <b>뉴스</b> 탭: Reuters·Bloomberg·WSJ 등 공신력 있는 경제 뉴스를 모아 <b>핵심만 요약</b>해요</li>
      <li>📈 <b>증시</b> 탭: 세계 지수·코스피·환율·금리·코인, <b>마켓맵</b>과 <b>인기 TOP 10</b></li>
      <li>⚙️ 설정에서 관심 분류·상승 색 등을 바꿀 수 있어요</li></ul>` });
  if (!standalone) onbSlides.push({ art: '<span class="onb-emo">📲</span>', title: '홈 화면에 추가하면 앱처럼 써요',
    body: `<div class="onb-guide">${guideHTML(installGuide(), true).replace(/^<b class="gt">.*?<\/b>/, '')}</div>` });
  onbI = 0; drawOnb(); $('#onb').hidden = false;
}
function drawOnb(){
  const sl = onbSlides[onbI], last = onbI === onbSlides.length - 1;
  $('#onbSlide').innerHTML = `<div class="onb-art">${sl.art}</div><h3>${sl.title}</h3>${sl.body}`;
  $('#onbDots').innerHTML = onbSlides.map((_, i) => `<i class="${i === onbI ? 'on' : ''}"></i>`).join('');
  $('#onbNext').textContent = last ? '시작하기' : '다음';
  $('#onbSkip').style.visibility = last ? 'hidden' : 'visible';
}
function closeOnb(done){
  $('#onb').hidden = true;
  const first = !S.onboarded;
  S.onboarded = true; save();
  track(done ? 'onboarding/done' : 'onboarding/skip', done ? '사용 안내 끝까지 봄' : '사용 안내 건너뜀');
  if (first && S.locSel === 'gps') useGPS(); // 안내를 닫은 뒤에 위치 권한을 물어봐요
}
$('#onbNext').onclick = () => { if (onbI < onbSlides.length - 1){ onbI++; drawOnb(); } else closeOnb(true); };
$('#onbSkip').onclick = () => closeOnb(false);
$('#onbSlide').onclick = $('#installBanner').onclick;
let onbX = null;
$('#onb').addEventListener('touchstart', e => { onbX = e.touches[0].clientX; }, {passive: true});
$('#onb').addEventListener('touchend', e => {
  if (onbX == null) return; const dx = e.changedTouches[0].clientX - onbX; onbX = null;
  if (dx < -50 && onbI < onbSlides.length - 1){ onbI++; drawOnb(); } else if (dx > 50 && onbI > 0){ onbI--; drawOnb(); }
});
$('#setHelp').onclick = showOnboarding;
$('#newsCatOpts').onclick = e => {
  const b = e.target.closest('[data-k]'); if (!b) return;
  const k = b.dataset.k, on = S.newsCats.includes(k);
  if (on && S.newsCats.length === 1) return toast('최소 하나는 있어야 해요');
  S.newsCats = on ? S.newsCats.filter(x => x !== k) : [...S.newsCats, k]; save(); renderSettings();
};
$('#newsOrigRow').onclick = () => { S.newsOrig = !S.newsOrig; save(); renderSettings(); };
$('#lifeRow').onclick = () => { S.life = !S.life; save(); renderSettings(); };
$('#upColorOpts').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; S.upColor = b.dataset.v; save(); renderSettings(); upColors(); };
$('#mktOpts').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; S.mkt = b.dataset.v; S.mapMkt = S.topMkt = b.dataset.v; save(); renderSettings(); };
$('#stepOpts').onclick = e => {
  const b = e.target.closest('[data-g]'); if (!b) return;
  S.fcStep[b.dataset.g] = +b.dataset.n; save(); renderSettings(); render();
};
$('#periodOpts').onclick = e => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  const k = b.dataset.p, on = S.periods.includes(k);
  if (on && S.periods.length === 1) return toast('최소 하나는 있어야 해요');
  S.periods = PERIODS.map(p => p.k).filter(x => x === k ? !on : S.periods.includes(x));
  period = null; save(); renderSettings(); render();
  track(`period/${on ? 'off' : 'on'}-${k}`, '시간대 설정');
};

/* ---- 끌어서 새로고침 ---- */
(() => {
  const el = $('#ptr'), TH = 70; let y0 = null, x0 = 0, d = 0, busy = false;
  const blocked = () => openSheetEl || !$('#onb').hidden || busy;
  const set = (dist, txt) => { el.style.transform = `translate(-50%, ${Math.min(dist, 100) - 60}px)`; el.querySelector('.ic').style.transform = `rotate(${dist * 3}deg)`; el.querySelector('.tx').textContent = txt; };
  addEventListener('touchstart', e => {
    if (blocked() || window.scrollY > 0 || e.touches.length > 1) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; d = 0; el.classList.add('drag');
  }, {passive: true});
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (dy < 0 || Math.abs(dx) > Math.abs(dy) * 1.2 || window.scrollY > 0){ if (d < 10){ y0 = null; reset(); } return; }
    d = dy * 0.5; set(d, d >= TH ? '놓으면 새로고침' : '당겨서 새로고침');
  }, {passive: true});
  addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null; el.classList.remove('drag');
    if (d >= TH){
      busy = true; el.classList.add('spin'); set(TH, '새로고침 중…');
      try { sessionStorage.setItem('forceRefresh', '1'); } catch(e){}
      track('pull-refresh', '끌어서 새로고침');
      setTimeout(() => location.reload(), 250);
    } else reset();
  });
  function reset(){ el.classList.remove('drag'); el.style.transform = ''; }
})();

/* ---- 시작 ---- */
startAnalytics();
render();
dailyStats();
const stale = () => !S.wx || Date.now() - S.wx.at > 30*60e3 || (S.wx.main.current?.time || '').slice(0, 10) !== todayStr() || !S.wx.main.hourly.relative_humidity_2m;
if (!S.onboarded) showOnboarding();
else if (S.locSel === 'gps') useGPS(); // 현재 위치는 열 때마다 다시 확인
let forced = false; try { forced = sessionStorage.getItem('forceRefresh') === '1'; sessionStorage.removeItem('forceRefresh'); } catch(e){}
if (S.loc && (forced || stale())) fetchWeather().then(() => forced && toast('새로고침했어요 ✨'));
upColors();
let v0 = 'home'; try { v0 = (forced && sessionStorage.getItem('view')) || 'home'; } catch(e){}
showView(v0);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible'){ dailyStats(); if (S.loc && stale()) fetchWeather(); }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
