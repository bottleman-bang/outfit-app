/* ================== 데이터 (뉴스·증시) 공통 ================== */
const DATA = (window.APP_CONFIG || {}).dataUrl || 'https://raw.githubusercontent.com/bottleman-bang/outfit-data/data/';
const DC = {};  // 메모리 캐시 {news, market}
function dcLoad(name){
  if (DC[name]) return DC[name];
  try { const c = JSON.parse(localStorage.getItem('outfit.' + name)); if (c && c.data) DC[name] = c; } catch(e){}
  return DC[name];
}
async function loadData(name, force){
  const c = dcLoad(name);
  if (!force && c && Date.now() - c.at < 8 * 60e3) return c.data;
  try {
    const r = await fetch(`${DATA}${name}.json?t=${Math.floor(Date.now() / 6e4)}`, {cache: 'no-store'});
    if (!r.ok) throw 0;
    const data = await r.json();
    DC[name] = {at: Date.now(), data};
    try { localStorage.setItem('outfit.' + name, JSON.stringify(DC[name])); } catch(e){}
    return data;
  } catch(e){
    if (c) return c.data;
    throw e;
  }
}
const ago = iso => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60e3);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`;
};
const hhmm = iso => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmt = (v, dec = 2) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('ko-KR', {minimumFractionDigits: dec, maximumFractionDigits: dec});
const sgn = (v, dec = 2) => v == null || isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), dec);
const pctTxt = v => v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
const updn = v => v > 0.004 ? 'up' : v < -0.004 ? 'dn' : 'fl';
const krVal = v => v == null ? '–' : v >= 1e6 ? `${(v / 1e6).toFixed(2)}조` : `${fmt(v / 100, 0)}억`;          // 백만원 → 조/억
const krCap = v => v == null ? '–' : v >= 1e4 ? `${fmt(v / 1e4, v >= 1e5 ? 0 : 1)}조` : `${fmt(v, 0)}억`;       // 억원
const usVal = v => v == null ? '–' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}조` : v >= 1e8 ? `${fmt(v / 1e8, 0)}억 달러` : `${fmt(v / 1e4, 0)}만 달러`;
function spark(arr, cls, w = 74, h = 26){
  if (!arr || arr.length < 2) return '';
  const mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spk ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function upColors(){
  document.documentElement.classList.toggle('usclr', S.upColor === 'us');
}

/* ================== 증시 탭 ================== */
let MK_MAP = null; // 마켓맵 타일 정보 (탭할 때)
function statusKo(s){ return s === 'OPEN' ? '장중' : s === 'CLOSE' ? '마감' : s === 'PREOPEN' ? '장 시작 전' : ''; }

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

function idxTile(x, big){
  const c = updn(x.pct);
  return `<a class="idx ${big ? 'ibig' : ''}" href="${esc(x.url || '#')}" target="_blank" rel="noopener">
    <div class="in">${esc(x.name)}<small>${statusKo(x.status)}</small></div>
    <div class="ip ${c}">${fmt(x.price)}</div>
    <div class="ic ${c}">${sgn(x.chg)} (${pctTxt(x.pct)})</div>${spark(x.spark, c, big ? 140 : 74, big ? 34 : 26)}</a>`;
}
function macroRow(x, unit = '', dec = 2, bp){
  if (!x) return '';
  const c = updn(x.pct ?? x.chg);
  return `<div class="mrw"><span class="mn">${esc(x.name)}</span><span class="mv">${fmt(x.price, dec)}${unit}</span>
    <span class="mc ${c}">${bp ? sgn(x.chg * 100, 1) + 'bp' : pctTxt(x.pct)}</span></div>`;
}

function treemap(items, W, H){
  const total = items.reduce((a, b) => a + b.v, 0);
  if (!total || W <= 0 || H <= 0) return [];
  const scale = W * H / total;
  let rest = items.map(it => ({...it, a: it.v * scale})), x = 0, y = 0, w = W, h = H;
  const out = [], worst = (row, len) => {
    const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a));
    return Math.max(len * len * mx / (s * s), (s * s) / (len * len * mn));
  };
  while (rest.length){
    const len = Math.min(w, h); let row = [rest[0]], i = 1;
    while (i < rest.length && worst(row.concat(rest[i]), len) <= worst(row, len)){ row.push(rest[i]); i++; }
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h){ const rw = s / h; let yy = y; for (const r of row){ const rh = r.a / rw; out.push({...r, x, y: yy, w: rw, h: rh}); yy += rh; } x += rw; w -= rw; }
    else { const rh = s / w; let xx = x; for (const r of row){ const r2 = r.a / rh; out.push({...r, x: xx, y, w: r2, h: rh}); xx += r2; } y += rh; h -= rh; }
    rest = rest.slice(row.length);
  }
  return out;
}
function heat(p){
  const i = Math.min(Math.abs(p || 0) / 4, 1);
  if (Math.abs(p || 0) < 0.05) return ['var(--flat-bg)', 'var(--ink)'];
  const up = S.upColor === 'us' ? 150 : 4, dn = S.upColor === 'us' ? 4 : 214, hue = p > 0 ? up : dn;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const L = dark ? 26 + 14 * i : 88 - 40 * i;
  return [`hsl(${hue} ${p > 0 ? 62 : 58}% ${L}%)`, (dark || i > 0.55) ? '#fff' : 'var(--ink)'];
}
function renderMap(M, mkt){
  const box = $('#mkMap'); if (!box) return;
  const list = mkt === 'kr' ? (M.kr?.map || []).filter(x => x.cap) : (M.us?.map || []);
  if (!list.length){ box.innerHTML = '<div class="empty" style="padding:30px">데이터가 없어요</div>'; return; }
  const W = box.clientWidth || 340, H = Math.round(Math.min(460, Math.max(300, W * 1.05)));
  box.style.height = H + 'px';
  const groups = {};
  list.forEach(x => (groups[x.sector] ||= []).push(x));
  const secs = Object.entries(groups).map(([name, L]) => ({name, L, v: L.reduce((a, b) => a + Math.pow(b.cap, 0.8), 0)})).sort((a, b) => b.v - a.v);
  MK_MAP = [];
  let html = '';
  for (const sr of treemap(secs, W, H)){
    const head = sr.w > 54 && sr.h > 44 ? 15 : 0;
    html += `<div class="sec" style="left:${sr.x}px;top:${sr.y}px;width:${sr.w}px;height:${sr.h}px">${head ? `<span class="sl">${esc(sr.name)}</span>` : ''}</div>`;
    const tiles = treemap(sr.L.map(s => ({...s, v: Math.pow(s.cap, 0.8)})).sort((a, b) => b.v - a.v), sr.w - 2, sr.h - head - 2);
    for (const t of tiles){
      const [bg, fg] = heat(t.pct), mn = Math.min(t.w, t.h), i = MK_MAP.push(t) - 1;
      const fs = Math.max(8.5, Math.min(15, mn / 3.6));
      const lbl = mn >= 26 && t.w >= 34 ? `<b style="font-size:${fs}px">${esc(t.name)}</b>${mn >= 34 ? `<i style="font-size:${Math.max(8, fs - 2)}px">${pctTxt(t.pct)}</i>` : ''}` : '';
      html += `<button class="tile" data-i="${i}" style="left:${sr.x + 1 + t.x}px;top:${sr.y + head + 1 + t.y}px;width:${Math.max(0, t.w - 1)}px;height:${Math.max(0, t.h - 1)}px;background:${bg};color:${fg}">${lbl}</button>`;
    }
  }
  box.innerHTML = html;
}
function topRows(L, mkt){
  if (!L || !L.length) return '<div class="empty" style="padding:24px">데이터가 없어요</div>';
  return L.map((x, i) => {
    const c = updn(x.pct);
    const url = mkt === 'kr' ? `https://m.stock.naver.com/domestic/stock/${x.code}/total` : `https://finance.yahoo.com/quote/${encodeURIComponent((x.sym || '').replace('/', '-'))}`;
    return `<a class="trow" href="${url}" target="_blank" rel="noopener"><span class="rk">${i + 1}</span>
      <span class="tn">${esc(x.name)}<small>${mkt === 'kr' ? (x.mkt === 'KOSDAQ' ? '코스닥' : '코스피') : esc(x.sym)}</small></span>
      <span class="tp">${mkt === 'kr' ? fmt(x.price, 0) + '원' : '$' + fmt(x.price)}<small>${mkt === 'kr' ? krVal(x.val) : usVal(x.val)}</small></span>
      <span class="tc ${c}">${pctTxt(x.pct)}</span></a>`;
  }).join('');
}
function calRows(M){
  const now = Date.now() - 2 * 3600e3;
  const ev = (M.calendar || []).filter(e => new Date(e.t) >= now);
  const ea = M.earnings || [];
  let html = '';
  if (ev.length){
    let lastDay = '';
    html += ev.slice(0, 14).map(e => {
      const d = new Date(e.t), key = `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
      const head = key !== lastDay ? `<div class="cday">${key}${d.toDateString() === new Date().toDateString() ? ' · 오늘' : ''}</div>` : '';
      lastDay = key;
      return head + `<div class="crow"><span class="ct">${hhmm(e.t)}</span><span class="cf">${e.flag}</span>
        <span class="cn">${esc(e.ko || e.en)}${e.imp === 'High' ? ' <b class="imp">중요</b>' : ''}<small>${[e.a && '발표 ' + e.a, e.f && '예상 ' + e.f, e.p && '이전 ' + e.p].filter(Boolean).join(' · ')}</small></span></div>`;
    }).join('');
  } else html += '<div class="why" style="padding:6px 2px">이번 주 남은 주요 일정이 없어요</div>';
  if (ea.length){
    html += `<div class="cday">💼 미국 실적 발표 (시총 300억 달러 이상)</div>` + ea.slice(0, 10).map(e =>
      `<div class="crow"><span class="ct">${e.date.slice(5).replace('-', '/')}</span><span class="cf">🇺🇸</span><span class="cn">${esc(e.name)} <small style="display:inline">${esc(e.sym)} ${e.time ? '· ' + e.time : ''}</small>
       <small>${e.eps ? `EPS ${esc(e.eps)} (예상 ${esc(e.est)})` : e.est ? `예상 EPS ${esc(e.est)}` : ''}</small></span></div>`).join('');
  }
  return html;
}

async function renderMarket(force){
  upColors();
  const el = $('#mkBody');
  let M = dcLoad('market')?.data;
  if (!M || force){
    if (!M) el.innerHTML = '<div class="empty"><div class="e">📈</div>시장 데이터를 불러오는 중이에요…</div>';
    try { M = await loadData('market', force); } catch(e){ if (!M){ el.innerHTML = '<div class="empty"><div class="e">📡</div>데이터를 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.</div>'; return; } }
  } else if (Date.now() - (dcLoad('market')?.at || 0) > 8 * 60e3) loadData('market').then(() => renderMarket()).catch(() => {});
  const age = (Date.now() - new Date(M.updated)) / 60e3;
  $('#mkUpd').textContent = `${ago(M.updated)} 업데이트${age > 180 ? ' · 자동 업데이트 대기 중' : ''}`;
  const mac = M.macro || {}, find = (cat, id) => (mac[cat] || []).find(x => x.id === id);
  const brief = (M.brief && M.brief.length) ? M.brief : ruleMarketBrief(M);
  const regions = ['미국', '아시아', '유럽'];
  const inv = M.kr?.investor || {};
  const invRow = (k, lab) => { const v = inv[k]; if (!v) return '';
    const mx = Math.max(1, ...['personal', 'foreign', 'inst'].map(z => Math.abs(v[z] || 0)));
    return `<div class="invh">${lab}</div>` + [['개인', 'personal'], ['외국인', 'foreign'], ['기관', 'inst']].map(([n, z]) => `<div class="inv"><span>${n}</span>
      <span class="bar"><i class="${updn(v[z])}" style="width:${Math.abs(v[z] || 0) / mx * 50}%;${(v[z] || 0) >= 0 ? 'left:50%' : `right:50%`}"></i></span>
      <b class="${updn(v[z])}">${sgn(v[z], 0)}억</b></div>`).join(''); };
  const usd = find('exchange', 'FX_USDKRW');
  const coins = (M.crypto?.coins || []).map(c => {
    const kp = c.krw && usd ? (c.krw / (c.price * usd.price) - 1) * 100 : null;
    return `<div class="mrw"><span class="mn">${esc(c.sym)} <small>${esc(c.name)}</small></span>
      <span class="mv">$${fmt(c.price, c.price < 10 ? 3 : c.price < 1000 ? 2 : 0)}${c.krw ? `<small>${fmt(c.krw, c.krw < 1000 ? 1 : 0)}원${kp != null ? ` · 김프 ${kp >= 0 ? '+' : ''}${kp.toFixed(1)}%` : ''}</small>` : ''}</span>
      <span class="mc ${updn(c.pct)}">${pctTxt(c.pct)}</span></div>`; }).join('');
  const fg = M.crypto?.fg;
  const mkt = S.mapMkt || S.mkt || 'kr', tk = S.topKind || 'value', tm = S.topMkt || S.mkt || 'kr';
  el.innerHTML = `
    <section class="card mbrief"><div class="tt">📌 시장 한눈에 <span class="badge">${M.ai && M.brief?.length ? 'AI 요약' : '자동 정리'}</span></div>
      <ul>${brief.map(l => `<li>${l}</li>`).join('')}</ul></section>
    <section class="card"><h2>🇰🇷 국내</h2><div class="idxg">${(M.kr?.indices || []).map(x => idxTile(x, true)).join('')}</div>
      ${inv.KOSPI ? `<div class="invbox">${invRow('KOSPI', '코스피 투자자별 순매수')}${invRow('KOSDAQ', '코스닥')}</div>` : ''}</section>
    <section class="card"><h2>🌏 해외 지수</h2>${regions.map(r => {
      const L = (M.world || []).filter(x => x.region === r); if (!L.length) return '';
      return `<div class="rg">${r}</div><div class="idxg sm">${L.map(x => idxTile(x)).join('')}</div>`; }).join('')}</section>
    <section class="card"><h2>💱 환율 · 금리 · 원자재</h2>
      <div class="mgrid">
        <div><div class="rg">환율</div>${(mac.exchange || []).map(x => macroRow(x, x.id === '.DXY' ? '' : '원', x.id === '.DXY' ? 2 : 2)).join('')}</div>
        <div><div class="rg">국채 10년물 금리</div>${(mac.bond || []).map(x => macroRow({...x, name: x.name.replace(' 국채 10년', '')}, '%', 3, true)).join('')}</div>
        <div><div class="rg">원자재</div>${[...(mac.energy || []).filter(x => ['CLcv1', 'LCOcv1', 'NGcv1'].includes(x.id)), ...(mac.metals || []).filter(x => x.id !== 'M04020000')].map(x => macroRow(x, '', 2)).join('')}</div>
        <div><div class="rg">기준금리</div>${(mac.standardInterest || []).map(x => `<div class="mrw"><span class="mn">${esc(x.name.replace('미국연방준비은행', '미국 연준'))}</span><span class="mv">${fmt(x.price, 2)}%</span><span class="mc fl"></span></div>`).join('')}</div>
      </div></section>
    <section class="card"><h2>🪙 코인 ${fg ? `<span class="fgb">공포탐욕 ${fg.value} · ${FG_KO(fg.value)}</span>` : ''}</h2>${coins}</section>
    <section class="card"><div class="mhead"><h2>🗺️ 마켓맵</h2><div class="seg2" id="mapTabs"><button data-m="kr" class="${mkt === 'kr' ? 'on' : ''}">국내</button><button data-m="us" class="${mkt === 'us' ? 'on' : ''}">미국</button></div></div>
      <div class="why" style="margin:0 0 8px">크기는 시가총액, 색은 오늘 등락률이에요 · 칸을 누르면 자세히</div>
      <div class="tmap" id="mkMap"></div><div class="tmleg"><span class="dn">−4%</span><span class="lg"></span><span class="up">+4%</span></div></section>
    <section class="card"><div class="mhead"><h2>🔥 인기 TOP 10</h2><div class="seg2" id="topMkt"><button data-m="kr" class="${tm === 'kr' ? 'on' : ''}">국내</button><button data-m="us" class="${tm === 'us' ? 'on' : ''}">미국</button></div></div>
      <div class="variants" id="topKind" style="margin:4px 0 10px"><button data-k="value" class="${tk === 'value' ? 'on' : ''}">💰 거래대금</button><button data-k="up" class="${tk === 'up' ? 'on' : ''}">🔺 상승</button><button data-k="down" class="${tk === 'down' ? 'on' : ''}">🔻 하락</button></div>
      <div id="topList">${topRows(((tm === 'kr' ? M.kr : M.us)?.top || {})[tk], tm)}</div>
      <div class="why" style="margin:8px 0 0;font-size:12.5px">${tm === 'kr' ? '상승·하락은 거래대금 100억 원 이상 종목 기준' : '상승·하락은 시가총액 50억 달러 이상 종목 기준'}</div></section>
    <section class="card"><h2>📅 이번 주 경제 일정</h2>${calRows(M)}</section>
    <p class="disc">투자 참고용이며 투자 권유가 아니에요. 데이터는 네이버 증권·Nasdaq·CoinGecko·Upbit·ForexFactory 등 무료 공개 자료이고 15분 이상 늦을 수 있어요.</p>`;
  renderMap(M, mkt);
  trackDaily('tab/market', '증시 탭');
}
document.addEventListener('click', e => {
  const t = e.target.closest('#mapTabs button'); if (t){ S.mapMkt = t.dataset.m; save(); renderMarket(); return; }
  const tm = e.target.closest('#topMkt button'); if (tm){ S.topMkt = tm.dataset.m; save(); renderMarket(); return; }
  const tk = e.target.closest('#topKind button'); if (tk){ S.topKind = tk.dataset.k; save(); renderMarket(); return; }
  const tile = e.target.closest('#mkMap .tile');
  if (tile && MK_MAP){
    const x = MK_MAP[+tile.dataset.i], kr = !!x.code;
    $('#tipBox').innerHTML = `<b>${esc(x.name)}</b> <span class="${updn(x.pct)}">${pctTxt(x.pct)}</span><br>
      <small>${kr ? fmt(x.price, 0) + '원 · 시총 ' + krCap(x.cap) + ' · 거래대금 ' + krVal(x.val) : '$' + fmt(x.price) + ' · 시총 ' + usVal(x.cap) + ' · ' + esc(x.sector)}</small>
      <a href="${kr ? `https://m.stock.naver.com/domestic/stock/${x.code}/total` : `https://finance.yahoo.com/quote/${encodeURIComponent(x.sym.replace('/', '-'))}`}" target="_blank" rel="noopener">자세히 보기 ›</a>`;
    $('#tipBox').classList.add('on'); clearTimeout(renderMarket.tt); renderMarket.tt = setTimeout(() => $('#tipBox').classList.remove('on'), 4500);
  }
});
addEventListener('resize', () => { if ($('#v-market')?.classList.contains('on')){ const M = dcLoad('market')?.data; if (M) renderMap(M, S.mapMkt || S.mkt || 'kr'); } });
