/* 앱 설정 — 여기만 바꾸면 돼요 */
window.APP_CONFIG = {
  // GoatCounter 코드 이름 (예: 'morningpick' → https://morningpick.goatcounter.com 대시보드)
  // 비워두면 사용 통계를 보내지 않아요.
  goatcounter: '',
  // 카카오 JavaScript 키 (국내 도로명·장소 검색 정확도 향상). 비워두면 앱 내장 행정구역 + OpenStreetMap으로 검색해요.
  kakaoKey: '',
  // 새 공유 주소 (예: 'https://morningpick.pages.dev/'). 정해지면 예전 주소로 들어온 사람은 기록과 함께 여기로 옮겨져요.
  canonical: 'https://morningpick.pages.dev/',
  // 뉴스·증시·Daily Up 데이터 (outfit-data 저장소가 15분마다 만들어요)
  // 영어 읽기 AI 음성 (Cloudflare Workers AI 무료 사용량, tts-worker/ 폴더). 비우면 기기 내장 음성만 써요.
  ttsUrl: 'https://morningpick-tts.morningpick.workers.dev/',
  dataUrl: 'https://raw.githubusercontent.com/bottleman-bang/outfit-data/data/',
};
