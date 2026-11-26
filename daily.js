/* ================== Daily Up 탭: 💬 Talk Pick + 🥄 AI 한 스푼 ================== */
// 실시간 첨삭: 무료·키 없는 공개 AI (Pollinations, IP당 45초에 1번). 매일 아침 Gemini가 만든 '선생님 노트'를 함께 보내 정확도를 높여요.
const TALK_AI = 'https://text.pollinations.ai/openai';
const DU_LV = {mid: '중급', high: '중상급'};
const TIP_LV = {'입문': '🌱 입문', '활용': '🌿 활용', '심화': '🌳 심화'};
let duTalkIdx = 0, duTipIdx = 0, talkBusy = null;
const talkDraft = {};

function duData(){ return dcLoad('daily')?.data || null; }
function talkLog(){ try { return JSON.parse(localStorage.getItem('outfit.talk')) || {}; } catch(e){ return {}; } }
function talkPut(key, v){
  const st = talkLog(); st[key] = v;
  const ks = Object.keys(st).sort((a, b) => (st[a].at || 0) - (st[b].at || 0));
  while (ks.length > 40) delete st[ks.shift()];
  try { localStorage.setItem('outfit.talk', JSON.stringify(st)); } catch(e){}
}
function talkStreak(today){
  const lg = talkLog(), days = new Set(Object.keys(lg).filter(k => lg[k].fb).map(k => k.split('|')[0]));
  const d = new Date(today + 'T00:00');
  if (!days.has(today)) d.setDate(d.getDate() - 1);
  let n = 0; while (days.has(ymd(d))){ n++; d.setDate(d.getDate() - 1); }
  return n;
}
const hasKo = s => /[가-힣]/.test(s);
const words = s => (s.trim().match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;

/* ---- 🔊 영어 읽기 (기기 내장 음성, 무료) ---- */
function enVoice(){
  if (!('speechSynthesis' in window)) return null;
  const want = S.voice === 'uk' ? 'en-gb' : 'en-us';
  const vs = speechSynthesis.getVoices().filter(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith(want));
  const score = v => (/premium|enhanced|natural|neural/i.test(v.name) ? 4 : 0) + (/google|samantha|ava|allison|serena|daniel|karen|siri/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  return vs.sort((a, b) => score(b) - score(a))[0] || null;
}
function speakEn(text, btn){
  if (!('speechSynthesis' in window)) return toast('이 기기는 음성 읽기를 지원하지 않아요');
  const again = btn && btn.classList.contains('on');
  speechSynthesis.cancel();
  document.querySelectorAll('.say.on').forEach(b => b.classList.remove('on'));
  if (again) return; // 한 번 더 누르면 멈춤
  const u = new SpeechSynthesisUtterance(text);
  u.lang = S.voice === 'uk' ? 'en-GB' : 'en-US';
  const v = enVoice(); if (v) u.voice = v;
  u.rate = S.slow ? 0.75 : 0.95;
  if (btn){ btn.classList.add('on'); u.onend = u.onerror = () => btn.classList.remove('on'); }
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();
const sayBtn = (t, sm) => `<button class="say${sm ? ' sm' : ''}" data-say="${esc(t)}" aria-label="영어로 듣기">🔊</button>`;

/* ---- 고친 부분 표시 (단어 단위 비교) ---- */
function diffHTML(a, b){
  const A = a.trim().split(/\s+/), B = b.trim().split(/\s+/);
  if (!a.trim() || A.length * B.length > 60000) return esc(b);
  const n = A.length, m = B.length, L = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0, del = [], ins = [];
  const flush = () => { if (del.length) out.push(`<del>${esc(del.join(' '))}</del>`); if (ins.length) out.push(`<ins>${esc(ins.join(' '))}</ins>`); del = []; ins = []; };
  while (i < n || j < m){
    if (i < n && j < m && A[i] === B[j]){ flush(); out.push(esc(A[i])); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])){ ins.push(B[j]); j++; }
    else { del.push(A[i]); i++; }
  }
  flush();
  return out.join(' ');
}

/* ---- AI 첨삭 ---- */
function talkPrompt(t, ans){
  const sys = 'You are an expert English speaking coach for Korean adults (CEFR B1-B2). You check a learner\'s answer to a conversation question. ' +
    'Be accurate: only flag real errors, never invent errors that are not in the text, and copy each "wrong" part exactly from the answer. ' +
    'Do not replace natural words with rarer ones. Every English sentence you write ("corrected", "natural", "others") must be grammatically perfect and natural. ' +
    'Write verdict, why, ko and tip ONLY in natural, friendly Korean (\'~해요\' style) — never English sentences there (quoting English words is fine). Output JSON only.';
  const notes = [t.grammar ? `- Key grammar: ${t.grammar.point} — ${t.grammar.desc}` : '', (t.watch || []).length ? `- Common mistakes: ${t.watch.join(' / ')}` : '',
    (t.key || []).length ? `- Useful expressions: ${t.key.join(' / ')}` : ''].filter(Boolean).join('\n');
  const user = `[Question] ${t.q}
[Teacher notes for this question — use them when relevant]
${notes || '- (none)'}

[Learner's answer]
${ans}

Check grammar, word choice, naturalness, sentence fragments (e.g. a sentence starting with "Because"), articles, prepositions, tense, and whether the answer fits the question's grammar (e.g. conditional).
If the answer is partly or fully in Korean, put a natural English version in "corrected" and teach the English expressions in "fixes".
Return JSON:
{"verdict": "잘한 점과 가장 중요한 개선점을 담은 한 문장",
 "corrected": "모든 fixes를 반영해 문법만 고친 버전 (학습자 표현은 최대한 유지)",
 "fixes": [{"wrong": "원문에 실제로 있는 부분 그대로", "right": "고친 표현", "why": "이유 한 문장"}],
 "upgrades": [{"from": "원문 표현", "to": "더 자연스럽거나 풍부한 표현", "why": "이유 한 문장"}],
 "natural": "학습자 아이디어를 살린 원어민 스타일 버전 (2~3문장)",
 "others": [{"en": "같은 질문에 대한 다른 관점의 답변 1~2문장", "ko": "자연스러운 한국어 해석"}, {"en": "", "ko": ""}],
 "tip": "다음에 써먹을 팁 한 문장"}
fixes 0~5 (no errors → []), upgrades 1~3.`;
  return {model: 'openai', messages: [{role: 'system', content: sys}, {role: 'user', content: user}], response_format: {type: 'json_object'}};
}
function cleanFb(fb, ans){
  const s = (v, n = 600) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const nz = v => s(v).toLowerCase().replace(/[^a-z0-9가-힣'’ ]/g, '').replace(/\s+/g, ' ').trim();
  const A = nz(ans);
  const fixes = (Array.isArray(fb.fixes) ? fb.fixes : []).filter(f => f && s(f.wrong) && s(f.right) && nz(f.wrong) !== nz(f.right)
      && (hasKo(ans) || A.includes(nz(f.wrong))) && !A.includes(nz(f.right)))
    .slice(0, 6).map(f => ({wrong: s(f.wrong, 200), right: s(f.right, 200), why: s(f.why, 240)}));
  const ups = (Array.isArray(fb.upgrades) ? fb.upgrades : []).filter(u => u && s(u.from) && s(u.to) && nz(u.from) !== nz(u.to))
    .slice(0, 3).map(u => ({from: s(u.from, 200), to: s(u.to, 200), why: s(u.why, 240)}));
  const others = (Array.isArray(fb.others) ? fb.others : []).filter(o => o && s(o.en)).slice(0, 2).map(o => ({en: s(o.en, 400), ko: s(o.ko, 400)}));
  const corrected = s(fb.corrected, 1500);
  if (!corrected && !fixes.length && !s(fb.natural)) return null;
  return {verdict: s(fb.verdict, 300).replace(/^(한 줄 )?총평\s*[:：]\s*/, ''), corrected: corrected || ans, fixes, upgrades: ups,
          natural: s(fb.natural, 900), others, tip: s(fb.tip, 300)};
}
function parseJSON(c){
  const t = String(c || '').replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const j = t.slice(a, b + 1);
  try { return JSON.parse(j); } catch(e){}
  try { return JSON.parse(j.replace(/,\s*([}\]])/g, '$1')); } catch(e){ return null; }
}
const sleep = ms => new Promise(res => setTimeout(res, ms));
async function talkAsk(t, ans, onWait){
  const body = JSON.stringify(talkPrompt(t, ans));
  let netErr = 0, bad = 0, waits = 0;
  while (netErr < 3 && bad < 2 && waits < 4){
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 75e3);
    let r;
    try { r = await fetch(TALK_AI, {method: 'POST', headers: {'Content-Type': 'application/json'}, body, signal: ctl.signal}); }
    catch(e){ clearTimeout(to); console.warn('talk fetch', e); netErr++; await sleep(2500); continue; }
    clearTimeout(to);
    if (r.status === 402 || r.status === 429){   // 무료 한도(한 곳에서 45초에 한 번): 기다렸다가 자동으로 다시
      const txt = await r.text().catch(() => '');
      const m = txt.match(/retry after (\d+)\s*s/i);
      const wait = Math.min(60, Math.max(3, +r.headers.get('Retry-After') || (m ? +m[1] : 0) || 20)) + 1;
      for (let k = wait; k > 0; k--){ onWait(k); await sleep(1000); }
      onWait(0); waits++; continue;
    }
    if (!r.ok){ console.warn('talk http', r.status); netErr++; await sleep(2500); continue; }
    const d = await r.json().catch(() => null);
    const fb = cleanFb(parseJSON(d?.choices?.[0]?.message?.content) || {}, ans);
    if (fb) return fb;
    console.warn('talk bad reply', d); bad++;
  }
  throw new Error('no feedback');
}

