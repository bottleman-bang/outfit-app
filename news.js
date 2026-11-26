/* ================== 뉴스 탭 ================== */
const CAT_E = {markets: '📈', economy: '🏛️', bonds: '💵', commodities: '🛢️', crypto: '🪙', tech: '🤖', people: '👤', korea: '🇰🇷', world: '🌏'};
const CAT_ORDER = ['markets', 'economy', 'bonds', 'commodities', 'crypto', 'tech', 'people', 'korea', 'world'];

function newsTitle(x){ return x.tk || x.t; }
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
  return `<details class="ni nbig" ${open ? 'open' : ''}>
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
function ruleNewsBrief(N){
  const P = PH.nw, out = [];
  const top = (N.top || []).slice(0, 4);
  top.forEach((x, i) => out.push(say(P.item, 'nw.i' + i, {e: CAT_E[x.c] || '📰', t: esc(newsTitle(x)), s: esc(x.s), n: x.n > 1 ? ` (${x.n}개 매체)` : ''})));
  if (N.digest && N.digest[0]) out.push('📊 ' + esc(N.digest[0]));
  return out;
}
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
  el.innerHTML = `
    <section class="card mbrief"><div class="tt">🔑 오늘의 핵심 <span class="badge">${N.ai && N.brief?.length ? 'AI 요약' : '자동 정리'}</span></div>
      <ul>${brief.map(l => `<li>${l}</li>`).join('')}</ul></section>
    <section class="card"><h2>⭐ 주요 뉴스</h2><div class="why" style="margin:0 0 6px">여러 매체가 다루고 시장에 영향이 큰 순서예요 · 누르면 요약이 펼쳐져요</div>
      ${top.map((x, i) => topItem(x, i === 0)).join('') || '<div class="empty" style="padding:20px">관심 분류에 맞는 주요 뉴스가 없어요</div>'}</section>
    <section class="card"><h2>🗂️ 분류별 뉴스</h2>
      <div class="hscroll-row" id="nwTabs" style="margin-bottom:6px">${[['all', '전체'], ...cats.map(c => [c, `${CAT_E[c]} ${N.catNames[c]}`])].map(([k, l]) =>
        `<button class="mode ${cur === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      ${(list || []).map(x => newsItem(x)).join('') || '<div class="empty" style="padding:20px">기사가 없어요</div>'}</section>
    <p class="disc">제목을 누르면 원문으로 이동해요 · 출처: Reuters·Bloomberg·WSJ·FT·CNBC·연합뉴스 등 각 언론사${N.ai ? ' · 요약·번역은 AI가 했어요' : ' · 번역은 자동 번역이에요'}</p>`;
  trackDaily('tab/news', '뉴스 탭');
}
document.addEventListener('click', e => {
  const b = e.target.closest('#nwTabs button'); if (!b) return;
  S.newsTab = b.dataset.k; save(); renderNews();
});
