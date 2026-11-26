/* ================== 데이터 ================== */
const KEY = 'outfit.v1';
const MODE = Object.fromEntries(MODES.map(m => [m.id, m]));
// 여러 나라 기상 모델 (Open-Meteo 무료 제공). 데이터 없는 모델은 자동으로 빠져요.
const WX_MODELS = ['ecmwf_ifs025','gfs_seamless','icon_seamless','jma_seamless','kma_seamless','metno_seamless',
  'gem_seamless','meteofrance_seamless','ukmo_seamless','cma_grapes_global'];
const DAYS = 16, STEP = 3; // 16일 예보, 3시간 간격으로 표시

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
const fmtHour = h => h === 0 || h === 24 ? '자정' : h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h-12}시`;
const cur = () => MODE[S.mode];
const whenOf = m => m.when ? (S.when[m.id] || m.when) : null;
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
  const mainUrl = base + `&current=temperature_2m,apparent_temperature,weather_code,is_day` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max&wind_speed_unit=ms`;
  const modelUrl = base + `&hourly=apparent_temperature&models=${WX_MODELS.join(',')}`;
  const get = u => fetch(u).then(r => { if (!r.ok) throw 0; return r.json(); });
  const [m, e] = await Promise.allSettled([get(mainUrl), get(modelUrl)]);
  if (m.status === 'fulfilled'){
    const w = {main: m.value, models: e.status === 'fulfilled' ? e.value : null, at: Date.now()};
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
      g: h.wind_gusts_10m[k] ?? 0, dir: h.wind_direction_10m[k] ?? 0, day: h.is_day[k], spread, n };
  }).filter(x => x.a != null);
  const D = d.daily.time.map((date, i) => {
    const hs = H.filter(x => x.date === date);
    const dayHs = hs.filter(x => x.hour >= 6 && x.hour <= 21);
    const ag = agg(dayHs.length ? dayHs : hs);
    return { i, date, tmax: Math.round(d.daily.temperature_2m_max[i]), tmin: Math.round(d.daily.temperature_2m_min[i]),
      mm: d.daily.precipitation_sum[i] ?? 0, p: d.daily.precipitation_probability_max[i] ?? 0,
      w: Math.round(d.daily.wind_speed_10m_max[i] ?? 0), uv: d.daily.uv_index_max?.[i] ?? 0,
      sky: sky({...ag, day: 1}), models: Math.max(1, ...hs.map(x => x.n)) };
  }).filter(x => !isNaN(x.tmax));
  const nowT = d.current.time.slice(0, 13);
  return (WXC = { at: S.wx.at, H, D, nowT, nowTemp: Math.round(d.current.temperature_2m), today: d.daily.time[0] });
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
// 일상복·아이옷은 오전/오후/저녁으로 나눠서 브리핑·추천
const PERIODS = [{k:'am', label:'오전', h:[9,10]}, {k:'pm', label:'오후', h:[13,15]}, {k:'eve', label:'저녁', h:[18,20]}];
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
    now: i === 0 ? W.nowTemp : null, models: ag.models };
}
const isToday = info => info && info.date === todayStr();

