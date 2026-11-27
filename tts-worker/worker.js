// 모닝픽 서버 — Cloudflare Workers 무료 플랜 (한도를 넘으면 멈출 뿐 요금은 나가지 않아요)
//  /        영어 읽기: Workers AI (Deepgram Aura-2). 같은 문장은 KV에 저장해 무료 사용량을 아껴요.
//  /brief   🔊 오늘의 브리핑 (시리 단축어·AI 비서용): 앱과 똑같은 core.js로 날씨·뉴스·증시·Daily Up 문장을 만들어요.
//           ?u=<내 코드>&lat=&lon= (폰의 지금 위치, 없으면 앱에서 마지막으로 본 위치) &fmt=siri|text|json
//  /sync    앱이 브리핑에 필요한 설정·위치·옷 기록을 보관/삭제 (앱 설정에서 '시리·AI 비서로 듣기'를 켠 사람만)
import './prelude.js';
import '../concepts.js';
import '../phrases.js';
import '../regions.js';
import '../core.js';

const C = globalThis.MPCore;
// 서버가 켜질 때 한 번 미리 돌려 둬요 (행정구역 좌표 읽기 + 가짜 날씨로 브리핑 한 번) → 실제 요청은 빠르게
(function warmUp() {
  try {
    C.nearestKR(36.35, 127.38);
    const N = 72, t0 = Date.UTC(2026, 0, 1), arr = f => Array.from({ length: N }, (_, k) => f(k));
    const time = arr(k => new Date(t0 + k * 3600e3).toISOString().slice(0, 13) + ':00');
    const wave = k => 5 + 6 * Math.sin(((k % 24) - 9) / 24 * 2 * Math.PI);
    const main = { utc_offset_seconds: 32400, current: { time: '2026-01-02T10:00', temperature_2m: 8 },
      hourly: { time, temperature_2m: arr(wave), apparent_temperature: arr(k => wave(k) - 2), precipitation_probability: arr(k => (k % 24 > 15 ? 50 : 10)),
        precipitation: arr(k => (k % 24 === 17 ? 0.6 : 0)), snowfall: arr(() => 0), weather_code: arr(k => (k % 24 === 17 ? 61 : 2)), cloud_cover: arr(k => (k * 7) % 100),
        wind_speed_10m: arr(k => 2 + (k % 6)), wind_gusts_10m: arr(k => 5 + (k % 9)), wind_direction_10m: arr(k => (k * 15) % 360),
        is_day: arr(k => (k % 24 >= 7 && k % 24 <= 17 ? 1 : 0)), relative_humidity_2m: arr(k => 40 + (k % 30)) },
      daily: { time: ['2026-01-01', '2026-01-02', '2026-01-03'], weather_code: [2, 61, 1], temperature_2m_max: [11, 9, 12], temperature_2m_min: [1, 0, 2],
        precipitation_sum: [0, 0.6, 0], precipitation_probability_max: [10, 50, 5], wind_speed_10m_max: [6, 7, 4], uv_index_max: [3, 2, 4],
        sunrise: ['2026-01-01T07:40', '2026-01-02T07:40', '2026-01-03T07:41'], sunset: ['2026-01-01T17:25', '2026-01-02T17:26', '2026-01-03T17:27'] } };
    const mt = time.slice(24), models = { hourly: { time: mt, apparent_temperature_ecmwf_ifs025: mt.map((_, k) => wave(k + 24) - 1), apparent_temperature_gfs_seamless: mt.map((_, k) => wave(k + 24) - 3) } };
    const aq = { hourly: { time, pm10: arr(k => 20 + (k % 40)), pm2_5: arr(k => 10 + (k % 30)), dust: arr(() => 0), ozone: arr(() => 50) } };
    globalThis.S = { mode: 'daily', modes: ['daily', 'kid-w'], kids: [{ id: 'w', name: '예열', year: 2020 }], periods: ['am', 'pm', 'eve'], when: {},
      records: [{ date: '2025-12-31', mode: 'daily', temp: 5, levels: { outer: 2, top: 1, bottom: 1, extra: 0 }, rating: 'good' },
        { date: '2025-12-30', mode: 'daily', temp: 1, levels: { outer: 3, top: 1, bottom: 2, extra: 1 }, rating: 'cold' }],
      locSel: 'gps', loc: { lat: 36.35, lon: 127.38, name: '둔산동', full: '대전 서구 둔산동', gps: true }, wx: { main, models, aq, at: -1 } };
    C.setNow(() => new Date(Date.UTC(2026, 0, 2, 10)));
    C.buildModes(S.kids);
    C.briefParts(C.buildBrief({ news: { updated: '2026-01-02T08:00+09:00', brief: ['코스피 −1.2% (+3°) · 테스트'], notes: [{ title: '노트', takeaway: '정리' }] },
      market: { updated: '2026-01-02T08:00+09:00', brief: ['나스닥 +0.3%'], commentary: { headline: '한마디' } },
      daily: { talks: [{ date: '2026-01-02', mid: { q: 'How are you?', ko: '어때요?', words: [{ w: 'how', ko: '어떻게 (방법)' }], samples: [{ en: 'Fine.' }] }, high: { q: 'Why?' } }],
        tips: [{ title: '팁', intro: '소개', takeaway: '정리' }] } }));
  } catch (e) { /* 예열은 실패해도 괜찮아요 */ } finally { C.setNow(null); globalThis.S = undefined; }
})();
const VOICES = { us: 'thalia', uk: 'pandora' };
const ALLOW = /^(https:\/\/([a-z0-9-]+\.)?morningpick\.pages\.dev|https:\/\/bottleman-bang\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const DATA = 'https://raw.githubusercontent.com/bottleman-bang/outfit-data/data/';
const ID = /^[a-f0-9]{32}$/;
const PERIOD_KEYS = ['dawn', 'am', 'pm', 'eve', 'night'];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/brief') return brief(url, env);
    if (url.pathname === '/sync') return sync(req, url, env);
    return tts(req, url, env, ctx);
  },
};

