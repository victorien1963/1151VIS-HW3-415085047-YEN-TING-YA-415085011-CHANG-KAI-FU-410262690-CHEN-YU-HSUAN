// 共用：資料整理、場次顏色、提示框、跨圖連動狀態。其他檔案透過 window.HW3 取用。
(() => {
  const data = window.STREET_DATA;

  const parseDate = d3.utcParse('%Y-%m-%d');
  const formatDate = d3.utcFormat('%Y-%m-%d');
  const fmt = d3.format(',');
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
  const weekday = (iso) => WEEKDAY[parseDate(iso).getUTCDay()];
  const shiftDate = (iso, n) => {
    const t = parseDate(iso);
    t.setUTCDate(t.getUTCDate() + n);
    return formatDate(t);
  };
  const wan = (n) => `${(n / 10000).toFixed(1)} 萬`;

  const byDate = new Map(data.daily.map((d) => [d.date, d]));
  const DAYS = data.daily.map((d) => d.date);
  const dayIndex = new Map(DAYS.map((d, i) => [d, i]));

  // ---------- 場次 ----------
  const SESSION_META = {
    '2026-10-11': { no: 1, color: '#4cc9f0', districts: ['中山區', '大同區'] },
    '2026-10-18': { no: 2, color: '#c77dff', districts: ['松山區', '信義區'] },
    '2026-10-31': { no: 3, color: '#ff5d8f', districts: ['中正區', '萬華區'] },
    '2026-11-01': { no: 4, color: '#ffd166', districts: ['大安區', '文山區'] },
    '2026-11-07': { no: 5, color: '#d62828', districts: ['內湖區', '南港區'] },
    '2026-11-15': { no: 6, color: '#ff8c42', districts: ['士林區', '北投區'] },
  };
  const sessions = data.shenSessions.map((s) => ({
    ...s,
    ...SESSION_META[s.date],
    street: byDate.get(s.date).shen,
    posts: data.posts.filter((p) => p.candidate === 'shen' && p.date === s.date),
  }));
  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));
  const sessionByDistrict = new Map(sessions.flatMap((s) => s.districts.map((d) => [d, s])));

  // 兩位候選人都不用政黨色（綠、藍）：沈伯洋各場用場次色，蔣萬安用中性的銀灰。
  const CHIANG_COLOR = '#c3cad8';
  // 夜市位置是我們依地名標的約略座標；10/29 太太代為走的市場原文沒有地點，不標。
  const CHIANG_SPOTS = [
    // dx／dy／anchor 是標籤相對光點的位置，避免彼此重疊
    { date: '2026-10-27', name: '內湖 737 夜市', lon: 121.5746, lat: 25.0790, dx: 9, dy: 4, anchor: 'start' },
    { date: '2026-11-03', name: '寧夏夜市', lon: 121.5155, lat: 25.0560, dx: -9, dy: 4, anchor: 'end' },
    { date: '2026-11-06', name: '遼寧夜市', lon: 121.5407, lat: 25.0512, dx: 0, dy: -10, anchor: 'middle' },
    { date: '2026-11-12', name: '公館', lon: 121.5340, lat: 25.0145, dx: -9, dy: 4, anchor: 'end' },
    { date: '2026-11-13', name: '饒河夜市', lon: 121.5776, lat: 25.0510, dx: 9, dy: 4, anchor: 'start' },
    { date: '2026-11-15', name: '臨江街夜市', lon: 121.5543, lat: 25.0300, dx: 9, dy: 4, anchor: 'start' },
  ];
  const CHIANG_NOTES = {
    '2026-10-27': '這是他第一場夜市掃街，之前幾天幾乎沒有相關討論，之後又接連掃街，所以後面幾天的百分比特別高。隔天（10/28）晚間他身體不適、取消行程，難以分辨隔天聲量變多的原因。',
    '2026-10-29': '蔣萬安身體不適暫停公開行程，由太太石舫亘代為走市場。',
    '2026-11-06': '他走進公開挺沈伯洋的水餃店「又一村」打招呼，支持者在店外高喊口號，隔天引發爭議。',
    '2026-11-13': '11/14 起出現蔣萬安團隊在東發號用餐是否付錢的爭議。',
  };

  // ---------- 發文者類型 ----------
  const AUTHOR_TYPES = [
    { key: '一般民眾', label: '一般民眾', fill: '#ffffff', text: '#0a0f1c' },
    { key: '個人帳號', label: '個人帳號（追蹤者上萬）', fill: '#9aa6bd', text: '#0a0f1c' },
    { key: '公眾帳號', label: '公眾帳號（政治人物、評論者、粉專、媒體）', fill: '#34405a', text: '#e9edf5' },
  ];
  const authorTypeOf = (post) => (post.category === '一般民眾' || post.category === '個人帳號' ? post.category : '公眾帳號');
  const authorInfo = (key) => AUTHOR_TYPES.find((a) => a.key === key);
  const ringColor = (post) => (post.candidate === 'shen' ? sessionByDate.get(post.date).color : CHIANG_COLOR);

  // ---------- 對齊掃街日 ----------
  const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
  function decaySeries(candidate) {
    const list = candidate === 'shen'
      ? sessions.map((s) => ({ date: s.date, name: s.name, excluded: s.excluded, color: s.color }))
      : data.chiangSessions.map((s) => ({ date: s.date, name: s.name, excluded: false, color: CHIANG_COLOR }));
    return list.map((s) => {
      const base = byDate.get(s.date)[candidate];
      const points = OFFSETS.map((k) => {
        const row = byDate.get(shiftDate(s.date, k));
        return row ? { k, value: row[candidate], pct: (row[candidate] / base) * 100 } : null;
      }).filter(Boolean);
      return { ...s, candidate, base, points };
    });
  }
  const decay = { shen: decaySeries('shen'), chiang: decaySeries('chiang') };
  const decayMax = d3.max([...decay.shen, ...decay.chiang].flatMap((s) => s.points.map((p) => p.pct)));
  const pctAt = (series, date, k) => {
    const s = series.find((q) => q.date === date);
    const p = s && s.points.find((q) => q.k === k);
    return p ? p.pct : null;
  };

  // ---------- 地圖亮度 ----------
  const MAX_SHEN = d3.max(data.daily, (d) => d.shen);
  const MAX_CHIANG = d3.max(data.daily, (d) => d.chiang);
  // 每天的掃街相關討論，畫在「最近一場已發生的車掃」那兩區；跑過的場次留下微光。
  function shenGlow(i) {
    const date = DAYS[i];
    const current = [...sessions].reverse().find((s) => s.date <= date);
    const out = new Map();
    for (const s of sessions) {
      if (s === current) out.set(s.date, byDate.get(date).shen / MAX_SHEN);
      else out.set(s.date, s.date < date ? 0.1 : 0.03);
    }
    return { glow: out, current };
  }
  function shenGlowAll() {
    return new Map(sessions.map((s) => [s.date, 0.35 + 0.65 * (s.street / MAX_SHEN)]));
  }
  function chiangGlow(i) {
    const date = DAYS[i];
    const current = [...CHIANG_SPOTS].reverse().find((s) => s.date <= date);
    const out = new Map();
    for (const s of CHIANG_SPOTS) {
      if (s === current) out.set(s.date, byDate.get(date).chiang / MAX_CHIANG);
      else out.set(s.date, s.date < date ? 0.12 : 0);
    }
    return out;
  }
  function chiangGlowAll() {
    return new Map(CHIANG_SPOTS.map((s) => {
      const peak = Math.max(byDate.get(s.date).chiang, byDate.get(shiftDate(s.date, 1))?.chiang || 0);
      return [s.date, 0.25 + 0.75 * (peak / MAX_CHIANG)];
    }));
  }

  // ---------- 圖例 ----------
  // 每張圖都附圖例。items：{ type, color, label }；type 決定前面小圖示的畫法。
  const SURFACE = '#111829';
  const REF = '#77829a';
  function swatchSvg(it) {
    const c = it.color || '#ffffff';
    const svg = (wd, ht, body) => `<svg width="${wd}" height="${ht}" viewBox="0 0 ${wd} ${ht}" aria-hidden="true">${body}</svg>`;
    switch (it.type) {
      case 'dot': return svg(14, 14, `<circle cx="7" cy="7" r="5" fill="${c}"/>`);
      case 'hollow': return svg(14, 14, `<circle cx="7" cy="7" r="4.5" fill="${SURFACE}" stroke="${c}" stroke-width="2"/>`);
      case 'fill': return svg(16, 16, `<circle cx="8" cy="8" r="6.5" fill="${c}" stroke="#77829a" stroke-width="1"/>`);
      case 'ring': return svg(16, 16, `<circle cx="8" cy="8" r="6" fill="${SURFACE}" stroke="${c}" stroke-width="2.5"/>`);
      case 'dashed-ring': return svg(16, 16, `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="3 2.5"/>`);
      case 'glow': return svg(20, 20, `<circle cx="10" cy="10" r="9" fill="#ffffff" opacity="0.28"/><circle cx="10" cy="10" r="6" fill="#ffffff"/>`);
      case 'silver-dot': return svg(20, 20, `<circle cx="10" cy="10" r="9" fill="${c}" opacity="0.35"/><circle cx="10" cy="10" r="4.5" fill="${c}"/>`);
      case 'line': return svg(22, 10, `<line x1="2" x2="20" y1="5" y2="5" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`);
      case 'ref': return svg(22, 10, `<line x1="1" x2="21" y1="5" y2="5" stroke="${REF}" stroke-width="1.5"/>`);
      case 'vref': return svg(10, 16, `<line x1="5" x2="5" y1="1" y2="15" stroke="${REF}" stroke-width="1.5"/>`);
      case 'outline': return svg(16, 16, `<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="#ffffff" stroke-width="2"/>`);
      case 'dots': return svg(it.colors.length * 12, 12, it.colors.map((k, i) => `<circle cx="${i * 12 + 6}" cy="6" r="4.5" fill="${k}"/>`).join(''));
      case 'rings': return svg(it.colors.length * 14, 14, it.colors.map((k, i) => `<circle cx="${i * 14 + 7}" cy="7" r="5" fill="${SURFACE}" stroke="${k}" stroke-width="2"/>`).join(''));
      case 'gradient': return svg(40, 10, `<defs><linearGradient id="lg-grad-${it.id}"><stop offset="0" stop-color="${c}" stop-opacity="0.1"/><stop offset="1" stop-color="${c}" stop-opacity="0.95"/></linearGradient></defs><rect x="0" y="1" width="40" height="8" rx="2" fill="url(#lg-grad-${it.id})"/>`);
      case 'swatches': return svg(it.colors.length * 12, 12, it.colors.map((k, i) => `<rect x="${i * 12}" y="1" width="10" height="10" rx="2" fill="${k}"/>`).join(''));
      case 'lines': return svg(it.colors.length * 12 + 4, 10, it.colors.map((k, i) => `<line x1="${i * 12 + 2}" x2="${i * 12 + 12}" y1="5" y2="5" stroke="${k}" stroke-width="3" stroke-linecap="round"/>`).join(''));
      default: return '';
    }
  }
  function legend(target, items, { place = 'before', className = '' } = {}) {
    const box = document.createElement('div');
    box.className = `chart-legend ${className}`.trim();
    fillLegend(box, items);
    if (place === 'before') target.before(box);
    else if (place === 'append') target.append(box);
    else target.after(box);
    return box;
  }
  function fillLegend(box, items) {
    box.replaceChildren();
    for (const it of items) {
      const span = document.createElement('span');
      span.className = 'lg-item';
      if (it.html) span.innerHTML = it.html;
      else span.innerHTML = swatchSvg(it);
      span.append(document.createTextNode(it.label));
      box.append(span);
    }
  }

  // ---------- 觸控判斷 ----------
  // 手指碰到時若馬上換掉畫面上的內容（提示框、預覽），手機瀏覽器會把這一下當成「滑過」而不觸發點擊，
  // 所以最近一次操作是觸控或觸控筆時，不顯示提示框、不做滑過預覽，點一下直接選取。
  let inputType = 'mouse';
  window.addEventListener('pointerover', (e) => { inputType = e.pointerType || 'mouse'; }, true);
  window.addEventListener('pointerdown', (e) => { inputType = e.pointerType || 'mouse'; }, true);
  window.addEventListener('keydown', () => { inputType = 'keyboard'; }, true);
  const isTouchInput = () => inputType === 'touch' || inputType === 'pen';

  // ---------- 提示框 ----------
  const tip = document.querySelector('.tooltip');
  function tipContent(title, rows, text) {
    tip.replaceChildren();
    const t = document.createElement('div');
    t.className = 'tt-title';
    t.textContent = title;
    tip.append(t);
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tt-row' + (r.focus ? ' is-focus' : '');
      if (r.color) {
        const key = document.createElement('span');
        key.className = 'tt-key';
        key.style.background = r.color;
        row.append(key);
      }
      const v = document.createElement('span');
      v.className = 'tt-value';
      v.textContent = r.value;
      const l = document.createElement('span');
      l.textContent = r.label;
      row.append(v, l);
      tip.append(row);
    }
    if (text) {
      const p = document.createElement('div');
      p.className = 'tt-text';
      p.textContent = text;
      tip.append(p);
    }
  }
  function placeTip(x, y) {
    if (isTouchInput()) return;
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + box.width > window.innerWidth - 8) left = Math.max(8, x - box.width - 14);
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, y - box.height - 14);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function placeTipAt(element) {
    const r = element.getBoundingClientRect();
    placeTip(r.left + r.width / 2, r.top + r.height / 2);
  }
  function hideTip() {
    tip.hidden = true;
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  function activateOnKey(selection, handler) {
    selection.on('keydown', (event, d) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler(event, d);
      }
    });
  }

  // ---------- 跨圖連動 ----------
  // session：點選固定的場次；hover：滑過時暫時預覽的場次，優先於 session。
  const state = { session: null, hover: null, chiangFocus: null };
  const active = () => state.hover ?? state.session;
  const views = [];
  // run(reason)：reason 是 'select' 或 'hover'。滑過預覽時不重畫觸發的那張圖，避免游標下的元素被換掉。
  function registerView(name, run, { hover = true } = {}) {
    views.push({ name, run, hover });
  }
  function setSession(date) {
    state.session = date;
    state.hover = null;
    hideTip();
    views.forEach((v) => v.run('select'));
  }
  function setHover(date, source) {
    if (date != null && isTouchInput()) return;
    if (state.hover === date) return;
    state.hover = date;
    views.filter((v) => v.hover && v.name !== source).forEach((v) => v.run('hover'));
  }
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.HW3 = {
    data, parseDate, formatDate, fmt, md, weekday, shiftDate, wan, byDate, DAYS, dayIndex,
    sessions, sessionByDate, sessionByDistrict, CHIANG_COLOR, CHIANG_SPOTS, CHIANG_NOTES,
    AUTHOR_TYPES, authorTypeOf, authorInfo, ringColor,
    OFFSETS, decay, decayMax, pctAt,
    MAX_SHEN, MAX_CHIANG, shenGlow, shenGlowAll, chiangGlow, chiangGlowAll,
    tipContent, placeTip, placeTipAt, hideTip, activateOnKey, legend, fillLegend, swatchSvg,
    state, active, registerView, setSession, setHover, prefersReducedMotion,
  };
})();
