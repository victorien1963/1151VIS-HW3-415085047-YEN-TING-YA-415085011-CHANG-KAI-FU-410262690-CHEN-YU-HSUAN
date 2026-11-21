// 「自由探索」區：地圖＋詳細資料卡、泡泡圖、每日總覽、對齊圖、當天 vs 前 3 天，全部雙向連動。
(() => {
  const H = window.HW3;
  const { fmt, md, weekday, byDate, parseDate, formatDate, shiftDate } = H;
  const data = H.data;

  const OFFSET_LABEL = { '-3': '前3天', '-2': '前2天', '-1': '前1天', 0: '當天', 1: '隔天', 2: '後天', 3: '3天後' };
  const OFFSET_SHORT = { '-3': '-3', '-2': '-2', '-1': '-1', 0: '當天', 1: '+1', 2: '+2', 3: '+3' };
  const MUTED = '#5b6478';

  function freshSvg(el, width, height, label) {
    const svg = d3.select(el).selectAll('svg').data([null]).join('svg');
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height)
      .attr('role', 'img').attr('aria-label', label);
    return svg;
  }
  const toggleSession = (date) => H.setSession(date === H.state.session ? null : date);

  // ---------- 橫軸縮放（圖 4、圖 5） ----------
  // 游標在圖上滾動滾輪（或觸控板兩指開合）縮放橫軸；放大後可以左右拖曳。
  // 已經縮到原寬還往外縮、或放到最大還往內放時，不攔下滾輪，讓網頁照常捲動，捲動才不會一直卡在圖上。
  // 選場次、滑過預覽時圖會整張重畫，但 svg 元素沿用（freshSvg），縮放狀態留在元素上，重畫時再套用一次；圖寬改變就還原。
  // maxK：最多放大幾倍。圖 4 橫軸只有 7 天，放大超過 3 倍就看不到兩天以上，所以上限比圖 5 低。
  function attachXZoom(svg, x0, x1, height, apply, maxK = 8) {
    const node = svg.node();
    const zoom = d3.zoom()
      .scaleExtent([1, maxK])
      .extent([[x0, 0], [x1, height]])
      .translateExtent([[x0, 0], [x1, height]])
      // 觸控板兩指開合送出的 deltaY 很小（瀏覽器會當成按住 Ctrl 的滾輪），所以乘得比一般滾輪多。
      .wheelDelta((event) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002)
        * (event.ctrlKey || event.metaKey ? 3 : 1.5))
      .filter((event) => {
        if (event.type === 'wheel') {
          const k = d3.zoomTransform(node).k;
          if (event.deltaY > 0 && k <= 1.001) return false;
          if (event.deltaY < 0 && k >= maxK - 0.001) return false;
          return true;
        }
        if (event.type === 'dblclick') return false;
        return !event.button && d3.zoomTransform(node).k > 1;
      })
      .on('zoom', (event) => {
        apply(event.transform);
        updateZoomButtons();
      });
    svg.call(zoom);
    // 縮到極限時 d3 不處理滾輪；如果這時按著 Ctrl（觸控板兩指開合也算），瀏覽器會改成縮放整個網頁，所以在圖上一律攔下。
    svg.on('wheel.block', (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    }, { passive: false });
    node.xZoom = zoom;
    const widthKey = `${x0},${x1}`;
    if (node.getAttribute('data-zoom-extent') !== widthKey) {
      node.setAttribute('data-zoom-extent', widthKey);
      svg.call(zoom.transform, d3.zoomIdentity);
    } else {
      apply(d3.zoomTransform(node));
    }
    updateZoomButtons();
  }
  function updateZoomButtons() {
    for (const b of document.querySelectorAll('.zoom-reset')) {
      const svgs = [...b.closest('.panel').querySelectorAll('.chart > svg')];
      b.disabled = !svgs.some((s) => d3.zoomTransform(s).k > 1.001);
    }
  }
  for (const b of document.querySelectorAll('.zoom-reset')) {
    b.addEventListener('click', () => {
      for (const s of b.closest('.panel').querySelectorAll('.chart > svg')) {
        if (s.xZoom) d3.select(s).transition().duration(300).call(s.xZoom.transform, d3.zoomIdentity);
      }
    });
  }

  // ---------- 地圖＋詳細資料卡 ----------
  const exploreMap = H.createMap(document.querySelector('[data-chart="map"]'), {
    name: 'map', interactive: true, controls: true, hud: true, chiang: true,
    // 手機（寬度不到 500）扣掉上方日期／亮度條和下方時間軸後，地圖本身還要夠大，區名標籤才不會擠在一起
    height: (w) => {
      if (w < 500) return Math.round(w * 1.15 + 190);
      if (w < 600) return Math.round(w * 1.15);
      return Math.min(620, Math.round(w * 0.95));
    },
  });
  H.registerView('map', (reason) => {
    if (reason === 'select' && H.state.session) exploreMap.setDay(H.dayIndex.get(H.state.session));
    else exploreMap.update();
  });

  const detail = document.querySelector('.detail-card');
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function renderDetail() {
    const s = H.sessionByDate.get(H.active());
    detail.replaceChildren();
    if (!s) {
      detail.style.setProperty('--accent', 'transparent');
      detail.classList.add('is-empty');
      detail.append(el('p', 'detail-empty', '點地圖上的區塊、上方的場次按鈕，或下面任一張圖，看那一場車掃的細節。按「播放」看 10/1 到 11/16 每天的熱度怎麼流過台北。'));
      return;
    }
    detail.classList.remove('is-empty');
    detail.style.setProperty('--accent', s.color);
    detail.append(el('p', 'detail-kicker', `第 ${s.no} 場車掃`));
    detail.append(el('h3', 'detail-title', `${md(s.date)}（${s.weekday}）${s.name}`));
    const pct = (k) => {
      const v = H.pctAt(H.decay.shen, s.date, k);
      return v == null ? '—' : `${Math.round(v)}%`;
    };
    const stats = el('div', 'detail-stats');
    [
      [`${fmt(s.street)}`, '當天掃街相關討論（筆）'],
      [pct(1), '隔天（相對當天）'],
      [pct(3), '3 天後（相對當天）'],
      [`${s.ratio.toFixed(2)} 倍`, s.excluded ? '當天 vs 前 3 天（不列入比較）' : '當天 vs 前 3 天'],
    ].forEach(([v, l]) => {
      const box = el('div', 'stat');
      box.append(el('span', 'stat-value', v), el('span', 'stat-label', l));
      stats.append(box);
    });
    detail.append(stats);
    const dl = el('dl', 'detail-list');
    const item = (k, v) => {
      if (!v) return;
      dl.append(el('dt', null, k), el('dd', null, v));
    };
    item('路線與同行者', s.route);
    item('網路上被記住的畫面', s.scene);
    item('當天與隔天的高頻詞', s.keywords);
    if (s.excluded) item('注意', `${s.excludeReason}。`);
    detail.append(dl);
    detail.append(el('p', 'detail-sub', '這場互動最高的貼文'));
    const list = el('ol', 'detail-posts');
    for (const p of [...s.posts].sort((a, b) => b.interactions - a.interactions)) {
      const li = el('li');
      const a = el('a', null, `${p.author}（${p.label}）`);
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(el('strong', null, `${p.interactionsLabel} `), a, el('span', 'detail-post-text', `　${p.content}`));
      list.append(li);
    }
    detail.append(list);
  }
  H.registerView('detail', renderDetail);

  // ---------- 泡泡圖 ----------
  // 台北地圖的高寬比（等寬投影後的外框）
  const TAIPEI_ASPECT = (() => {
    const [[x0, y0], [x1, y1]] = d3.geoPath(H.fitProjection(1000, 100000, { top: 0, right: 0, bottom: 0, left: 0 })).bounds(H.GEO);
    return (y1 - y0) / (x1 - x0);
  })();
  const bubbleHeadline = document.querySelector('.bubble-headline');
  const inspect = document.querySelector('.inspect');
  let inspected = false; // 圖 2 下方是否正在顯示某篇貼文
  const bubbles = H.createBubbles(document.querySelector('[data-chart="bubbles"]'), {
    name: 'bubbles', grouping: 'map', headline: bubbleHeadline, legend: 'before',
    // 手機上「依地圖」的高度照台北的長寬比算，不留上下空白；「依發文者類型」只有兩列，也不用太高
    height: (w, grouping) => {
      if (w >= 600) return 560;
      if (grouping === 'map') return Math.round((w - 32) * TAIPEI_ASPECT + 40);
      return grouping === 'type' ? 520 : 640;
    },
    onPick: (post) => {
      if (post.candidate === 'shen' && post.date !== H.state.session) H.setSession(post.date);
      inspectPost(post);
    },
  });
  H.registerView('bubbles', () => bubbles.highlight());
  for (const b of document.querySelectorAll('.grouping button')) {
    b.addEventListener('click', () => {
      bubbles.setGrouping(b.dataset.grouping);
      document.querySelectorAll('.grouping button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  function inspectPost(post) {
    inspected = true;
    inspect.replaceChildren();
    inspect.style.borderLeftColor = H.ringColor(post);
    const meta = post.candidate === 'shen'
      ? `沈伯洋 ${md(post.date)} ${post.session} 車掃`
      : `蔣萬安掃街期間，${md(post.date)} 發文`;
    inspect.append(
      el('span', 'value', `${post.interactions == null ? '未顯示互動數' : `${post.interactionsLabel} 次互動`}　`),
      el('strong', null, `${post.author}（${post.label}）`),
      el('span', 'meta', `${meta} · ${post.platform === 'threads' ? 'Threads' : 'Facebook'}${post.small ? ' · 追蹤者不到 600 人' : ''}`),
      el('div', null, post.content),
    );
    const link = el('a', null, '開啟原貼文');
    link.href = post.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    inspect.append(link);
    updateClearButtons();
  }
  function resetInspect() {
    inspected = false;
    inspect.replaceChildren();
    inspect.style.borderLeftColor = '';
    inspect.textContent = '點任一顆泡泡，看貼文內容和原文連結；點沈伯洋的貼文也會切到那一場。';
  }
  resetInspect();

  // ---------- 每日總覽 ----------
  function drawOverview(elm) {
    const width = elm.clientWidth;
    const height = width < 520 ? 230 : 270;
    const m = { top: 40, right: 16, bottom: 28, left: 44 };
    const svg = freshSvg(elm, width, height, '沈伯洋掃街相關貼文每日筆數，10 月 1 日到 11 月 16 日，6 場車掃當天都是高峰，11 月 15 日 1,283 筆最多。');
    const x = d3.scaleUtc().domain([parseDate('2026-10-01'), parseDate('2026-11-16')]).range([m.left, width - m.right]);
    const y = d3.scaleLinear().domain([0, 1400]).range([height - m.bottom, m.top]);
    const focus = H.active();

    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.left).attr('x2', width - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('g').attr('class', 'axis').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', m.left - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => fmt(d));
    svg.append('text').attr('class', 'axis-title').attr('x', m.left - 6).attr('y', m.top - 24).attr('text-anchor', 'end').text('筆／日');
    const step = width < 520 ? 14 : 7;
    const ticks = d3.range(0, 47, step).map((n) => parseDate(shiftDate('2026-10-01', n)));
    svg.append('g').attr('class', 'axis').selectAll('text').data(ticks).join('text')
      .attr('x', (d) => x(d)).attr('y', height - m.bottom + 16).attr('text-anchor', 'middle').text((d) => md(formatDate(d)));
    const debate = parseDate('2026-10-31');
    svg.append('line').attr('class', 'ref-line').attr('x1', x(debate)).attr('x2', x(debate)).attr('y1', m.top - 6).attr('y2', y(0));
    svg.append('text').attr('class', 'label-sub').attr('x', x(debate) - 4).attr('y', m.top - 10).attr('text-anchor', 'end').text('10/31 首場電視辯論');

    // 線段依「最近一場車掃」上色，和地圖的洋流同一套顏色
    const segs = data.daily.slice(1).map((d, i) => {
      const prev = data.daily[i];
      const cur = [...H.sessions].reverse().find((s) => s.date <= d.date);
      return { a: prev, b: d, session: cur };
    });
    svg.append('g').selectAll('line').data(segs).join('line')
      .attr('x1', (s) => x(parseDate(s.a.date))).attr('y1', (s) => y(s.a.shen))
      .attr('x2', (s) => x(parseDate(s.b.date))).attr('y2', (s) => y(s.b.shen))
      .attr('stroke', (s) => (s.session ? s.session.color : MUTED)).attr('stroke-width', 2).attr('stroke-linecap', 'round')
      .attr('opacity', (s) => (!focus || (s.session && s.session.date === focus) ? 1 : 0.3));

    const cross = svg.append('g').attr('pointer-events', 'none').attr('visibility', 'hidden');
    cross.append('line').attr('class', 'ref-line').attr('y1', m.top - 6).attr('y2', y(0));
    cross.append('circle').attr('r', 4).attr('fill', '#ffffff');
    const dayTip = (row) => {
      const extra = [row.shenCampaign ? `車掃：${row.shenCampaign}` : '', row.note].filter(Boolean).join('；');
      H.tipContent(`${md(row.date)}（${weekday(row.date)}）沈伯洋掃街相關貼文`,
        [{ value: `${fmt(row.shen)} 筆`, label: row.shenExact ? '（文中數字）' : '（原圖讀出的估計值）' }], extra);
    };
    svg.append('rect').attr('x', m.left).attr('y', m.top - 6).attr('width', width - m.left - m.right)
      .attr('height', y(0) - m.top + 6).attr('fill', 'transparent')
      .on('pointermove', (event) => {
        const [px] = d3.pointer(event);
        const day = d3.utcDay.round(x.invert(px));
        const row = byDate.get(formatDate(day));
        if (!row) return;
        cross.attr('visibility', 'visible');
        cross.select('line').attr('x1', x(day)).attr('x2', x(day));
        cross.select('circle').attr('cx', x(day)).attr('cy', y(row.shen));
        dayTip(row);
        H.placeTip(event.clientX, event.clientY);
        H.setHover(row.shenCampaign ? row.date : null, 'overview');
      })
      .on('pointerleave', () => {
        cross.attr('visibility', 'hidden');
        H.hideTip();
        H.setHover(null, 'overview');
      });

    const markers = svg.append('g').selectAll('g').data(H.sessions).join('g')
      .attr('role', 'button').attr('tabindex', 0)
      .attr('aria-pressed', (s) => String(s.date === H.state.session))
      .attr('aria-label', (s) => `${md(s.date)} ${s.name} 車掃當天，${fmt(s.street)} 筆。選取這一場`)
      .attr('transform', (s) => `translate(${x(parseDate(s.date))},${y(s.street)})`)
      .attr('opacity', (s) => (!focus || s.date === focus ? 1 : 0.4));
    markers.append('circle').attr('r', 13).attr('fill', 'transparent');
    markers.append('circle').attr('class', 'marker-dot').attr('r', (s) => (s.date === focus ? 7 : 5))
      .attr('fill', (s) => s.color).attr('stroke', 'var(--surface-1)').attr('stroke-width', 2);
    markers.filter((s) => s.date === H.state.session).append('circle').attr('r', 10.5)
      .attr('fill', 'none').attr('stroke', '#ffffff').attr('stroke-width', 1.5);
    markers.on('click', (event, s) => toggleSession(s.date))
      .on('pointerenter focus', (event, s) => {
        dayTip(byDate.get(s.date));
        if (event.type === 'focus') H.placeTipAt(event.currentTarget);
        else H.placeTip(event.clientX, event.clientY);
        H.setHover(s.date, 'overview');
      })
      .on('pointerleave blur', () => {
        H.hideTip();
        H.setHover(null, 'overview');
      });
    H.activateOnKey(markers, (event, s) => toggleSession(s.date));

    const selected = H.sessionByDate.get(focus);
    if (selected) {
      const sx = x(parseDate(selected.date));
      const sy = y(selected.street);
      const anchor = sx > width - 90 ? 'end' : sx < m.left + 60 ? 'start' : 'middle';
      svg.append('text').attr('class', 'label').attr('font-weight', 700)
        .attr('x', anchor === 'end' ? sx + 6 : sx).attr('y', sy - 16).attr('text-anchor', anchor)
        .text(`${md(selected.date)} ${selected.name} ${fmt(selected.street)} 筆`);
    }
  }

  // ---------- 對齊掃街日 ----------
  function readoutText(candidate, focus) {
    if (!focus) {
      return candidate === 'shen'
        ? '多數場次隔天還有當天的 7 到 10 成，後天剩 2 到 5 成，3 天後剩 2 到 3 成。滑過或點線條看各場。'
        : '多數場次隔天和當天差不多（0.97～1.2 倍）；10/27 內湖 737 夜市與 11/6 遼寧夜市隔天反而變多。滑過或點線條看各場。';
    }
    const pct = (k) => {
      const p = focus.points.find((q) => q.k === k);
      return p ? `${Math.round(p.pct)}%` : '—';
    };
    const head = `${md(focus.date)}（${weekday(focus.date)}）${focus.name}：當天 ${fmt(focus.base)} 筆，隔天 ${pct(1)}、後天 ${pct(2)}、3 天後 ${pct(3)}。`;
    if (candidate === 'shen') {
      const s = H.sessionByDate.get(focus.date);
      return head + (s.excluded ? `${s.excludeReason}。` : '');
    }
    return head + (H.CHIANG_NOTES[focus.date] || '');
  }
  function ensureReadout(elm) {
    let p = elm.parentNode.querySelector('.readout');
    if (!p) {
      p = document.createElement('p');
      p.className = 'readout';
      p.setAttribute('aria-live', 'polite');
      elm.after(p);
    }
    return p;
  }

  function drawDecay(elm, candidate) {
    const series = H.decay[candidate];
    const width = elm.clientWidth;
    const height = 250;
    const m = { top: 12, right: 14, bottom: 34, left: 42 };
    const label = candidate === 'shen'
      ? '沈伯洋 6 場車掃，以當天為 100%，隔天大多剩 7 到 10 成，3 天後剩 2 到 3 成。'
      : '蔣萬安 7 場掃街，以當天為 100%，多數隔天和當天差不多，10/27 與 11/6 兩場隔天變成 2.7 倍與 2.5 倍。';
    const svg = freshSvg(elm, width, height, `${label} 按左右鍵切換場次。`).attr('tabindex', 0);
    const x = d3.scaleLinear().domain([-3, 3]).range([m.left, width - m.right]);
    const y = d3.scaleLinear().domain([0, Math.max(300, Math.ceil(H.decayMax / 50) * 50)]).range([height - m.bottom, m.top]);
    const yTicks = y.ticks(4);
    svg.append('g').attr('class', 'grid').selectAll('line').data(yTicks.filter((v) => v !== 100)).join('line')
      .attr('x1', m.left).attr('x2', width - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('line').attr('class', 'ref-line').attr('x1', m.left).attr('x2', width - m.right).attr('y1', y(100)).attr('y2', y(100));
    svg.append('g').attr('class', 'axis').selectAll('text').data(yTicks).join('text')
      .attr('x', m.left - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => `${d}%`);
    const short = width - m.left - m.right < 300;
    // xs：目前縮放後的橫軸（沒縮放時就是 x）
    let xs = x;
    const xLabels = svg.append('g').attr('class', 'axis').selectAll('text').data(H.OFFSETS).join('text')
      .attr('x', (d) => x(d)).attr('y', height - m.bottom + 16).attr('text-anchor', 'middle')
      .attr('font-weight', (d) => (d === 0 ? 700 : null)).text((d) => (short ? OFFSET_SHORT[d] : OFFSET_LABEL[d]));
    const clipId = `clip-decay-${candidate}`;
    svg.append('defs').append('clipPath').attr('id', clipId)
      .append('rect').attr('x', m.left - 4).attr('y', 0).attr('width', width - m.left - m.right + 8).attr('height', height);
    if (short) {
      svg.append('text').attr('class', 'axis-title').attr('x', width - m.right).attr('y', height - 2)
        .attr('text-anchor', 'end').text('相對掃街日的天數');
    }
    const line = d3.line().x((p) => xs(p.k)).y((p) => y(p.pct));
    const plot = svg.append('g').attr('clip-path', `url(#${clipId})`);
    const paths = plot.append('g').selectAll('path').data(series, (s) => s.date).join('path')
      .attr('d', (s) => line(s.points)).attr('fill', 'none').attr('stroke', (s) => s.color)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const dots = plot.append('g').attr('pointer-events', 'none');
    const cross = svg.append('line').attr('class', 'ref-line').attr('pointer-events', 'none')
      .attr('y1', m.top).attr('y2', y(0)).attr('visibility', 'hidden');
    const readout = ensureReadout(elm);
    const selectedDate = () => (candidate === 'shen' ? H.active() : H.state.chiangFocus);

    let painted = null;
    function paint(focusDate) {
      painted = focusDate;
      paths.attr('stroke-width', (s) => (s.date === focusDate ? 3 : 2))
        .attr('stroke-opacity', (s) => (focusDate == null ? 0.85 : s.date === focusDate ? 1 : 0.22));
      paths.filter((s) => s.date === focusDate).raise();
      const focus = series.find((s) => s.date === focusDate);
      dots.selectAll('circle').data(focus ? focus.points : []).join('circle')
        .attr('cx', (p) => xs(p.k)).attr('cy', (p) => y(p.pct)).attr('r', 4)
        .attr('fill', focus ? focus.color : 'none').attr('stroke', 'var(--surface-1)').attr('stroke-width', 2);
      readout.textContent = readoutText(candidate, focus);
    }
    paint(selectedDate());

    const valueAt = (s, k) => s.points.find((p) => p.k === k);
    function showOffset(k, focusDate, clientX, clientY) {
      const rows = series.filter((s) => valueAt(s, k)).map((s) => {
        const p = valueAt(s, k);
        return {
          value: `${Math.round(p.pct)}%`,
          label: `${md(s.date)} ${s.name}（${fmt(p.value)} 筆）${s.excluded ? '・受辯論影響' : ''}`,
          color: s.color, focus: s.date === focusDate, pct: p.pct,
        };
      }).sort((a, b) => b.pct - a.pct);
      H.tipContent(`${OFFSET_LABEL[k]}，相對當天的筆數`, rows);
      H.placeTip(clientX, clientY);
    }

    let hovered = null;
    svg.append('rect').attr('x', m.left - 10).attr('y', m.top).attr('width', width - m.left - m.right + 20)
      .attr('height', y(0) - m.top).attr('fill', 'transparent').style('cursor', 'pointer')
      .on('pointermove', (event) => {
        const [px, py] = d3.pointer(event);
        // 只在目前看得到的天數之間找最近的一天
        const [d0, d1] = xs.domain();
        const kMin = Math.max(-3, Math.ceil(d0 - 1e-9));
        const kMax = Math.min(3, Math.floor(d1 + 1e-9));
        if (kMin > kMax) return;
        const k = Math.max(kMin, Math.min(kMax, Math.round(xs.invert(px))));
        const nearest = d3.least(series.filter((s) => valueAt(s, k)), (s) => Math.abs(y(valueAt(s, k).pct) - py));
        hovered = nearest ? nearest.date : null;
        if (candidate === 'shen') H.setHover(hovered, 'decay-shen');
        paint(hovered);
        cross.attr('visibility', 'visible').attr('x1', xs(k)).attr('x2', xs(k));
        showOffset(k, hovered, event.clientX, event.clientY);
      })
      .on('pointerleave', () => {
        hovered = null;
        cross.attr('visibility', 'hidden');
        if (candidate === 'shen') H.setHover(null, 'decay-shen');
        paint(selectedDate());
        H.hideTip();
      })
      .on('click', () => {
        if (!hovered) return;
        if (candidate === 'shen') H.setSession(hovered);
        else {
          H.state.chiangFocus = hovered;
          drawDecay(elm, candidate);
          updateClearButtons();
        }
      });
    svg.on('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dates = series.map((s) => s.date);
      const current = dates.indexOf(selectedDate());
      const next = event.key === 'ArrowRight'
        ? dates[(current + 1) % dates.length]
        : dates[(current - 1 + dates.length) % dates.length];
      if (candidate === 'shen') H.setSession(next);
      else {
        H.state.chiangFocus = next;
        drawDecay(elm, candidate);
        updateClearButtons();
      }
      const node = elm.querySelector('svg');
      node.focus();
      showOffset(1, next, node.getBoundingClientRect().left + 40, node.getBoundingClientRect().top + 20);
    });
    svg.on('blur', H.hideTip);

    attachXZoom(svg, m.left, width - m.right, height, (t) => {
      xs = t.rescaleX(x);
      paths.attr('d', (s) => line(s.points));
      paint(painted);
      cross.attr('visibility', 'hidden');
      xLabels.attr('x', (d) => xs(d))
        .attr('display', (d) => (xs(d) < m.left - 6 || xs(d) > width - m.right + 6 ? 'none' : null));
    }, 3);
  }

  // ---------- 當天 vs 前 3 天 ----------
  function drawLift(elm) {
    const rows = H.sessions;
    const width = elm.clientWidth;
    const narrow = width < 520;
    const rowH = narrow ? 54 : 38;
    const dotY = narrow ? 10 : 0;
    const m = { top: 6, right: narrow ? 92 : 110, bottom: 40, left: narrow ? 14 : 150 };
    const height = m.top + rows.length * rowH + m.bottom;
    const focus = H.active();
    const svg = freshSvg(elm, width, height, '6 場車掃當天與前 3 天平均的比較：可比較的 4 場是 1.03 到 1.27 倍，11/15 士林北投最多。10/31 與 11/1 受辯論影響，不列入比較。');
    // 對數刻度：線長對應「當天 ÷ 前 3 天」的倍數，不受該場原本討論量大小影響。
    const x = d3.scaleLog().domain([6000, 16000]).range([m.left, width - m.right]);
    const y = (i) => m.top + i * rowH + rowH / 2;
    // 刻度從 6,400 起每格固定 1.25 倍（標籤取整到百位，15,625 顯示為 15,600），在對數刻度上等距。
    // 放大 2 倍以上時每格改成 1.25 的平方根、四次方根……，仍是等比刻度。
    function liftTicks(xs, k) {
      const level = Math.max(0, Math.floor(Math.log2(k) + 1e-9));
      const step = 1.25 ** (1 / 2 ** level);
      const [d0, d1] = xs.domain();
      const n0 = Math.ceil(Math.log(d0 / 6400) / Math.log(step) - 1e-9);
      const n1 = Math.floor(Math.log(d1 / 6400) / Math.log(step) + 1e-9);
      // 窄螢幕隔一格標一個，所以標出來的刻度之間是 step 的平方
      const vals = d3.range(n0, n1 + 1).filter((n) => !narrow || n % 2 === 0).map((n) => 6400 * step ** n);
      return { vals, step: narrow ? step * step : step };
    }
    const gGrid = svg.append('g').attr('class', 'grid');
    const gTicks = svg.append('g').attr('class', 'axis');
    const axisTitle = svg.append('text').attr('class', 'axis-title').attr('x', width - m.right).attr('y', height - 4)
      .attr('text-anchor', 'end');
    const clipId = 'clip-lift';
    svg.append('defs').append('clipPath').attr('id', clipId)
      .append('rect').attr('x', m.left - 8).attr('y', -rowH / 2).attr('width', width - m.left - m.right + 16).attr('height', rowH);
    const row = svg.append('g').selectAll('g').data(rows).join('g')
      .attr('class', 'lift-row')
      .attr('transform', (d, i) => `translate(0,${y(i)})`)
      .attr('role', 'button').attr('tabindex', 0)
      .attr('aria-pressed', (d) => String(d.date === H.state.session))
      .attr('aria-label', (d) => `${md(d.date)} ${d.name}：前 3 天平均約 ${fmt(d.prev3)} 筆，當天約 ${fmt(d.day0)} 筆，${d.ratio.toFixed(2)} 倍${d.excluded ? `，${d.excludeReason}` : ''}`);
    row.append('rect').attr('x', 0).attr('y', -rowH / 2 + 2).attr('width', width).attr('height', rowH - 4).attr('rx', 6)
      .attr('fill', (d) => (d.date === focus ? 'var(--wash)' : 'transparent'));
    row.append('circle').attr('cx', 12).attr('cy', narrow ? -14 : 0).attr('r', 5).attr('fill', (d) => d.color);
    row.append('text').attr('class', 'label').attr('x', 24).attr('y', narrow ? -10 : 4)
      .attr('font-weight', (d) => (d.date === focus ? 700 : 400)).text((d) => `${md(d.date)} ${d.name}`);
    // 受辯論影響的兩場也用場次色（和其他圖一致），但線畫得比較淡，當天點加黑色星號。
    // 點和線放在裁切區裡，放大後超出橫軸範圍的部分不會蓋到左右的文字。
    const marks = row.append('g').attr('clip-path', `url(#${clipId})`);
    const link = marks.append('line').attr('y1', dotY).attr('y2', dotY)
      .attr('stroke', (d) => d.color).attr('stroke-width', 2).attr('opacity', (d) => (d.excluded ? 0.3 : 0.6));
    const prevDot = marks.append('circle').attr('cy', dotY).attr('r', 5)
      .attr('fill', 'var(--surface-1)').attr('stroke', (d) => d.color).attr('stroke-width', 2);
    const dayDot = marks.append('circle').attr('cy', dotY).attr('r', 5.5)
      .attr('fill', (d) => d.color).attr('stroke', 'var(--surface-1)').attr('stroke-width', 2);
    const star = marks.filter((d) => d.excluded).append('path')
      .attr('stroke', H.STAR_INK).attr('stroke-width', 1.4).attr('stroke-linecap', 'round').attr('pointer-events', 'none');
    row.append('text').attr('class', (d) => (d.excluded ? 'label-sub' : 'label'))
      .attr('x', width - m.right + 10).attr('y', dotY + 4).attr('font-weight', (d) => (d.excluded ? 400 : 700))
      .text((d) => `${d.ratio.toFixed(2)} 倍${d.excluded ? ' · 不列入' : ''}`);
    row.attr('opacity', (d) => (!focus || d.date === focus ? 1 : 0.5));

    const rowTip = (d) => H.tipContent(`${md(d.date)}（${d.weekday}）${d.name}`, [
      { value: `≈${fmt(d.prev3)} 筆`, label: '前 3 天平均' },
      { value: `≈${fmt(d.day0)} 筆`, label: '車掃當天', color: d.color },
      { value: `${d.ratio.toFixed(2)} 倍`, label: '（原圖標示）' },
    ], d.excluded ? `不列入比較：${d.excludeReason}。` : '');
    row.on('click', (event, d) => toggleSession(d.date))
      .on('pointermove', (event, d) => {
        rowTip(d);
        H.placeTip(event.clientX, event.clientY);
        H.setHover(d.date, 'lift');
      })
      .on('focus', (event, d) => {
        rowTip(d);
        H.placeTipAt(event.currentTarget);
        H.setHover(d.date, 'lift');
      })
      .on('pointerleave blur', () => {
        H.hideTip();
        H.setHover(null, 'lift');
      });
    H.activateOnKey(row, (event, d) => toggleSession(d.date));

    attachXZoom(svg, m.left, width - m.right, height, (t) => {
      const xs = t.rescaleX(x);
      const { vals, step } = liftTicks(xs, t.k);
      gGrid.selectAll('line').data(vals).join('line')
        .attr('x1', (d) => xs(d)).attr('x2', (d) => xs(d)).attr('y1', m.top).attr('y2', height - m.bottom);
      gTicks.selectAll('text').data(vals).join('text')
        .attr('x', (d) => xs(d)).attr('y', height - m.bottom + 16).attr('text-anchor', 'middle')
        .text((d) => `${fmt(Math.round(d / 100) * 100)} 筆`);
      const zoomed = t.k > 1.001;
      axisTitle.text(narrow
        ? `筆／日（對數刻度${zoomed ? `，每格 ${step.toFixed(2)} 倍` : ''}）`
        : `提到沈伯洋的討論（筆／日，四平台合計，對數刻度${zoomed ? `；放大中，每格 ${step.toFixed(2)} 倍` : ''}）`);
      link.attr('x1', (d) => xs(d.prev3)).attr('x2', (d) => xs(d.day0));
      prevDot.attr('cx', (d) => xs(d.prev3));
      dayDot.attr('cx', (d) => xs(d.day0));
      star.attr('d', (d) => H.asteriskD(xs(d.day0), dotY, 5.5));
    });
  }

  // ---------- 資料表 ----------
  function buildTables() {
    const box = document.querySelector('.tables');
    const table = (caption, head, rows, numeric) => {
      const t = document.createElement('table');
      t.append(el('caption', null, caption));
      const thead = t.createTHead().insertRow();
      head.forEach((h) => thead.append(el('th', null, h)));
      const body = t.createTBody();
      for (const r of rows) {
        const tr = body.insertRow();
        r.forEach((v, i) => {
          const td = tr.insertCell();
          if (v instanceof Node) td.append(v);
          else td.textContent = v;
          if (numeric.includes(i)) td.className = 'num';
        });
      }
      box.append(t);
    };
    const pct = (series, date, k) => {
      const v = H.pctAt(series, date, k);
      return v == null ? '—' : `${Math.round(v)}%`;
    };
    table('沈伯洋 6 場車掃',
      ['場次', '路線與同行者', '掃街相關（當天）', '隔天', '後天', '3天後', '前3天平均≈', '當天≈', '倍數'],
      H.sessions.map((s) => [`${md(s.date)}（${s.weekday}）${s.name}`, s.route, fmt(s.street),
        pct(H.decay.shen, s.date, 1), pct(H.decay.shen, s.date, 2), pct(H.decay.shen, s.date, 3),
        fmt(s.prev3), fmt(s.day0), `${s.ratio.toFixed(2)}${s.excluded ? '（不列入）' : ''}`]),
      [2, 3, 4, 5, 6, 7, 8]);
    table('蔣萬安 7 場掃街', ['日期', '地點', '掃街相關（當天）', '隔天'],
      data.chiangSessions.map((s) => [`${md(s.date)}（${weekday(s.date)}）`, s.name, fmt(byDate.get(s.date).chiang),
        pct(H.decay.chiang, s.date, 1)]),
      [2, 3]);
    table('熱門貼文', ['候選人', '日期', '發文者', '類型', '內容', '互動數', '連結'],
      data.posts.map((p) => {
        const a = el('a', null, p.platform === 'threads' ? 'Threads' : 'Facebook');
        a.href = p.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return [p.candidate === 'shen' ? '沈伯洋' : '蔣萬安', p.candidate === 'shen' ? `${md(p.date)} ${p.session}` : md(p.date),
          p.author, p.label, p.content, p.interactionsLabel, a];
      }),
      [5]);
  }

  // ---------- 場次按鈕 ----------
  function buildChips() {
    const box = document.querySelector('.chips');
    for (const s of [{ date: null, name: '全部場次' }, ...H.sessions]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.date = s.date || '';
      if (s.date) {
        const dot = el('span', 'chip-dot');
        dot.style.background = s.color;
        b.append(dot, el('small', null, md(s.date)));
      }
      b.append(document.createTextNode(s.name));
      b.addEventListener('click', () => H.setSession(s.date));
      if (s.date) {
        b.addEventListener('pointerenter', () => H.setHover(s.date, 'chips'));
        b.addEventListener('pointerleave', () => H.setHover(null, 'chips'));
      }
      box.append(b);
    }
  }
  function updateChips() {
    for (const b of document.querySelectorAll('.chips button')) {
      b.setAttribute('aria-pressed', String((b.dataset.date || null) === H.state.session));
    }
  }
  H.registerView('chips', updateChips, { hover: false });

  // ---------- 每張圖右上角的「清除選取」 ----------
  // 場次選取是全部圖共用的，所以任何一張圖的按鈕都會清掉全部圖的場次（和「全部場次」一樣）；
  // 圖 2 另外收起下方的貼文內容，圖 4 另外清掉蔣萬安小圖的獨立選取。沒有東西可清時按鈕變暗、不能按。
  const clearButtons = [...document.querySelectorAll('.clear-sel')];
  function updateClearButtons() {
    for (const b of clearButtons) {
      const kind = b.dataset.clear;
      b.disabled = !(H.state.session != null
        || (kind === 'bubbles' && inspected)
        || (kind === 'decay' && H.state.chiangFocus != null));
    }
  }
  for (const b of clearButtons) {
    b.addEventListener('click', () => {
      if (b.dataset.clear === 'bubbles') resetInspect();
      if (b.dataset.clear === 'decay') H.state.chiangFocus = null;
      H.setSession(null);
      updateClearButtons();
    });
  }
  H.registerView('clear-buttons', updateClearButtons, { hover: false });
  updateClearButtons();

  // ---------- 掛上 D3 圖 ----------
  function mount(name, draw) {
    const elm = document.querySelector(`[data-chart="${name}"]`);
    let lastWidth = 0;
    const run = (force) => {
      const w = elm.clientWidth;
      if (w < 200) return;
      if (!force && w === lastWidth) return;
      lastWidth = w;
      draw(elm);
    };
    H.registerView(name, () => run(true));
    new ResizeObserver(() => run(false)).observe(elm);
  }

  // ---------- 圖例 ----------
  const sessionColors = H.sessions.map((s) => s.color);
  H.legend(document.querySelector('[data-chart="map"]'), [
    { type: 'swatches', colors: sessionColors, label: '區塊顏色＝6 場車掃（每場兩區）' },
    { type: 'gradient', id: 'map', color: '#ff8c42', label: '越亮＝那天的掃街相關討論越多（左上角亮度條可對照筆數）' },
    { type: 'outline', label: '白框＝選取中的場次' },
    { type: 'glow-dot', color: H.CHIANG_COLOR, label: '藍色光點＝蔣萬安掃街，越大越亮＝那天討論越多' },
  ]);
  H.legend(document.querySelector('[data-chart="overview"]'), [
    { type: 'lines', colors: sessionColors, label: '線段顏色＝最近一場車掃' },
    { type: 'line', color: MUTED, label: '灰色＝第一場車掃之前' },
    { type: 'dots', colors: sessionColors, label: '圓點＝車掃當天' },
    { type: 'vref', label: '直線＝10/31 首場電視辯論' },
  ]);
  H.legend(document.querySelector('[data-chart="decay-shen"]'), [
    ...H.sessions.map((s) => ({ type: 'line', color: s.color, label: `${md(s.date)} ${s.name}` })),
    { type: 'ref', label: '橫線＝100%（掃街當天）' },
  ]);
  H.legend(document.querySelector('[data-chart="decay-chiang"]'), [
    { type: 'line', color: H.CHIANG_COLOR, label: '藍線＝蔣萬安各場（滑過或點線看是哪一場）' },
    { type: 'ref', label: '橫線＝100%（掃街當天）' },
  ]);
  H.legend(document.querySelector('[data-chart="lift"]'), [
    { type: 'hollow', color: '#e9edf5', label: '空心＝前 3 天平均' },
    { type: 'dot', color: '#e9edf5', label: '實心＝車掃當天' },
    { type: 'dots', colors: sessionColors, label: '顏色＝場次' },
    { type: 'star-dot', color: '#e9edf5', label: '星號＝受辯論影響，不列入（線較淡）' },
    { type: 'line', color: '#aab3c5', label: '線長＝倍數（對數刻度，每格 1.25 倍）' },
  ]);

  buildChips();
  buildTables();
  renderDetail();
  mount('overview', drawOverview);
  mount('decay-shen', (elm) => drawDecay(elm, 'shen'));
  mount('decay-chiang', (elm) => drawDecay(elm, 'chiang'));
  mount('lift', drawLift);
  updateChips();
  document.querySelector('.viz-root').dataset.ready = 'true';
})();
