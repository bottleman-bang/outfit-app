/* ================== 🔊 오늘의 브리핑 (날씨·뉴스·증시·Daily Up 한 번에 듣기) ==================
   문장은 core.js의 buildBrief()가 만들어요 → 시리 단축어(서버)가 읽는 내용과 똑같아요.
   한국어는 기기 내장 음성, 영어(Talk Pick)는 AI 원어민 음성(daily.js의 TTS_URL). 일시정지 · 다음 · 정지 가능.
   시리·AI 비서용: 설정을 켜면 위치·옷 기록·설정을 모닝픽 서버(무료 Cloudflare)에 보관해서, 앱을 안 열어도 같은 브리핑을 만들어요. */
const BRIEF_API = TTS_URL ? TTS_URL.replace(/\/+$/, '') : '';
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAyAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAANAAAFoAAzMzMzMzMzRERERERERERVVVVVVVVVVWZmZmZmZmZ3d3d3d3d3d4iIiIiIiIiImZmZmZmZmaqqqqqqqqqqu7u7u7u7u7vMzMzMzMzM3d3d3d3d3d3u7u7u7u7u7v////////8AAAAATGF2YzYzLjEuAAAAAAAAAAAAAAAAJAOQAAAAAAAABaBkvJkvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TEUwAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TEpgAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TErAAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const BRP = {segs: [], i: 0, st: 'idle', gen: 0, run: 0, eng: '', aud: null, keep: [], loading: false, waiting: false};
const brIcon = {
  spk: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/><path class="w1" d="M15.2 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="w2" d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6v12l8.5-6z" fill="currentColor"/><rect x="15.5" y="6" width="2.6" height="12" rx="1" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
};

function briefNow(){
  return buildBrief({news: dcLoad('news')?.data, market: dcLoad('market')?.data, daily: dcLoad('daily')?.data});
}
function koVoice(){
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test((v.lang || '').replace('_', '-')));
  const sc = v => (/premium|enhanced|natural|neural|online/i.test(v.name) ? 4 : 0) + (/yuna|sora|siri|google|sunhi|injoon|hyunsu|seoyeon/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return vs.sort((a, b) => sc(b) - sc(a))[0] || null;
}

