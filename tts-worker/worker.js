// 모닝픽 영어 읽기 — Cloudflare Workers AI (Deepgram Aura-2) 무료 일일 사용량 안에서 동작.
// 한도를 넘거나 오류가 나면 앱이 기기 내장 음성으로 자동 전환해요. (무료 플랜이라 요금이 청구되지 않아요)
const VOICES = { us: 'thalia', uk: 'pandora' };
const ALLOW = /^(https:\/\/([a-z0-9-]+\.)?morningpick\.pages\.dev|https:\/\/bottleman-bang\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOW.test(origin) ? origin : 'https://morningpick.pages.dev', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    const url = new URL(req.url);
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
    const res = new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000' } });
    const h = new Headers(res.headers); for (const k in cors) h.set(k, cors[k]);
    return new Response(res.body, { headers: h });
  },
};