/* ---- 💬 Talk Pick 카드 ---- */
function talkCard(D){
  const talks = (D.talks || []).filter(x => x && x.mid && x.high);
  if (!talks.length) return `<section class="card note talk" id="talkCard"><div class="tt">💬 Talk Pick</div>
    <div class="empty" style="padding:24px 10px">첫 질문을 준비하고 있어요.<br>잠시 후 다시 열어 주세요 🙏</div></section>`;
  const di = Math.min(duTalkIdx, talks.length - 1), day = talks[di];
  const lv = S.talkLv === 'high' ? 'high' : 'mid', t = day[lv], key = `${day.date}|${lv}`;
  const saved = talkLog()[key];
  const streak = talkStreak(talks[0].date);
  const ws = (t.words || []).map(w => `<div class="wd"><div class="wh"><b>${esc(w.w)}</b>${w.pos ? `<i>${esc(w.pos)}</i>` : ''}<span class="wk">${esc(w.ko)}</span></div>
      ${w.note ? `<div class="wn">${esc(w.note)}</div>` : ''}${w.ex ? `<div class="we">“${esc(w.ex)}” ${sayBtn(w.ex, 1)}</div>` : ''}</div>`).join('');
  const samples = (t.samples || []).map(x => `<div class="smp"><span class="tg">${esc(x.tag || '예시')}</span>
      <p>${esc(x.en)} ${sayBtn(x.en, 1)}</p>${x.ko ? `<p class="k">${esc(x.ko)}</p>` : ''}</div>`).join('');
  let ansHTML;
  if (talkBusy === key) ansHTML = `<div class="tk-wait" id="tkWait">🧑‍🏫 AI 선생님이 답변을 읽고 있어요<span class="tdots"><i>.</i><i>.</i><i>.</i></span><br><small>보통 10초쯤 걸려요</small></div>`;
  else if (saved && saved.fb) ansHTML = fbHTML(saved);
  else ansHTML = `<div class="tk-ans">
      ${(t.starters || []).length ? `<div class="tk-st">${t.starters.map(s => `<button data-st="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      <textarea class="tk-in" id="tkInput" maxlength="900" placeholder="영어로 2~4문장 답해 보세요. 막히는 단어는 한국어로 써도 괜찮아요." data-key="${esc(key)}">${esc(talkDraft[key] ?? saved?.a ?? '')}</textarea>
      <div class="tk-row"><span class="tk-cnt" id="tkCnt"></span><button class="btn primary" id="tkSend">✍️ AI 첨삭 받기</button></div>
      ${saved && saved.err ? `<div class="tk-err">😥 지금은 AI 첨삭이 어려워요. 잠시 후 다시 눌러 주세요.${(t.watch || []).length ? `<div class="nkw-h" style="margin-top:10px">✔️ 셀프 체크</div><ul class="nsum">${t.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      <div class="tk-note">답변은 무료 공개 AI로 보내 첨삭해요 · 이름·연락처 같은 개인정보는 쓰지 마세요</div></div>`;
  return `<section class="card note talk" id="talkCard">
    <div class="tt">💬 Talk Pick <span class="badge">${esc(day.themeKo || '')}</span><span class="nd">${mdDate(day.date)}</span></div>
    <div class="tk-top"><div class="seg2" id="tkLv">${['mid', 'high'].map(k => `<button data-lv="${k}" class="${lv === k ? 'on' : ''}">${DU_LV[k]}</button>`).join('')}</div>
      ${streak ? `<span class="streak">🔥 ${streak}일 연속</span>` : ''}</div>
    <div class="tk-q"><p class="tk-en">${esc(t.q)}</p>${sayBtn(t.q)}</div>
    ${t.ko ? `<details class="tk-ko" ${S.talkKo ? 'open' : ''}><summary><span class="c">🇰🇷 해석 보기 ▾</span><span class="o">🇰🇷 해석 접기 ▴</span></summary><p>${esc(t.ko)}</p></details>` : ''}
    <details class="nread tk-ex"><summary><span class="c">🔎 단어·질문 해설 ▾</span><span class="o">🔎 해설 접기 ▴</span></summary>
      ${ws ? `<div class="nkw-h" style="margin-top:0">📌 질문 속 표현</div><div class="wds">${ws}</div>` : ''}
      ${t.grammar ? `<div class="gbox"><b>📐 ${esc(t.grammar.point)}</b><br>${esc(t.grammar.desc)}</div>` : ''}
      ${t.explain ? `<div class="nkw-h">🧭 이 질문은요</div><p class="np">${esc(t.explain)}</p>` : ''}
      ${t.how ? `<div class="ntake" style="font-weight:600">💡 ${esc(t.how)}</div>` : ''}
    </details>
    ${ansHTML}
    <details class="nread tk-smp"><summary><span class="c">📚 모범 답안 보기 ▾</span><span class="o">📚 모범 답안 접기 ▴</span></summary>
      ${samples}
      ${(t.key || []).length ? `<div class="nkw-h">🧰 써먹기 좋은 표현</div><ul class="nsum">${t.key.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
    </details>
    ${talks.length > 1 ? `<div class="nkw-h">📜 지난 Talk Pick</div><div class="nhist">${talks.map((x, j) => {
      const done = talkLog()[`${x.date}|${lv}`]?.fb ? ' ✅' : '';
      return `<button data-ti="${j}" class="${j === di ? 'on' : ''}"><b>${mdDate(x.date)}</b> ${esc(x[lv].q)}${done}</button>`; }).join('')}</div>` : ''}
  </section>`;
}
function fbHTML(sv){
  const f = sv.fb;
  const corr = hasKo(sv.a) ? esc(f.corrected) : diffHTML(sv.a, f.corrected);
  const same = !hasKo(sv.a) && f.corrected.trim() === sv.a.trim();
  return `<div class="fb">
    <div class="fb-h">✏️ 내 답변</div><div class="fb-my">${esc(sv.a)}</div>
    ${f.verdict ? `<div class="fb-v">🧑‍🏫 ${esc(f.verdict)}</div>` : ''}
    <div class="fb-h">${hasKo(sv.a) ? '✅ 영어로 옮기면' : '✅ 고친 문장'} ${sayBtn(f.corrected, 1)}</div><p class="fb-c">${corr}</p>
    ${f.fixes.length ? `<div class="fb-h">🛠️ 고칠 부분</div><ul class="fb-l">${f.fixes.map(x => `<li><s>${esc(x.wrong)}</s> → <b>${esc(x.right)}</b>${x.why ? `<div class="fy">${esc(x.why)}</div>` : ''}</li>`).join('')}</ul>`
      : same ? '<div class="fb-ok">🎉 문법 실수가 없어요! 아래 표현으로 한 단계 더 올려 봐요.</div>' : ''}
    ${f.upgrades.length ? `<div class="fb-h">✨ 이렇게 바꾸면 더 좋아요</div><ul class="fb-l">${f.upgrades.map(x => `<li>${esc(x.from)} → <b>${esc(x.to)}</b>${x.why ? `<div class="fy">${esc(x.why)}</div>` : ''}</li>`).join('')}</ul>` : ''}
    ${f.natural ? `<div class="fb-h">🗣️ 원어민이라면 이렇게 ${sayBtn(f.natural, 1)}</div><p class="fb-n">${esc(f.natural)}</p>` : ''}
    ${f.others.length ? `<div class="fb-h">💬 이런 답도 있어요</div>${f.others.map(o => `<div class="smp"><p>${esc(o.en)} ${sayBtn(o.en, 1)}</p>${o.ko ? `<p class="k">${esc(o.ko)}</p>` : ''}</div>`).join('')}` : ''}
    ${f.tip ? `<div class="ntake">💡 ${esc(f.tip)}</div>` : ''}
    <div class="fb-act"><button class="btn" id="tkRetry">✏️ 다시 써보기</button><button class="btn" id="tkCopy">📋 복사</button></div>
  </div>`;
}

/* ---- 🥄 AI 한 스푼 카드 ---- */
function tipCard(D){
  const tips = (D.tips || []).filter(x => x && x.title);
  if (!tips.length) return '';
  const i = Math.min(duTipIdx, tips.length - 1), n = tips[i], body = n.body || [];
  const qk = 'tip|' + n.date + '|' + n.title, pick = quizState()[qk], q = n.quiz;
  const quiz = q && (q.options || []).length ? `<div class="tquiz"><div class="nkw-h">🧠 오늘의 퀴즈</div><div class="qq">${esc(q.q)}</div>
    ${q.options.map((o, j) => `<button class="qo ${pick == null ? '' : j === q.answer ? 'ok' : j === pick ? 'no' : 'qdim'}" data-q="${j}" ${pick == null ? '' : 'disabled'}>
      ${pick == null ? '' : j === q.answer ? '⭕ ' : j === pick ? '❌ ' : ''}${esc(o)}</button>`).join('')}
    ${pick == null ? '' : `<div class="qx">${pick === q.answer ? '🎉 정답이에요!' : '아쉬워요! 정답은 ' + (q.answer + 1) + '번이에요.'} ${esc(q.explain || '')}</div>`}</div>` : '';
  return `<section class="card note aitip" id="tipCard">
    <div class="tt">🥄 AI 한 스푼 <span class="badge">${TIP_LV[n.level] || esc(n.level || '')}</span><span class="nd">${mdDate(n.date)}</span></div>
    ${n.catKo ? `<div class="tip-cat">${esc(n.catKo)}</div>` : ''}
    <h3 class="ntitle">${esc(n.title)}</h3>
    ${n.intro ? `<p class="nintro">${esc(n.intro)}</p>` : ''}
    ${body[0] ? `<p class="np">${esc(body[0])}</p>` : ''}
    ${body.length > 1 || (n.steps || []).length ? `<details class="nread"><summary><span class="c">이어서 읽기 ▾</span><span class="o">접기 ▴</span></summary>
      ${body.slice(1).map(p => `<p class="np">${esc(p)}</p>`).join('')}
      ${(n.steps || []).length ? `<div class="nkw-h">👣 따라 해 보기</div><ol class="stp">${n.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</details>` : ''}
    ${n.compare ? `<div class="nkw-h">🔁 이렇게 바꿔 물어보세요</div><div class="pqs">
      <div class="pq bad"><b>😕 아쉬운 질문</b><p>${esc(n.compare.bad)}</p></div>
      <div class="pq good"><b>😊 좋은 질문</b><p>${esc(n.compare.good)}</p><button class="cpy" data-copy="${esc(n.compare.good)}">📋 복사</button></div>
      ${n.compare.why ? `<div class="pqw">💡 ${esc(n.compare.why)}</div>` : ''}</div>` : ''}
    ${n.try ? `<div class="nkw-h">🧪 오늘 바로 해보기</div>${n.try.desc ? `<p class="np" style="margin-bottom:4px">${esc(n.try.desc)}</p>` : ''}
      <pre class="ptx">${esc(n.try.prompt)}</pre><button class="cpy" data-copy="${esc(n.try.prompt)}">📋 프롬프트 복사</button>` : ''}
    ${n.caution ? `<div class="pcau">⚠️ ${esc(n.caution)}</div>` : ''}
    ${n.takeaway ? `<div class="ntake">✅ ${esc(n.takeaway)}</div>` : ''}
    ${(n.keywords || []).length ? `<div class="nkw-h">📌 오늘의 키워드</div>${n.keywords.map(k => `<details class="nkw"><summary>${esc(k.term)}<span>▾</span></summary>
      <div class="kd">${esc(k.desc)}</div></details>`).join('')}` : ''}
    ${quiz}
    ${tips.length > 1 ? `<div class="nkw-h">📚 지난 AI 한 스푼</div><div class="nhist">${tips.map((x, j) => `<button data-pi="${j}" class="${j === i ? 'on' : ''}"><b>${mdDate(x.date)}</b> ${esc(x.title)}</button>`).join('')}</div>` : ''}
  </section>`;
}

/* ---- 화면 ---- */
async function renderDailyUp(force){
  const el = $('#duBody');
  let D = duData();
  if (!D || force){
    if (!D) el.innerHTML = '<div class="empty"><div class="e">🌱</div>오늘의 Daily Up을 불러오는 중이에요…</div>';
    try { D = await loadData('daily', force); } catch(e){ if (!D){ el.innerHTML = '<div class="empty"><div class="e">📡</div>불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.</div>'; return; } }
  } else if (Date.now() - (dcLoad('daily')?.at || 0) > 8 * 60e3) loadData('daily').then(() => { if ($('#v-daily').classList.contains('on') && !talkBusy) renderDailyUp(); }).catch(() => {});
  $('#duUpd').textContent = '매일 아침 6시에 새로 나와요';
  const parts = [S.talkOn !== false ? talkCard(D) : '', S.tipOn !== false ? tipCard(D) : ''].join('');
  el.innerHTML = (parts || '<div class="empty"><div class="e">🌱</div>설정 → Daily Up에서 보고 싶은 메뉴를 켜 주세요</div>') +
    '<p class="disc">💬 질문·해설·모범 답안과 🥄 AI 한 스푼은 매일 아침 AI(Gemini)가 만들어요 · 첨삭은 무료 공개 AI(Pollinations)가 해요 · AI 설명은 틀릴 수 있어요</p>';
  talkCount();
  trackDaily('tab/daily', 'Daily Up 탭');
}
function rerender(id, html){ const e = document.getElementById(id); if (e && html) e.outerHTML = html; }
function talkCount(){
  const ta = $('#tkInput'), c = $('#tkCnt'); if (!ta || !c) return;
  const n = words(ta.value);
  c.textContent = n ? `${n}단어` : '';
}
async function talkSend(){
  const D = duData(), ta = $('#tkInput'); if (!D || !ta) return;
  const ans = ta.value.trim(), key = ta.dataset.key;
  if (ans.length < 8) return toast('조금만 더 써 볼까요? 한두 문장이면 충분해요');
  const [date, lv] = key.split('|'), day = (D.talks || []).find(x => x.date === date), t = day && day[lv];
  if (!t) return;
  talkBusy = key; rerender('talkCard', talkCard(D));
  $('#talkCard')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  track('talk/submit', 'Talk Pick 첨삭');
  try {
    const fb = await talkAsk(t, ans, k => { const w = $('#tkWait'); if (w) w.innerHTML = k ? `⏳ 무료 AI가 잠깐 바빠요 · <b>${k}초</b> 뒤 자동으로 다시 보내요<br><small>무료라서 한 곳에서 45초에 한 번만 받을 수 있어요</small>`
      : '🧑‍🏫 AI 선생님이 답변을 읽고 있어요<span class="tdots"><i>.</i><i>.</i><i>.</i></span>'; });
    talkPut(key, {a: ans, fb, at: Date.now()}); delete talkDraft[key];
    toast('첨삭이 도착했어요 ✨');
  } catch(e){
    talkPut(key, {a: ans, err: 1, at: Date.now()}); talkDraft[key] = ans;
  }
  talkBusy = null;
  if ($('#talkCard')) rerender('talkCard', talkCard(duData()));
}
async function copyText(t){
  try { await navigator.clipboard.writeText(t); }
  catch(e){ const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch(_){} x.remove(); }
  toast('복사했어요 · AI 앱에 붙여 넣어 보세요');
}
document.addEventListener('input', e => {
  if (e.target.id !== 'tkInput') return;
  talkDraft[e.target.dataset.key] = e.target.value; talkCount();
});
document.addEventListener('click', e => {
  const sb = e.target.closest('.say[data-say]'); if (sb){ speakEn(sb.dataset.say, sb); return; }
  if (!e.target.closest('#v-daily')) return;
  const D = duData(); if (!D) return;
  const lvb = e.target.closest('#tkLv [data-lv]');
  if (lvb){ S.talkLv = lvb.dataset.lv; save(); rerender('talkCard', talkCard(D)); return; }
  const st = e.target.closest('.tk-st [data-st]');
  if (st){ const ta = $('#tkInput'); if (!ta) return;
    const s = st.dataset.st.replace(/\s*(\.\.\.|…)\s*$/, ' ');
    ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, ' ') + s : s; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    talkDraft[ta.dataset.key] = ta.value; talkCount(); return; }
  if (e.target.closest('#tkSend')){ if (!talkBusy) talkSend(); return; }
  if (e.target.closest('#tkRetry')){
    const k = `${(D.talks || [])[Math.min(duTalkIdx, (D.talks || []).length - 1)]?.date}|${S.talkLv === 'high' ? 'high' : 'mid'}`;
    const sv = talkLog()[k]; if (sv){ talkDraft[k] = sv.a; talkPut(k, {a: sv.a, at: sv.at}); }
    rerender('talkCard', talkCard(D)); $('#tkInput')?.focus(); return; }
  if (e.target.closest('#tkCopy')){
    const k = `${(D.talks || [])[Math.min(duTalkIdx, (D.talks || []).length - 1)]?.date}|${S.talkLv === 'high' ? 'high' : 'mid'}`;
    const sv = talkLog()[k]; if (sv && sv.fb) copyText(`${sv.fb.corrected}${sv.fb.natural ? '\n\n' + sv.fb.natural : ''}`); return; }
  const ti = e.target.closest('#talkCard [data-ti]');
  if (ti){ duTalkIdx = +ti.dataset.ti; rerender('talkCard', talkCard(D)); $('#talkCard')?.scrollIntoView({behavior: 'smooth'}); return; }
  const pi = e.target.closest('#tipCard [data-pi]');
  if (pi){ duTipIdx = +pi.dataset.pi; rerender('tipCard', tipCard(D)); $('#tipCard')?.scrollIntoView({behavior: 'smooth'}); return; }
  const cp = e.target.closest('.cpy[data-copy]'); if (cp){ copyText(cp.dataset.copy); track('tip/copy', 'AI 한 스푼 프롬프트 복사'); return; }
  const qo = e.target.closest('.tquiz [data-q]');
  if (qo){
    const tips = (D.tips || []).filter(x => x && x.title), n = tips[Math.min(duTipIdx, tips.length - 1)]; if (!n) return;
    const st2 = quizState(); st2['tip|' + n.date + '|' + n.title] = +qo.dataset.q;
    const keys = Object.keys(st2); if (keys.length > 80) delete st2[keys[0]];
    try { localStorage.setItem('outfit.quiz', JSON.stringify(st2)); } catch(err){}
    track('tip/quiz', 'AI 한 스푼 퀴즈'); rerender('tipCard', tipCard(D)); setTimeout(() => document.querySelector('.tquiz')?.scrollIntoView({block: 'center'}), 30);
  }
});
$('#duRefresh').onclick = () => { toast('Daily Up을 새로 불러와요'); renderDailyUp(true); };