/* ================== 체감 브리핑 ================== */
function feelWord(t){
  return t <= -5 ? '아주 추워요' : t <= 3 ? '추워요' : t <= 9 ? '쌀쌀해요' : t <= 15 ? '선선해요' :
    t <= 21 ? '포근해요' : t <= 26 ? '따뜻해요' : t <= 30 ? '더워요' : '무더워요';
}
function briefing(info, mode){
  const span = info.h1 - info.h0 + 1, snowy = info.snow >= 0.5, w = snowy ? '눈' : '비';
  let cond;
  if (info.rainHours.length){
    const s = info.rainHours[0], e = info.rainHours[info.rainHours.length - 1] + 1;
    cond = info.rainHours.length >= span * 0.7 ? `내내 ${w}가 와요` :
      e > info.h1 ? `${fmtHour(s)}부터 ${w}가 와요` : `${fmtHour(s)}~${fmtHour(e).replace(/^(오전|오후|낮) /, '')} ${w}가 와요`;
    if (snowy) cond = cond.replace('눈가', '눈이');
  } else if (info.w >= 8) cond = '바람이 강해요';
  else cond = {맑음:'맑아요', '구름 조금':'구름이 조금 있어요', '구름 많음':'구름이 많아요', 흐림:'흐려요', 안개:'안개가 껴요', '바람 강함':'바람이 강해요'}[info.sky.label] || '';
  const items = [];

  // 체감온도 흐름
  const pts = [info.hs[0], info.hs[Math.floor(info.hs.length / 2)], info.hs[info.hs.length - 1]];
  const flow = [...new Map(pts.map(x => [x.hour, x])).values()].map(x => `${fmtHour(x.hour)} ${Math.round(x.a)}°`).join(' → ');
  items.push(['🌡️', `체감 ${flow}` + (info.amax - info.amin >= 8 ? ' · <b>일교차 커요, 벗기 쉬운 겉옷</b>' : '')]);

  // 비·눈
  if (info.mm >= 0.1){
    const adv = snowy ? '미끄럼 조심' : info.mm < 1 ? '작은 우산' : info.mm < 5 ? '우산 챙기기' : '우산 + 방수 신발';
    items.push([snowy ? '🌨️' : '🌧️', `${w} ${snowy ? r1(info.snow) + 'cm' : r1(info.mm) + 'mm'} (시간당 최대 ${r1(info.mmMax)}mm) · <b>${adv}</b>` +
      (info.pen ? ` · 젖으면 추워서 ${info.pen}° 더 춥게 잡았어요` : '')]);
  } else if (info.p >= 40) items.push(['🌂', `비 올 확률 ${info.p}% · 작은 우산 있으면 안심`]);

  // 바람
  if (info.w >= 4){
    const word = info.w >= 10 ? '아주 강한 바람' : info.w >= 7 ? '강한 바람' : '조금 부는 바람';
    items.push(['💨', `${word} ${Math.round(info.w)}m/s` + (info.g >= info.w + 4 ? ` (돌풍 ${Math.round(info.g)})` : '') +
      (info.chill >= 1.5 ? ` · 실제 기온 ${Math.round(info.temp)}°보다 <b>${Math.round(info.chill)}° 춥게</b> 느껴져요` : '') +
      (mode.windy && info.w >= 5 ? ' · 바람막이 필수' : '')]);
  }
  if (info.uv >= 6 && info.h0 < 16) items.push(['☀️', '자외선 강해요 · 선크림·모자']);
  if (info.base >= 30) items.push(['🥵', '무더워요 · 물 자주 마시기']);
  mode.tips(info).forEach(t => { const k = t.indexOf(' '); items.push([t.slice(0, k), t.slice(k + 1)]); });
  if (info.spread >= 4) items.push(['🤔', '예보끼리 차이가 커요 · <b>한 겹 더 챙기면 안심</b>']);
  if (info.i >= 7) items.push(['📅', '먼 날짜라 예보가 바뀔 수 있어요 · 가까워지면 다시 확인해 주세요']);
  return { headline: `${feelWord(info.base)}${cond ? ', ' + cond : ''}`, items };
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
function periodBriefing(main, infos, mode){
  const br = briefing(main, mode);
  const bases = infos.map(x => x.base);
  const common = br.items.filter(([e]) => !['🌡️','🌧️','🌨️','🌂','💨'].includes(e));
  if (Math.max(...bases) - Math.min(...bases) >= 7) common.unshift(['🌡️', '<b>일교차 커요</b> · 가장 추운 때 기준으로 입고, 벗기 쉬운 겉옷']);
  return { headline: br.headline, lines: infos.map((inf, j) => ({label: PERIODS[j].label, base: inf.base, kind: inf.sky.kind, text: periodLine(inf)})), items: common };
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
      why: `비슷한 체감온도에서 기록한 <b>${near.length}번</b>을 바탕으로 했어요` +
        (best ? ` · ${fmtDate(best.r.date)} (체감 ${best.r.temp}°) 딱 좋았던 차림 참고 😊` : '') };
  }
  const rated = recs.filter(r => r.rating).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 20);
  const b = avg(rated.map(r => r.rating === 'cold' ? 1 : r.rating === 'hot' ? -1 : 0));
  if (rated.length >= 3 && Math.abs(b) >= 0.4)
    return { lv: shift(mode, def, Math.sign(b)), mine: true,
      why: b > 0 ? '평소 <b>추위를 타는 편</b>이라 기본보다 한 단계 따뜻하게 추천해요' : '평소 <b>더위를 타는 편</b>이라 기본보다 한 단계 가볍게 추천해요' };
  return { lv: def, mine: false,
    why: recs.length ? `일반적인 ${mode.name} 기준이에요 · 이 온도대 기록이 쌓이면 맞춤 추천이 돼요` :
      `일반적인 ${mode.name} 기준이에요 · 입은 옷을 기록하면 점점 맞춤 추천이 돼요!` };
}

