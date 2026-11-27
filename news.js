/* ================== 뉴스 탭 ================== */
const CAT_ORDER = ['markets', 'economy', 'bonds', 'commodities', 'crypto', 'tech', 'people', 'korea', 'world'];

function newsItem(x, big){
  if (big) return topItem(x);
  const orig = S.newsOrig && x.tk && x.tk !== x.t ? `<div class="no">${esc(x.t)}</div>` : '';
  return `<a class="ni" href="${esc(x.u)}" target="_blank" rel="noopener">
    <div class="nh">${esc(newsTitle(x))}</div>${orig}
    <div class="nm">${esc(x.s)} · ${ago(x.p)}</div></a>`;
}
// 주요 뉴스: 누르면 펼쳐지는 3~5줄 요약 + 원문 링크
function topItem(x, open){
  const orig = S.newsOrig && x.tk && x.tk !== x.t ? `<div class="no">${esc(x.t)}</div>` : '';
  const lines = Array.isArray(x.sum) ? x.sum : x.sum ? [x.sum] : [];
  const ai = x.sumType === 'ai' || (!x.sumType && lines.length && N_AI());
  const label = lines.length ? (ai ? '✨ AI 요약' : '📝 요약') : '원문 링크';
  const links = [{s: x.s, u: x.u, main: true}, ...(x.also || [])];
  return `<details class="ni nbig" id="ti-${esc(x.id)}" ${open ? 'open' : ''}>
    <summary>
      <div class="nt"><span class="ncat">${CAT_E[x.c] || '📰'} ${esc((DC.news?.data?.catNames || {})[x.c] || '')}</span>${x.n > 1 ? `<span class="nn">${x.n}개 매체</span>` : ''}</div>
      <div class="nh">${esc(newsTitle(x))}</div>${orig}
      <div class="nm">${esc(x.s)} · ${ago(x.p)}<span class="nmore"><span class="c">${label} ▾</span><span class="o">접기 ▴</span></span></div>
    </summary>
    <div class="nbody">
      ${lines.length ? `<ul class="nsum">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${x.why ? `<div class="nw">💡 ${esc(x.why)}</div>` : ''}
      ${lines.length && !ai ? '<div class="nnote">기사 앞부분을 자동 번역해 정리했어요</div>' : ''}
      <div class="nlinks">${links.map(l => `<a class="nbtn ${l.main ? 'main' : ''}" href="${esc(l.u)}" target="_blank" rel="noopener">${l.main ? '📰 원문 보기 · ' : ''}${esc(l.s)} ↗</a>`).join('')}</div>
    </div>
  </details>`;
}
const N_AI = () => !!(DC.news && DC.news.data && DC.news.data.ai);
async function renderNews(force){
  const el = $('#nwBody');
  let N = dcLoad('news')?.data;
  if (!N || force){
    if (!N) el.innerHTML = '<div class="empty"><div class="e">📰</div>뉴스를 불러오는 중이에요…</div>';
    try { N = await loadData('news', force); } catch(e){ if (!N){ el.innerHTML = '<div class="empty"><div class="e">📡</div>뉴스를 불러오지 못했어요.<br>인터넷 연결을 확인해 주세요.</div>'; return; } }
  } else if (Date.now() - (dcLoad('news')?.at || 0) > 8 * 60e3) loadData('news').then(() => renderNews()).catch(() => {});
  const age = (Date.now() - new Date(N.updated)) / 60e3;
  $('#nwUpd').textContent = `${ago(N.updated)} 업데이트${age > 180 ? ' · 자동 업데이트 대기 중' : ''}`;
  const want = new Set(S.newsCats || CAT_ORDER);
  const brief = (N.brief && N.brief.length) ? N.brief.map(esc) : ruleNewsBrief(N);
  const top = (N.top || []).filter(x => want.has(x.c));
  const cats = CAT_ORDER.filter(c => want.has(c) && (N.cats || {})[c]?.length);
  const cur = cats.includes(S.newsTab) ? S.newsTab : 'all';
  const list = cur === 'all'
    ? cats.flatMap(c => N.cats[c].slice(0, 3).map(x => ({...x}))).sort((a, b) => (b.p || '').localeCompare(a.p || '')).slice(0, 24)
    : N.cats[cur];
  el.innerHTML = `<div class="cols"><div class="col">
    <section class="card mbrief"><div class="tt">🔑 오늘의 핵심 <span class="badge">${N.ai && N.brief?.length ? 'AI 요약' : '자동 정리'}</span></div>
      <ul>${brief.map(l => `<li>${l}</li>`).join('')}</ul></section>
    ${noteCard(N)}
    </div><div class="col">
    <section class="card"><h2>⭐ 주요 뉴스</h2>
      ${top.map((x, i) => topItem(x, i === 0)).join('') || '<div class="empty" style="padding:20px">관심 분류에 맞는 주요 뉴스가 없어요</div>'}</section>
    <section class="card"><h2>🗂️ 분류별 뉴스</h2>
      <div class="hscroll-row" id="nwTabs" style="margin-bottom:6px">${[['all', '전체'], ...cats.map(c => [c, `${CAT_E[c]} ${N.catNames[c]}`])].map(([k, l]) =>
        `<button class="mode ${cur === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      ${(list || []).map(x => newsItem(x)).join('') || '<div class="empty" style="padding:20px">기사가 없어요</div>'}</section>
    </div></div>
    <p class="disc">제목을 누르면 원문으로 이동해요 · 출처: Reuters·Bloomberg·WSJ·FT·CNBC·연합뉴스 등 각 언론사${N.ai ? ' · 요약·번역은 AI가 했어요' : ' · 번역은 자동 번역이에요'}</p>`;
  trackDaily('tab/news', '뉴스 탭');
}
document.addEventListener('click', e => {
  const b = e.target.closest('#nwTabs button'); if (!b) return;
  S.newsTab = b.dataset.k; save(); renderNews();
});

/* ---- 오늘의 경제노트 ---- */
let noteIdx = 0;
const LV = {'기초': '🌱 기초', '중급': '🌿 중급', '심화': '🌳 심화'};
const mdDate = d => { const x = new Date(d + 'T00:00'); return `${x.getMonth() + 1}/${x.getDate()}`; };
function quizState(){ try { return JSON.parse(localStorage.getItem('outfit.quiz')) || {}; } catch(e){ return {}; } }
function noteCard(N){
  const notes = (N.notes || []).filter(n => n && n.title);
  if (!notes.length || S.noteOn === false) return '';
  const i = Math.min(noteIdx, notes.length - 1), n = notes[i];
  const rel = (n.related || []).map(id => (N.top || []).find(x => x.id === id)).filter(Boolean);
  const body = n.body || [];
  const qk = n.date + '|' + n.title, pick = quizState()[qk];
  const q = n.quiz;
  const quiz = q && q.options && q.options.length ? `<div class="nquiz"><div class="nkw-h">🧠 오늘의 퀴즈</div><div class="qq">${esc(q.q)}</div>
    ${q.options.map((o, j) => `<button class="qo ${pick == null ? '' : j === q.answer ? 'ok' : j === pick ? 'no' : 'qdim'}" data-q="${j}" ${pick == null ? '' : 'disabled'}>
      ${pick == null ? '' : j === q.answer ? '⭕ ' : j === pick ? '❌ ' : ''}${esc(o)}</button>`).join('')}
    ${pick == null ? '' : `<div class="qx">${pick === q.answer ? '🎉 정답이에요!' : '아쉬워요! 정답은 ' + (q.answer + 1) + '번이에요.'} ${esc(q.explain || '')}</div>`}</div>` : '';
  return `<section class="card note">
    <div class="tt">📒 오늘의 경제노트 <span class="badge">${LV[n.level] || esc(n.level || '')}</span><span class="nd">${mdDate(n.date)}</span></div>
    <h3 class="ntitle">${esc(n.title)}</h3>
    ${n.intro ? `<p class="nintro">${esc(n.intro)}</p>` : ''}
    ${rel.length ? `<div class="nrel">${rel.map(x => `<button data-rel="${esc(x.id)}">🔗 ${esc(newsTitle(x))}</button>`).join('')}</div>` : ''}
    ${n.chain && n.chain.length ? `<div class="chain">${n.chain.map(c => `<span>${esc(c)}</span>`).join('<i>→</i>')}</div>` : ''}
    ${body[0] ? `<p class="np">${esc(body[0])}</p>` : ''}
    ${body.length > 1 || n.example ? `<details class="nread"><summary><span class="c">이어서 읽기 ▾</span><span class="o">접기 ▴</span></summary>
      ${body.slice(1).map(p => `<p class="np">${esc(p)}</p>`).join('')}
      ${n.example ? `<div class="nex">🧮 ${esc(n.example)}</div>` : ''}</details>` : ''}
    ${n.takeaway ? `<div class="ntake">✅ ${esc(n.takeaway)}</div>` : ''}
    ${(n.keywords || []).length ? `<div class="nkw-h">📌 오늘의 키워드</div>${n.keywords.map(k => `<details class="nkw"><summary>${esc(k.term)}<span>▾</span></summary>
      <div class="kd">${esc(k.desc)}${k.tip ? `<div class="kt">💡 ${esc(k.tip)}</div>` : ''}</div></details>`).join('')}` : ''}
    ${quiz}
    ${notes.length > 1 ? `<div class="nkw-h">📚 지난 노트</div><div class="nhist">${notes.map((x, j) => `<button data-ni="${j}" class="${j === i ? 'on' : ''}"><b>${mdDate(x.date)}</b> ${esc(x.title)}</button>`).join('')}</div>` : ''}
  </section>`;
}
document.addEventListener('click', e => {
  const ni = e.target.closest('.nhist [data-ni]');
  if (ni){ noteIdx = +ni.dataset.ni; renderNews(); setTimeout(() => document.querySelector('.card.note')?.scrollIntoView({behavior: 'smooth'}), 30); return; }
  const qo = e.target.closest('.nquiz [data-q]');
  if (qo){
    const n = (dcLoad('news')?.data?.notes || [])[noteIdx]; if (!n) return;
    const st = quizState(); st[n.date + '|' + n.title] = +qo.dataset.q;
    const keys = Object.keys(st); if (keys.length > 60) delete st[keys[0]];
    try { localStorage.setItem('outfit.quiz', JSON.stringify(st)); } catch(err){}
    track('note/quiz', '경제노트 퀴즈'); renderNews(); setTimeout(() => document.querySelector('.nquiz')?.scrollIntoView({block: 'center'}), 30); return;
  }
  const rl = e.target.closest('.nrel [data-rel]');
  if (rl){ const d = document.getElementById('ti-' + rl.dataset.rel); if (d){ d.open = true; d.scrollIntoView({behavior: 'smooth', block: 'start'}); } }
});
