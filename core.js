/* ================== 모닝픽 공용 계산 ==================
   날씨 가공 · 체감 브리핑 · 옷 추천 · 🔊 오늘의 브리핑 문장을 만들어요.
   앱(브라우저)과 시리 브리핑 서버(tts-worker)가 이 파일을 똑같이 써서, 어디서 들어도 같은 내용이 나와요.
   화면(DOM)은 건드리지 않아요. 상태는 앱의 S(설정·기록·날씨)를 그대로 읽어요. */
let NOWFN = () => new Date();
const nowDate = () => NOWFN(); // 지금 시각 (서버에서는 그 지역 시각으로 바꿔 끼워요)

/* ---- 추천 종류 ---- */
// 추천 종류: 고정 종류(일상·운동) + 아이별 종류(등록한 아이마다 하나씩)
const BASE_MODES = MODES.filter(m => !m.template);
const TPL = {baby: MODES.find(m => m.id === 'tpl-baby'), kid: MODES.find(m => m.id === 'tpl-kid')};
const MODE = {};
const kidModeId = k => 'kid-' + k.id;
const kidAge = k => nowDate().getFullYear() - k.year; // 연 나이(만 나이와 1살 차이 날 수 있음)
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

/* ---- 유틸 ---- */
const ymd = d => { const z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const todayStr = () => ymd(nowDate());
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avg = a => a.length ? a.reduce((s,x) => s+x, 0) / a.length : 0;
const r1 = x => Math.round(x * 10) / 10;
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

/* ---- 날씨 받아올 주소 (앱과 시리 브리핑 서버가 똑같이 써요) ---- */
function wxUrls(lat, lon, days = DAYS, aqDays = 5){ // 서버는 오늘 브리핑만 만들어서 짧게(2일) 받아요 — 오늘 값은 똑같아요
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=${days}`;
  return {
    main: base + `&past_days=1&current=temperature_2m,apparent_temperature,weather_code,is_day` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&wind_speed_unit=ms`,
    models: base + `&hourly=apparent_temperature&models=${WX_MODELS.join(',')}`,
    aq: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=${aqDays}&hourly=pm10,pm2_5,dust,ozone`,
  };
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
    const dow = nowDate().getDay(), arr = PH.dow[dow];
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
function totalParts(mode, infos, cols, PP, umb, main){
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
  return {mainTxt, lines, bring: bringList(mode, infos, umb, cols)};
}
function totalBrief(mode, infos, cols, PP, umb, main){
  const {mainTxt, lines, bring} = totalParts(mode, infos, cols, PP, umb, main);
  return `<div class="total"><div class="tt">💡 옷차림 한 줄 정리</div><div>${mainTxt}</div>` +
    (bring.length ? `<div class="bring"><span style="border:0;background:none;padding-left:0">🎒 챙길 것</span>${bring.map(b => `<span>${b}</span>`).join('')}</div>` : '') +
    (lines.length ? `<ul>${lines.map(l => typeof l === 'string' ? `<li>${l}</li>` : `<li class="${l.stop ? 'stop' : 'umbl'}">${l.html}</li>`).join('')}</ul>` : '') + '</div>';
}
// 어제 입은 기록과 비교한 한 줄
function yesterdayLine(mode, main){
  if (!isToday(main) || main.vsPrev == null) return null;
  const yd = nowDate(); yd.setDate(yd.getDate() - 1);
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
  const now = nowDate().getTime();
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
  const rated = recs.filter(r => r.rating).sort((a,b) => b.date < a.date ? -1 : b.date > a.date ? 1 : 0).slice(0, 20); // 날짜(YYYY-MM-DD)는 글자 순서 = 날짜 순서
  const b = avg(rated.map(r => r.rating === 'cold' ? 1 : r.rating === 'hot' ? -1 : 0));
  if (rated.length >= 3 && Math.abs(b) >= 0.4)
    return { lv: shift(mode, def, Math.sign(b)), mine: true,
      why: b > 0 ? say(PH.why.coldy, 'w.c') : say(PH.why.hoty, 'w.h') };
  return { lv: def, mine: false,
    why: say(recs.length ? PH.why.defSome : PH.why.def, 'w.d', {m: mode.name}) };
}

/* ---- 위치: 국내 행정구역 (regions.js) ---- */
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
// 가장 가까운 읍·면·동 (좌표만 먼저 훑고, 찾은 한 곳만 이름을 만들어요 — 서버에서도 빠르게)
let KRP = null;
function nearestKR(lat, lon){
  KRP ||= (window.KR_DONG || '').split('\n').filter(Boolean).map(line => { const p = line.split('|'); return [+p[3], +p[4], line]; });
  let best = null, bd = 1e9; const c = Math.cos(lat * Math.PI / 180);
  for (const [la, lo, line] of KRP){ const dx = (lo - lon) * c, dy = la - lat, d = dx*dx + dy*dy; if (d < bd){ bd = d; best = line; } }
  if (!best || Math.sqrt(bd) * 111 >= 15) return null;
  const [si, g, d, la, lo] = best.split('|'), sido = KR_SIDO[+si], ss = SIDO_SHORT(sido), gg = sggFmt(g);
  return {sido, ss, g: gg, d, lat: +la, lon: +lo, full: [ss, gg, d].filter(Boolean).join(' '), hay: `${sido} ${ss} ${g} ${gg} ${d}`};
}

/* ---- 증시·뉴스 자동 정리 (AI 요약이 없을 때) ---- */
const fmt = (v, dec = 2) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('ko-KR', {minimumFractionDigits: dec, maximumFractionDigits: dec});
const sgn = (v, dec = 2) => v == null || isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), dec);
const pctTxt = v => v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
function ruleMarketBrief(M){
  const L = [], P = PH.mk, W = Object.fromEntries((M.world || []).map(x => [x.id, x]));
  const word = p => p >= 1.5 ? say(P.surge, 'mk.w' + p) : p >= 0.4 ? say(P.rise, 'mk.r' + p) : p > 0 ? '강보합' : p > -0.4 ? (p === 0 ? '보합' : '약보합') : p > -1.5 ? say(P.fall, 'mk.f' + p) : say(P.plunge, 'mk.p' + p);
  if (W['.INX']){
    const sp = W['.INX'].pct, nq = W['.IXIC']?.pct ?? 0;
    const movers = [...(M.us?.map || [])].slice(0, 40).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 2);
    L.push(say(P.us, 'mk.us', {sp: pctTxt(sp), nq: pctTxt(nq), w: word((sp + nq) / 2),
      mv: movers.map(x => `${x.name} ${pctTxt(x.pct)}`).join(', ')}));
  }
  const k = (M.kr?.indices || []).find(x => x.id === 'KOSPI'), q = (M.kr?.indices || []).find(x => x.id === 'KOSDAQ');
  if (k){
    const inv = M.kr.investor?.KOSPI || {};
    const big = [['외국인', inv.foreign], ['기관', inv.inst], ['개인', inv.personal]].filter(x => x[1] != null).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    L.push(say(P.kr, 'mk.kr', {k: fmt(k.price), kp: pctTxt(k.pct), q: q ? fmt(q.price) : '–', qp: q ? pctTxt(q.pct) : '–', w: word(k.pct),
      who: big ? big[0] : '', amt: big ? `${fmt(Math.abs(big[1]), 0)}억 ${big[1] > 0 ? '순매수' : '순매도'}` : ''}));
  }
  const mac = M.macro || {}, f = id => [...(mac.exchange || []), ...(mac.bond || []), ...(mac.energy || []), ...(mac.metals || [])].find(x => x.id === id);
  const usd = f('FX_USDKRW'), y10 = f('US10YT=RR'), wti = f('CLcv1'), gold = f('GCcv1');
  if (usd && y10) L.push(say(P.fx, 'mk.fx', {usd: fmt(usd.price, 1), uc: sgn(usd.chg, 1), y: fmt(y10.price, 3), bp: sgn(y10.chg * 100, 1),
    yw: y10.chg < 0 ? '내려' : '올라', uw: usd.chg > 0 ? '올랐어요' : usd.chg < 0 ? '내렸어요' : '제자리예요'}));
  if (wti && gold) L.push(say(P.cmd, 'mk.cm', {wti: fmt(wti.price), wp: pctTxt(wti.pct), gold: fmt(gold.price, 1), gp: pctTxt(gold.pct)}));
  const btc = (M.crypto?.coins || [])[0], fg = M.crypto?.fg;
  if (btc){
    const kp = btc.krw && usd ? (btc.krw / (btc.price * usd.price) - 1) * 100 : null;
    L.push(say(P.coin, 'mk.co', {p: fmt(btc.price, 0), pc: pctTxt(btc.pct), kp: kp == null ? '' : ` · 김치 프리미엄 ${kp >= 0 ? '+' : ''}${kp.toFixed(1)}%`,
      fg: fg ? ` · 코인 심리 '${FG_KO(fg.value)}'(${fg.value})` : ''}));
  }
  const vix = W['.VIX'];
  if (vix) L.push(vix.price >= 30 ? say(P.vixHigh, 'mk.vh', {v: fmt(vix.price)}) : vix.price >= 20 ? say(P.vixMid, 'mk.vm', {v: fmt(vix.price)}) : say(P.vixLow, 'mk.vl', {v: fmt(vix.price)}));
  return L;
}
const FG_KO = v => v <= 24 ? '극단적 공포' : v <= 44 ? '공포' : v <= 55 ? '중립' : v <= 75 ? '탐욕' : '극단적 탐욕';
const CAT_E = {markets: '📈', economy: '🏛️', bonds: '💵', commodities: '🛢️', crypto: '🪙', tech: '🤖', people: '👤', korea: '🇰🇷', world: '🌏'};
function newsTitle(x){ return x.tk || x.t; }
function ruleNewsBrief(N){
  const P = PH.nw, out = [];
  const top = (N.top || []).slice(0, 4);
  top.forEach((x, i) => out.push(say(P.item, 'nw.i' + i, {e: CAT_E[x.c] || '📰', t: esc(newsTitle(x)), s: esc(x.s), n: x.n > 1 ? ` (${x.n}개 매체)` : ''})));
  if (N.digest && N.digest[0]) out.push('📊 ' + esc(N.digest[0]));
  return out;
}

/* ================== 🔊 오늘의 브리핑 ==================
   앱의 🔊 버튼과 시리 단축어가 이 함수 하나로 같은 문장을 만들어요.
   segs: [{sec, part, lang, text}] — part a(한국어) → b(영어 Talk Pick) → c(한국어 마무리) 순서
   (시리 단축어는 a·b·c를 한국어·영어·한국어 목소리로 차례대로 읽어요) */
const BRIEF_INTRO = '모닝픽 오늘의 브리핑이에요.';
const BRIEF_SECS = {intro: '시작', weather: '날씨', news: '뉴스', market: '증시', daily: 'Daily Up', end: '마무리'};
const hasBatchim = w => { const c = String(w || '').trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 !== 0 : /[0-9]$/.test(String(w).trim()) ? /[0136789]$/.test(String(w).trim()) : false; };
const jo = (w, a, b) => w + (hasBatchim(w) ? a : b);   // 받침 따라 조사 (이에요/예요, 은/는 …)
const tempSay = t => t == null || isNaN(t) ? '' : t < 0 ? `영하 ${Math.abs(Math.round(t))}도` : `${Math.round(t)}도`;
// 화면용 글(HTML·이모지·기호) → 소리 내어 읽기 좋은 한국어 문장
function speakable(s){
  let t = String(s == null ? '' : s)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{3030}\u{303D}\u{3297}\u{3299}\u{2122}\u{2139}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/비 감안 [−-](\d+)°/g, '비 때문에 $1도 춥게 잡았어요')
    .replace(/(\d+(?:\.\d+)?)°\s*↓/g, '$1도 낮아요').replace(/(\d+(?:\.\d+)?)°\s*↑/g, '$1도 높아요')
    .replace(/(^|[^\d.])[−-](\d+(?:\.\d+)?)°C?/g, '$1영하 $2도')
    .replace(/(\d+(?:\.\d+)?)°C?/g, '$1도').replace(/°/g, '도')
    .replace(/(\d)\s*mm\b/g, '$1밀리미터').replace(/(\d)\s*cm\b/g, '$1센티미터').replace(/(\d+(?:\.\d+)?)\s*m\/s\b/g, '초속 $1미터')
    .replace(/㎍\/㎥/g, '마이크로그램').replace(/%\s*p\b/g, '퍼센트포인트')
    .replace(/(^|[\s(,])[−-](?=\d)/g, '$1마이너스 ').replace(/(^|[\s(,])\+(?=\d)/g, '$1플러스 ').replace(/\s\+\s/g, ', ')
    .replace(/\s*~\s*/g, '에서 ')
    .replace(/\s*[→←↔↑↓]\s*/g, ', ').replace(/\s*[·|]\s*/g, ', ').replace(/\s+[—–]\s+/g, ', ')
    .replace(/\s*\(\s*/g, ', ').replace(/\s*\)\s*/g, ' ')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/([,.!?])\s*,/g, '$1').replace(/,{2,}/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '').trim();
  if (t && !/[.!?…]$/.test(t)) t += '.';
  return t;
}
const hmOf = iso => { // '2026-11-27T09:27+09:00' → '오전 9시 27분' (어제 자료면 '어제 …')
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso || ''); if (!m) return '';
  const y = nowDate(); y.setDate(y.getDate() - 1);
  const d = m[1] === todayStr() ? '' : m[1] === ymd(y) ? '어제 ' : `${+m[1].slice(5, 7)}월 ${+m[1].slice(8, 10)}일 `;
  return d + fmtHour(+m[2]) + (+m[3] ? ` ${+m[3]}분` : '');
};
function upcomingPeriod(PP){ const h = nowDate().getHours(), i = PP.findIndex(p => h <= p.h[1]); return i < 0 ? PP.length - 1 : i; }
const exOf = (mode, k, lv) => (mode.levels[k][lv[k]].ex || []).slice(0, 2);
// 옷 두께 → "겉옷 보통, 상의 얇게 …" + 겉옷 예시
function wearLine(mode, lv, head){
  const ex = exOf(mode, 'outer', lv);
  return `${head}${levelsText(mode, lv)}${ex.length ? ` · 겉옷은 ${ex.join(', ')} 정도` : ''}예요`;
}
function briefWeather(place){
  const mode = cur(); if (!mode || !S.wx) return [];
  const info = dayInfo(0, mode); if (!info) return [];
  window.VSEED = `${info.date}|${S.locSel}|${mode.id}|${whenOf(mode) || ''}`;  // 화면과 같은 문구가 고르게
  const P = periodic(mode), PP = PS(), out = [];
  const infos = P ? PP.map(p => dayInfo(0, mode, p.h)) : null;
  if (P && infos.some(x => !x)) return [];
  const dt = new Date(info.date + 'T00:00');
  out.push(`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${WD[dt.getDay()]}요일, ${place} 날씨예요`);
  out.push((info.now != null ? `지금은 ${tempSay(info.now)}, ` : '') + `오늘 최저 ${tempSay(info.tmin)}, 최고 ${jo(tempSay(info.tmax), '이에요', '예요')}`);
  const vs = info.vsPrev;
  if (vs != null) out.push(say(vs <= -2 ? PH.yday.colder : vs >= 2 ? PH.yday.warmer : PH.yday.same, 'yd', {n: Math.abs(vs), pv: info.prevLabel}));
  const umb = mode.when ? (sportAlert(info, mode) || umbrellaAlert(info, mode)) : umbrellaAlert(info, mode);
  if (umb) out.push(umb.html);
  if (P){
    const pb = periodBriefing(info, infos, mode);
    out.push(pb.headline);
    pb.lines.forEach(l => out.push(`${l.label}은 체감 ${tempSay(l.base)}, ${l.text}`));
    pb.flow.forEach(([, t]) => out.push(t));
    pb.items.forEach(([, t]) => out.push(t));
  } else {
    const w = WHEN[whenOf(mode)];
    out.push(`${mode.name.replace(/ \(.*\)/, '')} 하기 좋은 ${w.label} ${w.t} 기준, 체감 ${jo(tempSay(info.base), '이에요', '예요')}`);
    const br = briefing(info, mode);
    out.push(br.headline);
    br.items.forEach(([, t]) => out.push(t));
  }
  // 옷차림 (화면의 '옷차림 한 줄 정리' + 추천 두께)
  let tp, lv, why = '', head;
  if (P){
    const cols = infos.map(inf => { const r = recommend(mode, inf.base); return {r, inf, lv: {...r.lv}}; });
    const k = upcomingPeriod(PP);
    tp = totalParts(mode, infos, cols, PP, umb, info); lv = cols[k].lv; why = cols[k].r.mine ? cols[k].r.why : '';
    head = `${PP[k].label} 기준 추천은 `;
  } else {
    const r = recommend(mode, info.base);
    tp = totalParts(mode, [info], null, null, umb, info); lv = r.lv; why = r.mine ? r.why : '';
    head = '추천 옷차림은 ';
  }
  out.push(`옷차림이에요. ${tp.mainTxt}`);
  tp.lines.forEach(l => { if (typeof l === 'string') out.push(l); }); // 우산 알림은 위에서 읽었어요
  out.push(wearLine(mode, lv, head));
  if (why) out.push(why);
  const bring = tp.bring.map(b => speakable(b).replace(/\.$/, '')).filter(Boolean);
  if (bring.length) out.push(`챙길 것은 ${jo(bring.join(', '), '이에요', '예요')}`);
  // 등록한 아이 옷도 한 줄씩
  if (P) S.modes.filter(id => id !== mode.id && MODE[id] && MODE[id].kid).forEach(id => {
    const m = MODE[id], ins = PP.map(p => dayInfo(0, m, p.h)); if (ins.some(x => !x)) return;
    const k = upcomingPeriod(PP), r = recommend(m, ins[k].base);
    out.push(wearLine(m, r.lv, `${m.kid.name ? jo(m.kid.name, '이', '') : m.name} 옷은 ${PP[k].label} 기준 `));
  });
  return out;
}
function briefNews(N){
  if (!N) return [];
  const lines = (N.brief && N.brief.length) ? N.brief : ruleNewsBrief(N);
  if (!lines.length) return [];
  const out = [`이어서 뉴스예요. ${hmOf(N.updated)} 기준 핵심이에요`, ...lines];
  const n = S.noteOn === false ? null : (N.notes || []).find(x => x && x.title);
  if (n){ out.push(`오늘의 경제노트 주제는, ${n.title}`); if (n.takeaway) out.push(n.takeaway); }
  return out;
}
function briefMarket(M){
  if (!M) return [];
  const lines = (M.brief && M.brief.length) ? M.brief : ruleMarketBrief(M);
  if (!lines.length) return [];
  const out = [`이어서 증시예요. ${hmOf(M.updated)} 기준이에요`, ...lines];
  const h = M.commentary && M.commentary.headline;
  if (h) out.push(`오늘 시장을 한마디로 하면, ${h}`);
  return out;
}
// Daily Up: AI 한 스푼(한국어) → Talk Pick 질문(영어) → 해석·표현(한국어)
function briefDaily(D){
  const a = [], b = [], c = [];
  if (!D) return {a, b, c};
  const tip = S.tipOn === false ? null : (D.tips || []).find(x => x && x.title);
  const day = S.talkOn === false ? null : (D.talks || []).find(x => x && x.mid && x.high);
  const t = day && day[S.talkLv === 'high' ? 'high' : 'mid'];
  if (tip || t) a.push('마지막으로 Daily Up이에요');
  if (tip){ a.push(`AI 한 스푼, 오늘의 주제는 ${tip.title}`); if (tip.intro) a.push(tip.intro); if (tip.takeaway) a.push(tip.takeaway); }
  if (t && t.q){
    a.push('오늘의 Talk Pick 질문을 영어로 들려드릴게요');
    b.push(t.q);
    const s0 = (t.samples || []).find(x => x && x.en);
    if (s0) b.push(`Here's a sample answer. ${s0.en}`);
    if (t.ko) c.push(`우리말로는, ${t.ko}`);
    const ws = (t.words || []).filter(w => w && w.w && w.ko).slice(0, 3);
    if (ws.length) c.push(`질문 속 표현이에요. ${ws.map(w => `${w.w}, ${w.ko.replace(/\([^)]*\)/g, '').split(/[,;]/)[0].trim()}`).join('. ')}`);
  }
  return {a, b, c};
}
// opt: {news, market, daily, place} → {segs, place}
function buildBrief(opt = {}){
  const v0 = window.VSEED;   // 화면의 문구 선택 기준은 그대로 두고 돌려놓아요
  try { return buildBrief0(opt); } finally { window.VSEED = v0; }
}
function buildBrief0(opt){
  const place = opt.place || (S.loc ? S.loc.full || S.loc.name : '');
  const segs = [], add = (sec, part, lang, arr) => arr.forEach(x => { const t = lang === 'ko' ? speakable(x) : String(x || '').replace(/\s+/g, ' ').trim(); if (t) segs.push({sec, part, lang, text: t}); });
  add('intro', 'a', 'ko', [BRIEF_INTRO]);
  const w = briefWeather(place);
  add('weather', 'a', 'ko', w.length ? w : [S.loc ? '날씨는 지금 불러오지 못했어요' : '날씨는 모닝픽 앱에서 위치를 정하면 알려드릴게요']);
  add('news', 'a', 'ko', briefNews(opt.news));
  add('market', 'a', 'ko', briefMarket(opt.market));
  const d = briefDaily(opt.daily);
  add('daily', 'a', 'ko', d.a);
  add('daily', 'b', 'en', d.b.length ? d.b : ['Have a wonderful day!']);
  add('daily', 'c', 'ko', d.c);
  add('end', 'c', 'ko', ['오늘 브리핑은 여기까지예요. 좋은 하루 보내세요!']);
  return {segs, place};
}
// 시리용: 한국어(a) · 영어(b) · 한국어(c) 세 덩어리
function briefParts(br){
  const j = (p, sep) => br.segs.filter(s => s.part === p).map(s => s.text).join(sep);
  return {a: j('a', '\n'), b: j('b', ' '), c: j('c', '\n')};
}

window.MPCore = {setNow: f => { NOWFN = f || (() => new Date()); }, buildModes, buildBrief, briefParts, speakable, nearestKR, inKorea, wxUrls, MODE};
