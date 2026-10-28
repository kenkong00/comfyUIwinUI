// src/shell/icons.js
// 统一的图标库：返回完整 <svg> 字符串，供 v-html 渲染。
// 应用图标使用品牌色填充；UI 图标使用 currentColor，由 CSS 控制颜色。

const wrap = (inner, colored = false) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" ${
    colored ? '' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  }>${inner}</svg>`

export const ICONS = {
  // ===== 应用图标（彩色）=====
  explorer: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M3 6.5C3 5.12 4.12 4 5.5 4h4l2 2h7.5c1.38 0 2.5 1.12 2.5 2.5v8C21.5 18.88 20.38 20 19 20H5.5C4.12 20 3 18.88 3 17.5z" fill="#3a8dde"/><path d="M3 8.5h18v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2z" fill="#5aa9f0"/><path d="M8 11.5l3 3-3 3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  notepad: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="4.5" y="3" width="15" height="18" rx="2" fill="#2b579a"/><rect x="7" y="6.5" width="10" height="1.6" rx=".8" fill="#fff"/><rect x="7" y="10" width="10" height="1.6" rx=".8" fill="#cfe0ff"/><rect x="7" y="13.5" width="10" height="1.6" rx=".8" fill="#cfe0ff"/><rect x="7" y="17" width="6" height="1.6" rx=".8" fill="#cfe0ff"/></svg>`,

  photos: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="#0a8f4f"/><circle cx="8.5" cy="9" r="1.8" fill="#ffd34e"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5z" fill="#7fe0a8"/></svg>`,

  media: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#7b2ff7"/><path d="M10 8.5l6 3.5-6 3.5z" fill="#fff"/></svg>`,

  tasks: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="#d83b01"/><path d="M7 8.5l1.8 1.8L12 7" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 14.5l1.8 1.8L12 13" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 10h4M14.5 16h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,

  studio: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="#c239b3"/><path d="M12 7.5l1.3 3.2 3.2 1.3-3.2 1.3L12 16.5l-1.3-3.2L7.5 12.4l3.2-1.3z" fill="#fff"/><circle cx="17" cy="7" r="1.4" fill="#ffd34e"/></svg>`,

  uidesigner: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="#107c41"/><rect x="6" y="6" width="12" height="3" rx="1" fill="#fff"/><rect x="6" y="11" width="5" height="7" rx="1" fill="#bdeccb"/><rect x="13" y="11" width="5" height="7" rx="1" fill="#bdeccb"/></svg>`,

  chat: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9l-4 4v-4H5.5C4.67 16 4 15.33 4 14.5z" fill="#0067c0"/><circle cx="9" cy="9.5" r="1.2" fill="#fff"/><circle cx="12" cy="9.5" r="1.2" fill="#fff"/><circle cx="15" cy="9.5" r="1.2" fill="#fff"/></svg>`,

  settings: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path fill="#8a8a8a" d="M19.14 12.94c.04-.31.06-.62.06-.94 0-.32-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.23.09.47 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/><circle cx="12" cy="12" r="2" fill="#5b5b5b"/></svg>`,

  recycle: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14l-1.2 12.2c-.1 1-1 1.8-2 1.8H8.2c-1 0-1.9-.8-2-1.8z" fill="#5a6b7b"/><rect x="9" y="3.5" width="6" height="2.2" rx="1.1" fill="#3d4a57"/><path d="M10 10v7M14 10v7" stroke="#cfd8e0" stroke-width="1.6" stroke-linecap="round"/></svg>`,

  character: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" fill="#e8730c"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5z" fill="#f0a45a"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M4 4.6C4 3.7 4.7 3 5.6 3h4.9c.9 0 1.5.7 1.5 1.6v16.8c0-.9-.6-1.6-1.5-1.6H5.6C4.7 20 4 19.3 4 18.4z" fill="#c0392b"/><path d="M20 4.6C20 3.7 19.3 3 18.4 3h-4.8c-.9 0-1.6.7-1.6 1.6v16.8c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6z" fill="#e74c3c"/><path d="M10.6 4.4v15.2M13.4 4.4v15.2" stroke="#fff" stroke-width="1.1"/></svg>`,

  profile: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3.6" fill="#0067c0"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6z" fill="#5aa9f0"/></svg>`,

  tag: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h7l9 9-7 7-9-9z" fill="#ffb900"/><circle cx="8" cy="8" r="1.6" fill="#fff"/></svg>`,

  history: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" fill="#5b5b5b"/><path d="M12 7.5V12l3.2 2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M12 3.5a8.5 8.5 0 1 1-6 2.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,

  // ===== UI 图标（currentColor）=====
  search: wrap(`<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="21" y2="21"/>`),
  start: wrap(`<rect x="3" y="3" width="8" height="8" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="3" width="8" height="8" rx="1.2" fill="currentColor" stroke="none"/><rect x="3" y="13" width="8" height="8" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="13" width="8" height="8" rx="1.2" fill="currentColor" stroke="none"/>`, true),
  wifi: wrap(`<path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5 12a11 11 0 0 1 14 0"/><path d="M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>`),
  wifiOff: wrap(`<path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5 12a11 11 0 0 1 14 0"/><path d="M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/><line x1="3" y1="3" x2="21" y2="21"/>`),
  volume: wrap(`<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8 8 0 0 1 0 12"/>`),
  battery: wrap(`<rect x="2" y="7" width="17" height="10" rx="2.5"/><line x1="21" y1="10" x2="21" y2="14"/><rect x="4" y="9" width="11" height="6" rx="1" fill="currentColor" stroke="none"/>`),
  chevron: wrap(`<polyline points="9 6 15 12 9 18"/>`),
  folder: wrap(`<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h7A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>`),
  file: wrap(`<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>`),
  image: wrap(`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M5 17l4.5-4.5 3 3L15 12l4 4"/>`),
  plus: wrap(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`),
  refresh: wrap(`<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>`),
  close: wrap(`<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`),
  play: wrap(`<polygon points="8 5.5 18.5 12 8 18.5" fill="currentColor" stroke="none"/>`),
  pause: wrap(`<line x1="9" y1="6" x2="9" y2="18" stroke-width="2.4"/><line x1="15" y1="6" x2="15" y2="18" stroke-width="2.4"/>`),
  minimize: wrap(`<line x1="5" y1="19" x2="19" y2="19"/>`),
  maximize: wrap(`<rect x="5" y="5" width="14" height="14" rx="1.5"/>`),
  restore: wrap(`<rect x="5" y="8" width="11" height="11" rx="1.5"/><path d="M8 8V5h11v11h-3"/>`),
  snapLeft: wrap(`<rect x="3" y="4" width="9" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5" stroke-dasharray="2 2" opacity=".5"/>`),
  snapRight: wrap(`<rect x="12" y="4" width="9" height="16" rx="1.5"/><rect x="3" y="4" width="7" height="16" rx="1.5" stroke-dasharray="2 2" opacity=".5"/>`),
  snapMax: wrap(`<rect x="3" y="4" width="18" height="16" rx="1.5"/>`),
  user: wrap(`<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>`),
  power: wrap(`<path d="M12 3v9"/><path d="M6.5 7a8 8 0 1 0 11 0"/>`),
  grid: wrap(`<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>`),
  gear: wrap(`<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>`),
  bell: wrap(`<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>`),
  desktop: wrap(`<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>`),
  layer: wrap(`<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>`),

  // ===== Explorer / 上下文菜单用 UI 图标 =====
  pc: wrap(`<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 20h8M12 16v4"/>`),
  drive: wrap(`<rect x="2.5" y="5" width="19" height="11" rx="2"/><rect x="5" y="8" width="8.5" height="5" rx="1" fill="currentColor" stroke="none" opacity=".7"/><circle cx="18" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><line x1="6" y1="19.5" x2="18" y2="19.5"/>`),
  chevronDown: wrap(`<polyline points="6 9 12 15 18 9"/>`),
  back: wrap(`<polyline points="15 6 9 12 15 18"/>`),
  forward: wrap(`<polyline points="9 6 15 12 9 18"/>`),
  up: wrap(`<polyline points="6 14 12 8 18 14"/>`),
  folderOpen: wrap(`<path d=\"M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5v1H3z\"/><path d=\"M3 11.5h17.5a1 1 0 0 1 .96 1.27l-1.3 4.6A1.5 1.5 0 0 1 18.72 19H4.5A1.5 1.5 0 0 1 3 17.5z\"/>`),
  folderPlus: wrap(`<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h7A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><line x1="12" y1="13" x2="12" y2="18"/><line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>`),
  filePlus: wrap(`<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><line x1="12" y1="13" x2="12" y2="18"/><line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>`),
  import: wrap(`<path d="M12 3v12"/><polyline points="8 11 12 15 16 11"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>`),
  list: wrap(`<line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>`),
  sidebar: wrap(`<rect x="3" y="4.5" width="18" height="15" rx="2"/><line x1="9.5" y1="4.5" x2="9.5" y2="19.5"/><rect x="5.4" y="7.6" width="2.4" height="2.4" rx=".5" fill="currentColor" stroke="none"/><rect x="5.4" y="12" width="2.4" height="2.4" rx=".5" fill="currentColor" stroke="none"/>`),
  empty: wrap(`<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/>`),
  paste: wrap(`<rect x="6" y="4" width="12" height="17" rx="2"/><rect x="9" y="2" width="6" height="3" rx="1"/><path d="M9 11h6M9 15h6"/>`),
  copy: wrap(`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>`),
  cut: wrap(`<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><line x1="8.2" y1="8.6" x2="19" y2="19"/><line x1="8.2" y1="15.4" x2="19" y2="5"/>`),
  trash: wrap(`<path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`),
  imgImport: wrap(`<rect x="3" y="4" width="13" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.3"/><path d="M4.5 14.5l3.5-3.5 2.5 2.5 2.5-2.5 3 3"/><path d="M19 8v9"/><polyline points="15.5 14.5 19 18 22.5 14.5"/>`),
  txtImport: wrap(`<path d="M6 3h8l4 4v5"/><path d="M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M14 3v4h4"/><line x1="8" y1="10" x2="12" y2="10"/><line x1="8" y1="14" x2="11" y2="14"/><path d="M19 13v8"/><polyline points="15.5 17.5 19 21 22.5 17.5"/>`),
  rename: wrap(`<path d="M4 20h16"/><path d="M14.5 4.5l5 5L9 20l-5 1 1-5z"/>`),
  info: wrap(`<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r=".6" fill="currentColor" stroke="none"/>`),
  warning: wrap(`<path d="M12 3 22 20H2z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>`),
  check: wrap(`<path d="M4 12.5 9 17.5 20 6.5"/>`),
  import: wrap(`<path d="M12 3v10"/><path d="M8 9l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>`),
  open: wrap(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13l3 3 3-3"/>`),
  window: wrap(`<rect x="3" y="4" width="18" height="15" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><circle cx="6" cy="6" r=".7" fill="currentColor" stroke="none"/>`),
  rule: wrap(`<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 11h18M7 11v3M11 11v4M15 11v3"/>`),
  function: wrap(`<path d="M6 16c2 0 2-4 4-4s2 4 4 4 2-4 4-4"/><line x1="3" y1="7" x2="6" y2="7"/>`),
  comfy: wrap(`<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>`),
  server: wrap(`<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><circle cx="7" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r=".9" fill="currentColor" stroke="none"/>`),
  // 项目后端总服务（3007 后端 API + 3006 下载服务）统一图标：数据库圆柱，区别于 server 双层机架
  backend: wrap(`<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>`),
  download: wrap(`<path d="M12 3v11"/><polyline points="8 10 12 14 16 10"/><path d="M4 18h16"/>`),
  ai: wrap(`<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" fill="currentColor" stroke="none"/><circle cx="18" cy="17.2" r="1.6" fill="currentColor" stroke="none"/>`),
  minimizeWin: wrap(`<line x1="5" y1="19" x2="19" y2="19"/>`),
  // Json分镜文件/分镜生成：胶片分镜条（紫色，带齿孔与三格画面），与普通文件、工作流图标一眼区分
  storyboard: `<svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="1.6" y="5" width="20.8" height="14" rx="2.4" fill="#7c3aed"/><g fill="#fff" opacity=".92"><rect x="3.4" y="6.4" width="2.6" height="1.7" rx=".6"/><rect x="8" y="6.4" width="2.6" height="1.7" rx=".6"/><rect x="12.6" y="6.4" width="2.6" height="1.7" rx=".6"/><rect x="17.2" y="6.4" width="2.6" height="1.7" rx=".6"/><rect x="3.4" y="15.9" width="2.6" height="1.7" rx=".6"/><rect x="8" y="15.9" width="2.6" height="1.7" rx=".6"/><rect x="12.6" y="15.9" width="2.6" height="1.7" rx=".6"/><rect x="17.2" y="15.9" width="2.6" height="1.7" rx=".6"/></g><g fill="#fff"><rect x="3.2" y="9.1" width="4.5" height="5" rx=".9"/><rect x="9.1" y="9.1" width="4.5" height="5" rx=".9"/><rect x="15" y="9.1" width="4.5" height="5" rx=".9"/></g><circle cx="5.45" cy="11.6" r=".9" fill="#7c3aed"/><circle cx="11.35" cy="11.6" r=".9" fill="#7c3aed"/><circle cx="17.25" cy="11.6" r=".9" fill="#7c3aed"/></svg>`,
  audio: wrap(`<path d="M5 9v6h4l5 4V5L9 9z" fill="currentColor" stroke="none"/><path d="M17 9a4 4 0 0 1 0 6"/>`),
  star: wrap(`<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>`, true),
}

export function icon(name) {
  return ICONS[name] || ICONS.file
}