/* ---------------- 영어 읽기 ---------------- */
async function tts(req, url, env, ctx) {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': ALLOW.test(origin) ? origin : 'https://morningpick.pages.dev', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
  const text = (url.searchParams.get('t') || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const v = url.searchParams.get('v') === 'uk' ? 'uk' : 'us';
  if (!text || /[가-힣]/.test(text)) return new Response('bad text', { status: 400, headers: cors });
  if (origin && !ALLOW.test(origin)) return new Response('forbidden', { status: 403, headers: cors });
  // 같은 문장은 저장해 둔 소리로 (무료 사용량 절약, 60일 보관)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`aura2:${v}:${text}`));
  const key = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''); // KV 키 길이 제한(512B) 때문에 해시로
  let mp3 = await env.TTS.get(key, 'arrayBuffer');
  if (!mp3) {
    try {
      const out = await env.AI.run('@cf/deepgram/aura-2-en', { text, speaker: VOICES[v], encoding: 'mp3' }, { returnRawResponse: true });
      if (!out.ok) return new Response('tts error', { status: 502, headers: cors });
      mp3 = await out.arrayBuffer();
      if (mp3.byteLength < 500) return new Response('tts empty', { status: 502, headers: cors });
      ctx.waitUntil(env.TTS.put(key, mp3, { expirationTtl: 60 * 86400 }).catch(() => {}));
    } catch (e) {
      return new Response('tts error: ' + (e.message || e), { status: 502, headers: cors });
    }
  }
  return new Response(mp3, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000' } });
}

/* ---------------- 🔊 오늘의 브리핑 ---------------- */
const OPEN = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const json = o => new Response(JSON.stringify(o), { headers: { ...OPEN, 'Content-Type': 'application/json; charset=utf-8' } });
const plain = s => new Response(s, { headers: { ...OPEN, 'Content-Type': 'text/plain; charset=utf-8' } });
const memo = new Map(); // 같은 서버 인스턴스 안에서 잠깐 재사용
async function cached(key, ms, fn) {
  const m = memo.get(key);
  if (m && Date.now() - m.at < ms) return m.v;
  const v = await fn();
  if (v != null) { memo.set(key, { at: Date.now(), v }); if (memo.size > 60) memo.delete(memo.keys().next().value); }
  return v;
}
const getJSON = u => fetch(u, { headers: { 'User-Agent': 'morningpick-brief' } }).then(r => (r.ok ? r.json() : null)).catch(() => null);
let wxSeq = 0;
const weather = (lat, lon) => cached(`wx:${lat},${lon}`, 5 * 60e3, async () => {
  const u = C.wxUrls(lat, lon, 2, 2); // 오늘 브리핑만 → 2일치 (앱의 16일치와 오늘 값은 같아요)
  const [main, models, aq] = await Promise.all([getJSON(u.main), getJSON(u.models), getJSON(u.aq)]);
  return main && main.hourly && main.daily ? { main, models: models && models.hourly ? models : null, aq: aq && aq.hourly ? aq : null, at: Date.now() * 1000 + (++wxSeq % 1000) } : null;
});
const data = name => cached('d:' + name, 3 * 60e3, () => getJSON(`${DATA}${name}.json?t=${Math.floor(Date.now() / 6e4)}`));
const km = (a, b) => { const r = Math.PI / 180, y = (b.lat - a.lat) * r, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r); return 6371 * Math.hypot(x, y); };
const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : null; };

