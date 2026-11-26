/* 날씨 아이콘 (SVG) — 부드러운 색 */
(() => {
  const CLOUD = 'M20 48H46A10 10 0 0 0 46 28A14 14 0 0 0 19.5 30.5A9 9 0 0 0 20 48Z';
  const cloud = (x, y, s, fill = '#FFFFFF', stroke = '#C5CFD9') =>
    `<path d="${CLOUD}" transform="translate(${x} ${y}) scale(${s})" fill="${fill}" stroke="${stroke}" stroke-width="${2 / s}" stroke-linejoin="round"/>`;
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      rays += `<line x1="${(cx + c * (r + 4)).toFixed(1)}" y1="${(cy + s * (r + 4)).toFixed(1)}" x2="${(cx + c * (r + 8.5)).toFixed(1)}" y2="${(cy + s * (r + 8.5)).toFixed(1)}"/>`;
    }
    return `<g stroke="#F4BE4F" stroke-width="3" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#F7CB5C"/>`;
  };
  const moon = (cx, cy, r) =>
    `<path d="M${cx + r * .25} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * .45}A${r * .8} ${r * .8} 0 1 1 ${cx + r * .25} ${cy - r}Z" fill="#EBD08A"/>`;
  const drops = (n, len) => {
    const xs = n === 3 ? [22, 32, 42] : [17, 25, 33, 41, 49];
    return `<g stroke="#79AEDC" stroke-width="3.2" stroke-linecap="round">${xs.map(x => `<line x1="${x}" y1="45" x2="${x - 3}" y2="${45 + len}"/>`).join('')}</g>`;
  };
  const flakes = () => `<g fill="#8FBDE6">${[[22, 49], [32, 56], [42, 49], [27, 60], [37, 63]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8"/>`).join('')}</g>`;
  const gray = (x = 0, y = -8, s = 1) => cloud(x, y, s, '#E6EBF0', '#B4C0CB');

  const K = {
    'clear-day':   () => sun(32, 32, 11),
    'clear-night': () => moon(30, 32, 15),
    'partly-day':  () => sun(23, 23, 8.5) + cloud(9, 10, .85),
    'partly-night':() => moon(22, 22, 10) + cloud(9, 10, .85),
    'mostly-day':  () => sun(20, 20, 7.5) + cloud(-2, 2, 1.05) ,
    'mostly-night':() => moon(20, 19, 9) + cloud(-2, 2, 1.05),
    'overcast':    () => cloud(6, -6, .85, '#D9E0E7', '#AEBAC6') + cloud(-3, 5, 1),
    'rain':        () => gray() + drops(3, 9),
    'heavyrain':   () => gray(0, -8) + drops(5, 13),
    'snow':        () => gray() + flakes(),
    'thunder':     () => gray(0, -8, 1).replace('#E6EBF0', '#D3DAE2') + '<path d="M34 39 25 52h7l-4 11 12-15h-7l4-9z" fill="#F2B544" stroke="#E0A030" stroke-width="1" stroke-linejoin="round"/>',
    'fog':         () => gray(0, -10) + '<g stroke="#AEB9C4" stroke-width="3.2" stroke-linecap="round"><line x1="14" y1="45" x2="50" y2="45"/><line x1="18" y1="52" x2="46" y2="52"/><line x1="14" y1="59" x2="42" y2="59"/></g>',
    'wind':        () => '<g fill="none" stroke="#7FB4C9" stroke-width="4" stroke-linecap="round"><path d="M8 25h30a6 6 0 1 0-6-6"/><path d="M8 35h40a7 7 0 1 1-7 7"/><path d="M8 45h20a5 5 0 1 1-5 5"/></g>',
  };
  window.wxIcon = (kind, size = 40) =>
    `<svg class="wxi" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${(K[kind] || K['partly-day'])()}</svg>`;
})();