/* ---- 재생 ---- */
function brHalt(){
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch(e){}
  const a = BRP.aud; if (a){ a.onended = a.onerror = a.onplaying = null; try { a.pause(); } catch(e){} }
}
function brPlayCur(){
  const g = BRP.gen, seg = BRP.segs[BRP.i];
  if (!seg){
    if (BRP.loading){ BRP.waiting = true; brUI(); return; }
    return brStop();
  }
  BRP.waiting = false; brUI();
  const done = () => { if (g !== BRP.gen || BRP.st !== 'playing') return; BRP.i++; brPlayCur(); };
  if (seg.lang === 'en' && TTS_URL && Date.now() - ttsDown > 300000) brAudio(seg, done, g);
  else brSpeech(seg, done, g);
}
function brSpeech(seg, done, g){
  BRP.eng = 'speech';
  if (!('speechSynthesis' in window)){ toast('이 기기는 음성 읽기를 지원하지 않아요'); return brStop(); }
  const u = new SpeechSynthesisUtterance(seg.text);
  u.lang = seg.lang === 'en' ? (S.voice === 'uk' ? 'en-GB' : 'en-US') : 'ko-KR';
  const v = seg.lang === 'en' ? enVoice() : koVoice(); if (v) u.voice = v;
  u.rate = seg.lang === 'en' ? (S.slow ? 0.75 : 0.95) : 1;
  // 우리가 멈춘 게 아닌데 끊기거나(전화·알림 등) 소리가 안 나면 다음 문장으로 (멈춰 있지 않게)
  let fin = false;
  const fini = () => { if (fin) return; fin = true; clearTimeout(wd); done(); };
  const wd = setTimeout(() => { if (g === BRP.gen && BRP.st === 'playing' && !fin){ fin = true; try { speechSynthesis.cancel(); } catch(e){} done(); } }, 4000 + seg.text.length * 300);
  u.onend = fini;
  u.onerror = e => {
    if (g !== BRP.gen || BRP.st !== 'playing') return;
    if (e.error === 'not-allowed'){ fin = true; clearTimeout(wd); BRP.st = 'paused'; brUI(); toast('▶를 누르면 브리핑을 시작해요'); return; } // 앱을 열자마자 자동 재생이 막힌 경우
    fini();
  };
  BRP.keep.push(u); if (BRP.keep.length > 4) BRP.keep.shift(); // 일부 브라우저는 참조가 없으면 중간에 끊겨요
  speechSynthesis.speak(u);
}
function brAudio(seg, done, g){
  BRP.eng = 'audio';
  const a = BRP.aud || (BRP.aud = new Audio());
  let started = false;
  const fail = () => { // AI 음성이 안 되면 기기 음성으로
    if (g !== BRP.gen || started) return;
    clearTimeout(tm); a.onended = a.onerror = a.onplaying = null; try { a.pause(); } catch(e){}
    ttsDown = Date.now(); brSpeech(seg, done, g);
  };
  const tm = setTimeout(fail, 12000);
  a.onplaying = () => { started = true; clearTimeout(tm); a.playbackRate = S.slow ? 0.8 : 1; };
  a.onended = () => { clearTimeout(tm); done(); };
  a.onerror = () => { clearTimeout(tm); started ? done() : fail(); };
  a.preservesPitch = true;
  a.src = `${TTS_URL}?v=${S.voice === 'uk' ? 'uk' : 'us'}&t=${encodeURIComponent(seg.text)}`;
  a.defaultPlaybackRate = a.playbackRate = S.slow ? 0.8 : 1;
  const p = a.play(); if (p && p.catch) p.catch(() => { if (!started) fail(); });
}
// 위치·날씨·뉴스를 최신으로 (최대 몇 초만 기다려요 — 그동안 첫 문장을 읽어요)
function gpsFresh(ms){
  return new Promise(res => {
    if (!navigator.geolocation) return res(false);
    const t = setTimeout(() => res(false), ms);
    navigator.geolocation.getCurrentPosition(async p => {
      const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
      if (!S.gps || locKey(S.gps) !== locKey({lat, lon})){
        try { S.gps = {lat, lon, ...(await placeName(lat, lon))}; } catch(e){ clearTimeout(t); return res(false); }
        if (S.locSel === 'gps'){ S.loc = {...S.gps, gps: true}; S.wx = S.wxc[locKey(S.loc)] || null; WXC = null; }
        save(); render();
      }
      clearTimeout(t); res(true);
    }, () => { clearTimeout(t); res(false); }, {timeout: ms, maximumAge: 300000});
  });
}
async function briefPrepare(){
  const wait = (p, ms) => Promise.race([p, sleep(ms)]);
  const data = Promise.allSettled(['news', 'market', 'daily'].map(n => loadData(n)));
  if (S.locSel === 'gps') await wait(gpsFresh(5000), 5500);
  if (S.loc && stale()) await wait(fetchWeather().catch(() => {}), 7000);
  await wait(data, 6000);
}
function brStart(){
  if (BRP.st !== 'idle') return brToggle();
  stopSay();
  ++BRP.gen; const run = ++BRP.run;
  // 아이폰: 버튼을 누른 순간에 소리 재생을 '허락'받아 둬요 (이후 문장들이 이어서 재생되도록)
  const a = BRP.aud || (BRP.aud = new Audio());
  a.onended = a.onerror = a.onplaying = null;
  try { a.src = SILENT; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch(e){}
  BRP.segs = [{sec: 'intro', part: 'a', lang: 'ko', text: BRIEF_INTRO}];
  BRP.i = 0; BRP.st = 'playing'; BRP.loading = true;
  brPlayCur();
  briefPrepare().catch(() => {}).then(() => {
    if (run !== BRP.run) return; // 그사이 정지했으면 그만
    let br; try { br = briefNow(); } catch(e){ console.warn('brief', e); }
    BRP.loading = false;
    if (br) BRP.segs = [BRP.segs[0], ...br.segs.filter(s => s.sec !== 'intro')];
    if (BRP.waiting && BRP.st === 'playing'){ BRP.gen++; brPlayCur(); } else brUI();
  });
  track('brief/play', '오늘의 브리핑 듣기');
}
function brPause(){
  if (BRP.st !== 'playing') return;
  BRP.st = 'paused';
  if (BRP.eng === 'audio' && BRP.aud && !BRP.aud.paused) BRP.aud.pause();
  else try { speechSynthesis.cancel(); } catch(e){}
  brUI();
}
function brResume(){
  if (BRP.st !== 'paused') return;
  BRP.st = 'playing';
  const a = BRP.aud;
  if (BRP.eng === 'audio' && a && a.src && a.src !== SILENT && a.currentTime > 0 && !a.ended){
    const p = a.play(); if (p && p.catch) p.catch(() => { BRP.gen++; brPlayCur(); });
    brUI();
  } else { BRP.gen++; brHalt(); brPlayCur(); }  // 기기 음성은 지금 문장 처음부터 다시
}
function brToggle(){ BRP.st === 'playing' ? brPause() : brResume(); }
function brNext(){
  if (BRP.st === 'idle') return;
  const sec = (BRP.segs[BRP.i] || {}).sec;
  let j = BRP.i + 1; while (j < BRP.segs.length && BRP.segs[j].sec === sec) j++;
  BRP.gen++; brHalt(); BRP.i = j; BRP.st = 'playing'; brPlayCur();
}
function brStop(){
  BRP.gen++; BRP.run++; brHalt();
  BRP.st = 'idle'; BRP.segs = []; BRP.i = 0; BRP.loading = BRP.waiting = false; BRP.eng = '';
  brUI();
}

/* ---- 화면 ---- */
function brUI(){
  const on = BRP.st !== 'idle', btn = $('#briefBtn'), pl = $('#brPlayer');
  if (btn){
    btn.classList.toggle('on', on); btn.classList.toggle('live', BRP.st === 'playing');
    $('#briefBtnTxt').textContent = BRP.st === 'playing' ? '듣는 중' : BRP.st === 'paused' ? '일시정지' : '오늘의 브리핑';
    btn.setAttribute('aria-label', on ? '브리핑 일시정지·계속' : '오늘의 브리핑 듣기');
  }
  if (!pl) return;
  pl.hidden = !on; document.body.classList.toggle('brp-on', on);
  if (!on) return;
  const seg = BRP.segs[BRP.i], n = BRP.segs.length;
  $('#brSec').textContent = seg ? (BRIEF_SECS[seg.sec] || '') : BRP.waiting ? '불러오는 중' : '';
  $('#brLine').textContent = seg ? seg.text : '최신 날씨·뉴스를 불러오고 있어요…';
  $('#brLine').lang = seg && seg.lang === 'en' ? 'en' : 'ko';
  $('#brProg').style.width = (BRP.loading ? 4 : Math.min(100, (BRP.i / Math.max(1, n)) * 100)).toFixed(1) + '%';
  $('#brPlay').innerHTML = BRP.st === 'playing' ? brIcon.pause : brIcon.play;
  $('#brPlay').setAttribute('aria-label', BRP.st === 'playing' ? '일시정지' : '계속 듣기');
}
(function briefSetup(){
  const sub = document.querySelector('#v-home .subtabs');
  if (sub && !$('#briefBtn')){
    const row = document.createElement('div'); row.className = 'hhead';
    sub.replaceWith(row); row.appendChild(sub);
    row.insertAdjacentHTML('beforeend', `<button class="brbtn" id="briefBtn" aria-label="오늘의 브리핑 듣기">${brIcon.spk}<span id="briefBtnTxt">오늘의 브리핑</span></button>`);
  }
  document.body.insertAdjacentHTML('beforeend', `<div class="brp" id="brPlayer" hidden role="region" aria-label="오늘의 브리핑 플레이어">
    <div class="brp-bar"><i id="brProg"></i></div>
    <div class="brp-row"><div class="brp-txt"><b id="brSec"></b><span id="brLine"></span></div>
      <button class="brp-b main" id="brPlay" aria-label="일시정지">${brIcon.pause}</button>
      <button class="brp-b" id="brNext" aria-label="다음 순서로">${brIcon.next}</button>
      <button class="brp-b" id="brStop" aria-label="정지">${brIcon.stop}</button></div></div>`);
  $('#briefBtn').onclick = brStart;
  $('#brPlay').onclick = brToggle;
  $('#brNext').onclick = brNext;
  $('#brStop').onclick = brStop;
  // 다른 🔊(영어 한 문장 듣기)를 누르면 브리핑은 멈춰요
  document.addEventListener('click', e => { if (BRP.st !== 'idle' && e.target.closest('.say[data-say]')) brStop(); }, true);
  // 화면을 끄거나 다른 앱으로 가면 일시정지 (돌아와서 ▶로 이어 듣기)
  document.addEventListener('visibilitychange', () => { if (document.hidden && BRP.st === 'playing') brPause(); });
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  // 홈 화면 아이콘을 길게 눌러 '오늘의 브리핑'으로 열면 바로 재생 (기기가 막으면 ▶ 한 번)
  if (/[?&]brief=1/.test(location.search)){
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { showView('home'); brStart(); }, 600);
  }
})();