async function brief(url, env) {
  const fmt = url.searchParams.get('fmt') || 'text';
  const reply = (p, extra = {}) => fmt === 'siri' ? json(p) : fmt === 'json' ? json({ ...p, ...extra }) : plain([p.a, p.b, p.c].filter(Boolean).join('\n'));
  const fail = msg => reply({ a: msg, b: 'See you soon!', c: '모닝픽 앱을 한 번 열어 주세요.' });
  const id = (url.searchParams.get('u') || '').toLowerCase();
  if (!ID.test(id)) return fail('브리핑 주소가 올바르지 않아요. 모닝픽 앱 설정에서 주소를 다시 복사해 주세요.');
  const prof = await env.TTS.get('p:' + id, 'json');
  if (!prof) return fail('아직 브리핑 준비가 안 됐어요. 모닝픽 앱 설정에서 시리·AI 비서로 듣기를 켜 주세요.');

  // 위치: 폰의 지금 위치 → 못 받으면 앱에서 마지막으로 본 위치
  let loc = prof.loc, locSel = prof.locSel || 'gps', src = 'app';
  const la = num(url.searchParams.get('lat')), lo = num(url.searchParams.get('lon'));
  if (la != null && lo != null && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) {
    const here = { lat: +la.toFixed(3), lon: +lo.toFixed(3) };
    if (prof.loc && km(here, prof.loc) < 1.5) src = 'here=app';              // 앱에서 보던 곳 그대로 (화면과 같은 문장)
    else if (prof.gps && km(here, prof.gps) < 1.5) { loc = prof.gps; locSel = 'gps'; src = 'here=gps'; }
    else {
      const n = C.inKorea(here.lat, here.lon) ? C.nearestKR(here.lat, here.lon) : null;
      loc = { ...here, name: n ? n.d : '현재 위치', full: n ? n.full : '현재 위치' }; locSel = 'gps'; src = 'here';
    }
  }
  const [wx, news, market, daily] = await Promise.all([loc ? weather(loc.lat, loc.lon) : null, data('news'), data('market'), data('daily')]);
  const off = wx && Number.isFinite(wx.main.utc_offset_seconds) ? wx.main.utc_offset_seconds : 9 * 3600;

  // 앱의 상태(S)를 그대로 재현해서 같은 함수로 문장을 만들어요 (중간에 await 없음 → 다른 요청과 섞이지 않아요)
  const arr = v => (Array.isArray(v) ? v : []);
  globalThis.S = {
    mode: prof.mode, modes: arr(prof.modes), kids: arr(prof.kids), when: prof.when && typeof prof.when === 'object' ? prof.when : {},
    periods: arr(prof.periods).filter(k => PERIOD_KEYS.includes(k)), records: arr(prof.records),
    locSel, loc: loc ? { ...loc, gps: locSel === 'gps' } : null, gps: prof.gps || null, wx,
    voice: prof.voice, talkLv: prof.talkLv, talkOn: prof.talkOn, tipOn: prof.tipOn, noteOn: prof.noteOn,
  };
  let br;
  C.setNow(() => new Date(Date.now() + off * 1000)); // 서버는 UTC → 그 지역 시각으로
  try {
    C.buildModes(S.kids);
    S.modes = S.modes.filter(m => C.MODE[m]); if (!S.modes.length) S.modes = ['daily'];
    if (!C.MODE[S.mode] || !S.modes.includes(S.mode)) S.mode = S.modes[0];
    if (!S.periods.length) S.periods = ['am', 'pm', 'eve'];
    S.records = S.records.filter(r => r && r.levels && C.MODE[r.mode]);
    br = C.buildBrief({ news, market, daily });
  } catch (e) {
    return fail('브리핑을 만드는 중에 문제가 생겼어요. 잠시 후 다시 물어봐 주세요.');
  } finally { C.setNow(null); }
  return reply(C.briefParts(br), { place: br.place, src, segs: br.segs });
}

/* ---------------- 앱 설정 보관 ---------------- */
async function sync(req, url, env) {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': ALLOW.test(origin) ? origin : 'https://morningpick.pages.dev', 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
  const res = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (origin && !ALLOW.test(origin)) return res({ ok: false }, 403);
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (ID.test(id)) await env.TTS.delete('p:' + id);
    return res({ ok: true });
  }
  if (req.method !== 'POST') return res({ ok: false }, 405);
  const raw = await req.text();
  if (raw.length > 400000) return res({ ok: false, why: 'too big' }, 413);
  let body; try { body = JSON.parse(raw); } catch (e) { return res({ ok: false }, 400); }
  const id = String(body && body.id || ''), p = body && body.prof;
  if (!ID.test(id) || !p || typeof p !== 'object') return res({ ok: false }, 400);
  const str = v => (typeof v === 'string' ? v.slice(0, 80) : undefined);
  const arr = v => (Array.isArray(v) ? v : []);
  const L = l => l && Number.isFinite(+l.lat) && Number.isFinite(+l.lon) ? { lat: +l.lat, lon: +l.lon, name: String(l.name || '').slice(0, 60), full: String(l.full || '').slice(0, 120) } : null;
  const prof = {
    v: 1, at: new Date().toISOString(), mode: str(p.mode), modes: arr(p.modes).map(String).slice(0, 20), kids: arr(p.kids).slice(0, 10),
    periods: arr(p.periods).filter(k => PERIOD_KEYS.includes(k)), when: p.when && typeof p.when === 'object' ? p.when : {},
    locSel: str(p.locSel), loc: L(p.loc), gps: L(p.gps), voice: str(p.voice), talkLv: str(p.talkLv),
    talkOn: p.talkOn, tipOn: p.tipOn, noteOn: p.noteOn, records: arr(p.records).slice(-3000),
  };
  await env.TTS.put('p:' + id, JSON.stringify(prof), { expirationTtl: 400 * 86400 });
  return res({ ok: true });
}