/* ================== 렌더: 오늘 ================== */
let day = 0, variant = 0, shown = null, shownTemp = null, period = null;
function defaultPeriod(){ if (day !== 0) return 0; const h = new Date().getHours(); return h < 12 ? 0 : h < 17 ? 1 : 2; }

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
      <span class="dt"><b>${d.tmax}°</b> ${d.tmin}°</span></button>`;
  }).join('');
  const on = $('#days .dchip.on'); if (on && !renderDays.done){ renderDays.done = true; on.scrollIntoView({inline:'center', block:'nearest'}); }
}

function render(){
  const mode = cur(), W = wx();
  renderLocs();
  $('#setLocName').textContent = S.loc ? S.loc.full || S.loc.name : '없음';
  renderModes();
  $('#whenTabs').hidden = !mode.when;
  if (mode.when) $('#whenTabs').innerHTML = Object.entries(WHEN).map(([k, w]) =>
    `<button class="${whenOf(mode)===k?'on':''}" data-w="${k}">${w.label}</button>`).join('');
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

  // 히어로
  const dt = new Date(info.date + 'T00:00'), P = periodic(mode);
  const infos = P ? PERIODS.map(p => dayInfo(day, mode, p.h)) : null;
  if (P && infos.some(x => !x)) return; // 데이터 부족
  if (period == null || period > 2) period = defaultPeriod();
  const sel = P ? infos[period] : info;
  $('#heroDate').innerHTML = `${day === 0 ? '오늘' : day === 1 ? '내일' : ''} ${dt.getMonth()+1}월 ${dt.getDate()}일 (${WD[dt.getDay()]})`.trim() +
    `<span class="addr">📍 ${esc(S.loc.full || S.loc.name)}</span>`;
  $('#heroIcon').innerHTML = wxIcon(sel.sky.kind, 84);
  $('#skyLabel').textContent = sel.sky.label;
  $('#bigTemp').innerHTML = `${sel.base}°<small>${P ? PERIODS[period].label + ' ' : mode.when ? WHEN[whenOf(mode)].label + ' ' : ''}체감${sel.pen ? ` · 비 감안 −${sel.pen}°` : ''}</small>`;
  $('#heroSub').textContent = `최저 ${info.tmin}° · 최고 ${info.tmax}°` + (info.now != null ? ` · 지금 ${info.now}°` : '');
  $('#periods').hidden = !P;
  if (P) $('#periods').innerHTML = infos.map((inf, j) => `<button class="pbtn ${j===period?'on':''}" data-p="${j}">
      <span class="pl">${PERIODS[j].label} <small>${PERIODS[j].h.map(h => h > 12 ? h - 12 : h).join('~')}시</small></span>
      ${wxIcon(inf.sky.kind, 34)}<b>${inf.base}°</b>
      <span class="px">${inf.mm >= 0.1 ? '💧' + r1(inf.mm) + 'mm' : inf.p >= 40 ? '💧' + inf.p + '%' : ''}${inf.w >= 5 ? ' 💨' + Math.round(inf.w) : ''}&nbsp;</span></button>`).join('');
  if (P){
    const pb = periodBriefing(info, infos, mode);
    $('#brief').innerHTML = `<div class="headline">${pb.headline}</div>` +
      pb.lines.map(l => `<div class="pline"><span class="pll">${l.label}</span><span class="plt">${l.base}°</span><span>${l.text}</span></div>`).join('') +
      (pb.items.length ? '<div class="bsep"></div>' : '') +
      pb.items.map(([e, t]) => `<div class="bi"><span class="be">${e}</span><span>${t}</span></div>`).join('');
  } else {
    const br = briefing(info, mode);
    $('#brief').innerHTML = `<div class="headline">${br.headline}</div>` +
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
    const [am, pm, ev] = cols.map(x => x.lv), tips = [];
    if (pm.outer < am.outer || pm.top < am.top) tips.push('☀️ 오후엔 겉옷을 벗거나 가볍게 해도 돼요');
    if (ev.outer > pm.outer || ev.top > pm.top) tips.push('🌙 저녁엔 다시 쌀쌀해져요 · 겉옷 꼭 챙기기');
    if (!tips.length && cols.every(x => CATS.every(c => x.lv[c.k] === am[c.k]))) tips.push('👍 하루 종일 같은 차림이면 돼요');
    $('#recWhy').innerHTML = (variant ? varWhy : rec.why) + (tips.length ? `<div class="ptips">${tips.join('<br>')}</div>` : '');
    $('#recRows').innerHTML = `<div class="pgrid">
      <div class="pcol plab"><div class="ph"></div>${cats.map(c => `<div class="pc"><span class="ce">${c.e}</span>${c.label}</div>`).join('')}</div>
      ${cols.map((x, j) => `<button class="pcol ${j===period?'on':''}" data-p="${j}">
        <div class="ph"><b>${PERIODS[j].label}</b><span>${x.inf.base}°</span></div>
        ${cats.map(c => `<div class="pc ${j && x.lv[c.k] !== cols[j-1].lv[c.k] ? 'chg' : ''}"><span class="bars sm">${barsOf(c, x.lv[c.k], true)}</span><b>${mode.levels[c.k][x.lv[c.k]].n}</b></div>`).join('')}
      </button>`).join('')}</div>
      <div class="pdetail"><b>${PERIODS[period].label} 예시</b>${cats.map(c => { const L = mode.levels[c.k][shown[c.k]];
        return `<div>${c.e} ${c.label} <b>${L.n}</b>${L.ex.length ? ' · ' + L.ex.slice(0, 3).map(esc).join(', ') : ''}</div>`; }).join('')}</div>`;
  } else {
    rec = recommend(mode, info.base);
    shown = variant ? shift(mode, rec.lv, variant) : {...rec.lv}; shownTemp = info.base;
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
  $('#woreBtn').innerHTML = P ? `👍 ${PERIODS[period].label} 차림대로 입었어요` : '👍 이대로 입었어요';

  renderForecast(W, info);
  renderRate(); renderInstall();
  trackDaily(`mode/${mode.id}`, `추천 확인: ${mode.name}`);
  trackDaily(`learned/${rec.mine ? 'yes' : 'no'}`, rec.mine ? '내 기록 기반 추천' : '기본 추천');
}

/* ---- 예보: 시간별 / 날짜별 ---- */
function renderForecast(W, info){
  document.querySelectorAll('#fcTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === S.fcTab));
  if (S.fcTab === 'daily') return renderDaily(W);
  // 오늘은 지금부터 24시간, 다른 날은 그날 0시~21시
  let start;
  if (day === 0){
    const nowH = +W.nowT.slice(11, 13);
    start = W.H.findIndex(x => x.date === W.today && x.hour === Math.floor(nowH / STEP) * STEP);
  } else start = W.H.findIndex(x => x.date === info.date && x.hour === 0);
  if (start < 0) start = 0;
  const slots = [];
  for (let k = start; k < W.H.length && slots.length < 24 / STEP; k += STEP) slots.push({h: W.H[k], ag: agg(W.H.slice(k, k + STEP))});
  const maxMm = Math.max(2, ...slots.map(s => s.ag.mm));
  const cols = slots.map((s, j) => {
    const {h, ag} = s, sk = sky(ag);
    const dt = new Date(h.date + 'T00:00');
    const label = j === 0 && day === 0 ? '지금' : h.hour === 0 ? `<b>${h.date === W.D[1]?.date ? '내일' : WD[dt.getDay()] + ' ' + dt.getDate() + '일'}</b>` : `${h.hour}시`;
    const rainTxt = ag.mm >= 0.1 ? (ag.mm >= 10 ? Math.round(ag.mm) : r1(ag.mm)) : ag.p >= 30 ? `<span class="pp">${ag.p}%</span>` : '<span class="dim0">–</span>';
    const windCls = ag.w >= 8 ? 'strong' : ag.w >= 5 ? 'mid' : '';
    return `<div class="hcol ${h.hour === 0 && j ? 'nd' : ''}">
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
    <div class="fcnote">3시간 단위 · 강수량은 3시간 합계 · 화살표는 바람이 부는 방향</div>`;
}

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
  if (isNew) track(`record/${edit.mode}`, `기록 저장: ${MODE[edit.mode].name}`);
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
$('#periods').onclick = e => { const b = e.target.closest('.pbtn'); if (b){ period = +b.dataset.p; render(); } };
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
  S.records.push({...newRecord(mode, shown, shownTemp, periodic(mode) ? PERIODS[period].k : null), id: Date.now().toString(36)});
  save(); render();
  toast(mode.when ? '기록했어요! 끝나고 어땠는지 알려주세요 🙌' : '기록했어요! 저녁에 어땠는지 알려주세요 🙌');
  track(`wore-recommended/${mode.id}`, `추천대로 입음: ${mode.name}`);
};
$('#otherBtn').onclick = () => {
  const mode = cur();
  const r = S.records.find(r => r.date === todayStr() && r.mode === mode.id);
  openLog(r || newRecord(mode, shown, shownTemp, periodic(mode) ? PERIODS[period].k : null));
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
$('#guideBox').onclick = $('#installBanner').onclick;
$('#statsRow').onclick = () => { S.stats = !S.stats; save(); renderSettings(); if (S.stats) startAnalytics(); };
$('#exportBtn').onclick = async () => {
  const data = JSON.stringify({app:'outfit', v:3, at:new Date().toISOString(), records:S.records, modes:S.modes}, null, 1);
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
    const recs = d.records.map(r => { r.mode ||= 'daily'; if (MODE[r.mode] && !r.levels && r.items) r.levels = itemsToLevels(MODE[r.mode], r.items, r.temp); return r; })
      .filter(r => r.levels && MODE[r.mode]);
    const keys = new Set(recs.map(r => r.date + r.mode));
    S.records = [...S.records.filter(r => !keys.has(r.date + r.mode)), ...recs];
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
if (S.locSel === 'gps') useGPS(); // 현재 위치는 열 때마다 다시 확인
if (S.loc && stale()) fetchWeather();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible'){ dailyStats(); if (S.loc && stale()) fetchWeather(); }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
