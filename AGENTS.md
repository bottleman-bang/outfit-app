# 모닝픽 (outfit-app) — 작업 안내서

AI 코딩 도구(Codex, Claude Code 등)와 사람이 함께 읽는 문서예요. 이 저장소에서 작업을 시작하기 전에 먼저 읽어 주세요.
데이터를 만드는 쪽은 별도 저장소 `~/outfit-data`에 있고, 그 저장소의 `AGENTS.md`를 함께 보세요.

## 꼭 지킬 규칙
- **모든 것은 무료여야 해요.** API, AI, 호스팅, 도메인 모두 해당해요. 유료 서비스는 가격을 밝히고 "선택 사항"으로만 제안해요.
- **사용자와는 한국어로 대화해요.** 개인용 비상업 앱이고, 주로 가족(아내)이 써요.
- 앱을 바꾸면 **두 곳 모두 배포**해요(아래 '배포'). 그리고 `sw.js`의 `CACHE` 버전을 하나 올려요.
- Microsoft Edge 음성처럼 다른 서비스인 척 접속하는 비공식 방식은 쓰지 않아요(보안 정책상 금지).

## 구조 (빌드 없는 정적 PWA, 일반 `<script>`를 순서대로 읽어요)
`index.html`이 아래 순서로 스크립트를 읽어요. 모든 파일이 전역 변수를 같이 써요.
`config.js` → `concepts.js` → `phrases.js` → `icons.js` → `regions.js` → `core.js` → `app.js` → `market.js` → `news.js` → `daily.js` → `brief.js`

| 파일 | 하는 일 |
|---|---|
| `config.js` | 설정값: 공유 주소(canonical), 데이터 주소(dataUrl), 음성 서버 주소(ttsUrl) |
| `concepts.js` | 추천 종류(일상·운동·아이), 옷 두께 단계, 시간대(WHEN) |
| `phrases.js` | 문구 은행. `say()`는 VSEED(날짜·지역·종류) 기준으로 같은 날에는 같은 문구를 골라요 |
| `regions.js` | 국내 읍·면·동 좌표 (150KB) |
| **`core.js`** | **앱과 서버가 함께 쓰는 순수 계산.** 날씨 가공 `wx()`, 체감 브리핑, 옷 추천 `recommend()`, 오늘의 브리핑 문장 `buildBrief()`. DOM은 쓰지 않아요 |
| `app.js` | 날씨 화면, 기록, 설정, 위치(GPS·검색), 저장 `S` / `save()` |
| `market.js` / `news.js` | 증시 화면 / 뉴스 화면. 데이터는 outfit-data의 `market.json`·`news.json`이고, 8분마다 다시 확인해요 |
| `daily.js` | Daily Up(Talk Pick 영어 첨삭, AI 한 스푼). 영어 읽기 `speakEn()`은 Aura 음성을 쓰고, 안 되면 기기 음성으로 읽어요 |
| `brief.js` | 🔊 오늘의 브리핑 재생기(일시정지·다음·정지), 시리용 설정 동기화, 한국어 목소리 선택 |
| `tts-worker/` | Cloudflare Worker 서버(아래). **Pages 배포에는 넣지 않아요** |
| `morningpick-brief.shortcut` | 서명된 아이폰 단축어("모닝픽 오늘의 브리핑 읽어줘") |
| `_headers` | Cloudflare Pages 응답 헤더(단축어 파일 다운로드 이름) |

## 🔊 오늘의 브리핑
- 날씨 화면 오른쪽 위 버튼으로 시작해요. 순서는 날씨 → 뉴스 → 증시 → Daily Up이에요.
- 문장은 `core.js`의 `buildBrief()` **한 곳에서만** 만들어요. 앱과 서버(시리)가 같은 함수를 쓰니까 **문장을 바꾸려면 core.js만 고쳐요.** 그다음 Worker도 다시 배포해요(core.js가 Worker에 같이 묶여요).
- 결과는 `segs: [{sec, part, lang, text}]`예요. part `a`(한국어) → `b`(영어 Talk Pick) → `c`(한국어 마무리) 순서이고, 시리 단축어는 a·b·c를 각각 한국어·영어·한국어 목소리로 읽어요.
- `speakable()`이 HTML·이모지·기호를 소리 내기 좋은 문장으로 바꿔요(예: −3° → 영하 3도, m/s → 초속 ○미터).
- 목소리: 한국어는 기기 내장 음성(`koVoice()`가 프리미엄 > 향상됨 > 기본 순으로 자동 선택, 설정에서 고를 수 있음), 영어는 Aura-2.
  - **iOS는 시리 계열 목소리(예: 지안)를 웹 앱에 주지 않아요.** 그래서 웹 앱 목록에는 유나만 보일 수 있어요. 시리 단축어의 '텍스트 말하기'에서는 고를 수 있어요.

