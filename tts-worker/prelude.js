// 앱 파일(concepts·phrases·regions·core.js)은 브라우저용이라 window를 써요 → 서버에서는 전역 객체를 window로
globalThis.window = globalThis;