/* ================== 🎙️ 시리·AI 비서 브리핑 (서버 동기화) ================== */
const briefURL = () => S.bid ? `${BRIEF_API}/brief?u=${S.bid}` : '';
function briefProfile(){
  const L = l => l ? {lat: +l.lat, lon: +l.lon, name: l.name || '', full: l.full || l.name || ''} : null;
  return {v: 1, mode: S.mode, modes: S.modes, kids: S.kids, periods: S.periods, when: S.when, locSel: S.locSel, loc: L(S.loc), gps: L(S.gps),
    voice: S.voice, talkLv: S.talkLv, talkOn: S.talkOn, tipOn: S.tipOn, noteOn: S.noteOn,
    records: S.records.map(r => ({date: r.date, mode: r.mode, when: r.when, temp: r.temp, levels: r.levels, rating: r.rating}))};
}
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
let syncT = null;
function briefSyncSoon(){ if (!S.siri || !S.bid || !BRIEF_API) return; clearTimeout(syncT); syncT = setTimeout(briefSync, 2500); }
async function briefSync(force){
  if (!S.siri || !S.bid || !BRIEF_API) return false;
  const body = JSON.stringify({id: S.bid, prof: briefProfile()}), sig = strHash(body);
  let last = ''; try { last = localStorage.getItem('outfit.briefSig') || ''; } catch(e){}
  if (!force && sig === last) return true;
  try {
    const r = await fetch(BRIEF_API + '/sync', {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
    if (!r.ok) throw 0;
    try { localStorage.setItem('outfit.briefSig', sig); } catch(e){}
    return true;
  } catch(e){ return false; }
}
{ const base = save; save = function(){ base(); briefSyncSoon(); }; } // 저장할 때마다 (바뀐 게 있으면) 서버에도
briefSyncSoon();

function renderSiri(){
  const sw = $('#siriSwitch'); if (!sw) return;
  sw.classList.toggle('on', !!S.siri);
  $('#siriBox').hidden = !S.siri;
  if (!S.siri) return;
  $('#siriUrl').textContent = briefURL();
  // 단축어 앱이 파일을 받아 '단축어 추가' 화면을 열어요 (서명된 단축어 · 주소는 추가할 때 붙여 넣어요)
  const file = new URL('morningpick-brief.shortcut', location.href).href;
  $('#siriAdd').href = `shortcuts://import-shortcut?url=${encodeURIComponent(file)}&name=${encodeURIComponent('모닝픽 오늘의 브리핑 읽어줘')}`;
}
async function copyPlain(t, msg){
  try { await navigator.clipboard.writeText(t); }
  catch(e){ const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch(_){} x.remove(); }
  toast(msg);
}
(function siriSetup(){
  const row = $('#siriRow'); if (!row) return;
  row.onclick = async () => {
    if (!S.siri){
      if (!BRIEF_API) return toast('브리핑 서버 주소가 설정되어 있지 않아요');
      if (!S.bid){ const b = new Uint8Array(16); crypto.getRandomValues(b); S.bid = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
      S.siri = true; save(); renderSiri();
      toast((await briefSync(true)) ? '켰어요 · 아래 순서대로 단축어를 추가해 주세요' : '켰어요 · 인터넷이 연결되면 자동으로 준비돼요');
    } else {
      S.siri = false; save(); renderSiri();
      if (S.bid) fetch(`${BRIEF_API}/sync?id=${S.bid}`, {method: 'DELETE'}).catch(() => {});
      try { localStorage.removeItem('outfit.briefSig'); } catch(e){}
      toast('껐어요 · 서버에 보관한 정보도 지웠어요');
    }
  };
  $('#siriCopy').onclick = () => copyPlain(briefURL(), '내 브리핑 주소를 복사했어요');
  $('#siriAdd').onclick = () => { copyPlain(briefURL(), '주소를 복사했어요 · 단축어 추가 화면에서 붙여 넣어 주세요'); track('brief/shortcut', '시리 단축어 받기'); };
  $('#briefPlayRow').onclick = () => { showView('home'); brStart(); };
  renderSiri();
})();