## 서버: Cloudflare Worker `morningpick-tts` (`tts-worker/`)
- 주소: https://morningpick-tts.morningpick.workers.dev · 배포: `cd tts-worker && npx wrangler@4 deploy`
- `prelude.js`가 `window = globalThis`로 맞춘 뒤 앱의 `concepts·phrases·regions·core.js`를 그대로 묶어 써요.
- 길:
  - `/?v=us|uk&t=영어문장` → 영어 음성 MP3. Workers AI `@cf/deepgram/aura-2-en`을 쓰고, 같은 문장은 KV에 60일 저장해요.
  - `/brief?u=<내코드>&lat=&lon=&fmt=siri|text|json` → 오늘의 브리핑.
    - 위치는 폰의 현재 좌표를 먼저 쓰고, 없거나 앱 위치에서 1.5km 안이면 앱에서 마지막으로 본 위치를 써요.
    - 날씨는 2일치만 받아요(앱의 16일치와 오늘 문장이 같은 것을 확인했어요).
  - `/sync` POST/DELETE → 설정·위치·옷 기록을 KV `p:<id>`에 보관하거나 지워요. 앱 설정의 '시리·AI 비서로 듣기'를 켠 사람만 보관해요.
- KV namespace `TTS`(id 75ba81ca…)는 음성 캐시와 프로필에 같이 써요.
- 무료 플랜 CPU 한도(10ms) 근처예요(측정값 6~22ms). 서버가 켜질 때 예열(warmUp)을 해요. `core.js`에 느린 처리(예: `localeCompare`, 큰 배열을 매번 새로 만들기)를 넣지 마세요.

## 시리 단축어
- 앱 설정 → '시리·AI 비서로 듣기' 켜기 → '단축어 추가하기'(내 주소가 복사됨) → 주소를 붙여 넣으면 돼요.
- 동작 순서: 주소(가져올 때 묻는 칸) → 현재 위치 가져오기 → URL 가져오기(`&fmt=siri&lat=&lon=`) → a·b·c 텍스트 말하기.
- 단축어를 다시 만들 때는 plist를 Python `plistlib`로 만들고 `shortcuts sign --mode anyone`으로 서명해요(맥에서만 가능).

## 배포 (둘 다 해야 해요)
1. `git push` → GitHub Pages(예전 주소. canonical 설정 때문에 새 주소로 이동해요)
2. Cloudflare Pages(메인 주소 https://morningpick.pages.dev):
   ```bash
   D=$(mktemp -d); rsync -a --exclude .git --exclude tts-worker ~/outfit-app/ $D/site/
   cd $D && npx wrangler@4 pages deploy site --project-name morningpick --branch main --commit-dirty=true --force
   ```
   (wrangler 설정 파일이 없는 깨끗한 폴더에서 실행해요. `--force`가 없으면 실패해요.)
3. `core.js`를 바꿨으면 Worker도 다시 배포해요.

## 시험 방법 (수정 전후 비교)
- 녹화한 날씨·뉴스 데이터로 headless Chrome(puppeteer-core + 설치된 Chrome)에서 앱을 띄워 화면 글자를 비교하는 방식을 썼어요.
- 날씨 화면은 **현재 시각에 따라 기본 시간대(아침/낮)가 바뀌니까**, 비교할 때는 같은 시각에 수정 전·후를 나란히 돌려요.

## 지금까지 한 일 (2026-11)
- 영어 읽기: 기기 음성 → Deepgram Aura-2(무료 Workers AI)
- 오늘의 브리핑 버튼·플레이어 추가, 계산 코드를 `core.js`로 분리, 시리 단축어 서버(/brief, /sync)
- 뉴스·증시 갱신 시간표 변경(outfit-data): 뉴스 8·12·16시, 증시 7시(미국 중심)·17시(한국 중심), 휴장 자동 판단
- 한국어 목소리 자동 선택·고르기 추가

## 남은 아이디어
- 더 자연스러운 한국어 AI 음성: **Supertonic 3**(슈퍼톤 공개 모델, 폰 안에서 실행, 약 400MB, OpenRAIL 라이선스)을 '고품질 목소리 내려받기'로 넣는 방안. 샘플 테스트를 아직 못 했어요(보안 정책으로 실행이 막힘).
- Gemini 음성: 무료 한도가 계정마다 다르고 적어요. 키는 사용자가 직접 `wrangler secret put`으로 넣어야 해요.
- 안드로이드 음성 비서는 무료 공식 방법이 없어서, 홈 화면 아이콘을 길게 눌러 나오는 '오늘의 브리핑'으로 대신해요.
