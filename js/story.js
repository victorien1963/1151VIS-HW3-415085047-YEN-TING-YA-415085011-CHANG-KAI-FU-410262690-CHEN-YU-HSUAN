// 捲動敘事：舞台固定在畫面上，捲到每一段文字時切換舞台上的圖。
(() => {
  const H = window.HW3;
  const stage = document.querySelector('.story-stage');
  if (!stage) return;
  const layerEl = (name) => stage.querySelector(`[data-layer="${name}"]`);

  const map = H.createMap(layerEl('map'), {
    name: 'story-map', interactive: false, controls: true, hud: true, allLit: true,
  });
  const bubbles = H.createBubbles(layerEl('bubbles'), {
    name: 'story-bubbles', grouping: 'map', linked: false, interactive: true,
  });

  // ---------- 對齊圖（敘事版） ----------
  const decayEl = layerEl('decay');
  let decayDrawn = null;
  function drawDecay() {
    const width = decayEl.clientWidth;
    const height = decayEl.clientHeight;
    if (width < 200 || height < 200) return null;
    const narrow = width < 600;
    const m = { top: narrow ? 120 : 96, right: 24, bottom: 48, left: 48 };
    const svg = d3.select(decayEl).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height)
      .attr('role', 'img').attr('aria-label', '6 場車掃對齊到當天：隔天大多還有 7 到 10 成，3 天後剩 2 到 3 成。');
    svg.selectAll('*').remove();
    const x = d3.scaleLinear().domain([-3, 3]).range([m.left, width - m.right]);
    const y = d3.scaleLinear().domain([0, 240]).range([height - m.bottom, m.top]);

    svg.append('text').attr('class', 'stage-title').attr('x', m.left).attr('y', 30).text('把 6 場車掃對齊到「當天＝100%」');
    const legend = svg.append('g').attr('transform', `translate(${m.left},${narrow ? 50 : 56})`);
    H.sessions.forEach((s, i) => {
      const col = narrow ? i % 2 : i % 3;
      const row = narrow ? Math.floor(i / 2) : Math.floor(i / 3);
      const g = legend.append('g').attr('transform', `translate(${col * (narrow ? 150 : 170)},${row * 18})`);
      g.append('line').attr('x2', 14).attr('y1', -4).attr('y2', -4).attr('stroke', s.color).attr('stroke-width', 3);
      g.append('text').attr('class', 'stage-legend').attr('x', 20).text(`${H.md(s.date)} ${s.name}`);
    });

    svg.append('g').attr('class', 'grid').selectAll('line').data([0, 50, 150, 200]).join('line')
      .attr('x1', m.left).attr('x2', width - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('line').attr('class', 'ref-line').attr('x1', m.left).attr('x2', width - m.right).attr('y1', y(100)).attr('y2', y(100));
    svg.append('g').attr('class', 'axis').selectAll('text').data([0, 50, 100, 150, 200]).join('text')
      .attr('x', m.left - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => `${d}%`);
    const LABEL = { '-3': '前3天', '-2': '前2天', '-1': '前1天', 0: '當天', 1: '隔天', 2: '後天', 3: '3天後' };
    svg.append('g').attr('class', 'axis').selectAll('text').data(H.OFFSETS).join('text')
      .attr('x', (d) => x(d)).attr('y', height - m.bottom + 20).attr('text-anchor', 'middle')
      .attr('font-weight', (d) => (d === 0 ? 700 : null)).text((d) => LABEL[d]);

    // 標出文章的結論區間
    const band = (k, lo, hi, text, anchor) => {
      svg.append('rect').attr('class', 'stage-band').attr('x', x(k) - 16).attr('width', 32)
        .attr('y', y(hi)).attr('height', y(lo) - y(hi)).attr('rx', 6);
      svg.append('text').attr('class', 'stage-note').attr('x', anchor === 'end' ? x(k) + 16 : x(k))
        .attr('y', y(hi) - 8).attr('text-anchor', anchor || 'middle').text(text);
    };
    band(1, 72, 108, '隔天：7～10 成');
    band(3, 24, 32, '3 天後：2～3 成', 'end');

    const line = d3.line().x((p) => x(p.k)).y((p) => y(p.pct)).curve(d3.curveMonotoneX);
    const paths = svg.append('g').selectAll('path').data(H.decay.shen).join('path')
      .attr('d', (s) => line(s.points)).attr('fill', 'none')
      .attr('stroke', (s) => (s.date === '2026-10-31' ? '#5b6478' : s.color))
      .attr('stroke-width', (s) => (s.date === '2026-10-31' ? 2 : 3)).attr('stroke-linecap', 'round');
    const debate = H.decay.shen.find((s) => s.date === '2026-10-31');
    const dp = debate.points.find((p) => p.k === 1);
    svg.append('text').attr('class', 'stage-note').attr('x', width - m.right).attr('y', y(dp.pct) - 10)
      .attr('text-anchor', 'end').text('10/31：中午有電視辯論，不列入');
    return { paths };
  }
  function animateDecay() {
    decayDrawn = drawDecay();
    if (!decayDrawn || H.prefersReducedMotion()) return;
    decayDrawn.paths.each(function (d, i) {
      const len = this.getTotalLength();
      d3.select(this).attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
        .transition().delay(i * 180).duration(1100).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0);
    });
  }

  // ---------- 當天 vs 前 3 天（敘事版） ----------
  const liftEl = layerEl('lift');
  function animateLift() {
    const width = liftEl.clientWidth;
    const height = liftEl.clientHeight;
    if (width < 200 || height < 200) return;
    const narrow = width < 600;
    const m = { top: 104, right: narrow ? 110 : 140, bottom: 56, left: narrow ? 20 : 150 };
    const svg = d3.select(liftEl).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height)
      .attr('role', 'img').attr('aria-label', '車掃當天提到沈伯洋的討論是前 3 天的 1.03 到 1.27 倍；10/31 與 11/1 受辯論影響不列入。');
    svg.selectAll('*').remove();
    svg.append('text').attr('class', 'stage-title').attr('x', narrow ? 20 : m.left).attr('y', 30).text('提到沈伯洋的總討論：當天 vs 前 3 天平均');
    svg.append('text').attr('class', 'stage-sub').attr('x', narrow ? 20 : m.left).attr('y', 54).text('空心＝前 3 天平均，實心＝車掃當天（筆／日，四平台合計）');
    svg.append('text').attr('class', 'stage-sub').attr('x', narrow ? 20 : m.left).attr('y', 76).text('橫軸是對數刻度，每格 1.25 倍：倍數相同，線就一樣長');
    // 對數刻度：線長對應「當天 ÷ 前 3 天」的倍數，不受該場原本討論量大小影響。
    const x = d3.scaleLog().domain([6000, 16000]).range([m.left, width - m.right]);
    // 刻度每格固定 1.25 倍（15,625 取整為 15,600），在對數刻度上等距。
    const ticks = narrow ? [6400, 10000, 15600] : [6400, 8000, 10000, 12500, 15600];
    const rowH = (height - m.top - m.bottom) / H.sessions.length;
    svg.append('g').attr('class', 'grid').selectAll('line').data(ticks).join('line')
      .attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', m.top - 10).attr('y2', height - m.bottom);
    svg.append('g').attr('class', 'axis').selectAll('text').data(ticks).join('text')
      .attr('x', (d) => x(d)).attr('y', height - m.bottom + 20).attr('text-anchor', 'middle').text((d) => H.fmt(d));
    const rows = svg.append('g').selectAll('g').data(H.sessions).join('g')
      .attr('transform', (s, i) => `translate(0,${m.top + i * rowH + rowH / 2})`);
    const dy = narrow ? 10 : 0;
    rows.append('text').attr('class', 'stage-legend').attr('x', narrow ? 20 : 12).attr('y', narrow ? -10 : 4)
      .text((s) => `${H.md(s.date)} ${s.name}`);
    const ink = (s) => (s.excluded ? '#5b6478' : s.color);
    const link = rows.append('line').attr('y1', dy).attr('y2', dy).attr('x1', (s) => x(s.prev3)).attr('x2', (s) => x(s.prev3))
      .attr('stroke', ink).attr('stroke-width', 3).attr('opacity', 0.6);
    rows.append('circle').attr('cy', dy).attr('cx', (s) => x(s.prev3)).attr('r', 6)
      .attr('fill', '#0a0f1c').attr('stroke', ink).attr('stroke-width', 2.5);
    const dot = rows.append('circle').attr('cy', dy).attr('cx', (s) => x(s.prev3)).attr('r', 7).attr('fill', ink);
    const ratio = rows.append('text').attr('class', 'stage-ratio').attr('x', width - m.right + 12).attr('y', dy + 5)
      .attr('opacity', 0);
    ratio.append('tspan').text((s) => `${s.ratio.toFixed(2)} 倍`);
    ratio.filter((s) => s.excluded).append('tspan').attr('class', 'stage-sub')
      .attr('x', narrow ? width - m.right + 12 : null).attr('dy', narrow ? 16 : 0)
      .text(narrow ? '不列入' : ' · 不列入');
    const t = H.prefersReducedMotion() ? 0 : 1;
    dot.transition().delay((s, i) => i * 150 * t).duration(900 * t).ease(d3.easeCubicOut).attr('cx', (s) => x(s.day0));
    link.transition().delay((s, i) => i * 150 * t).duration(900 * t).ease(d3.easeCubicOut).attr('x2', (s) => x(s.day0));
    ratio.transition().delay((s, i) => i * 150 * t + 700 * t).duration(400 * t).attr('opacity', (s) => (s.excluded ? 0.6 : 1));
  }

  // ---------- 段落設定 ----------
  const STEPS = [
    () => { show('map'); map.pause(); map.set({ allLit: true, chiang: false, dimShen: false, labels: true }); hud(false); },
    () => { show('map'); map.set({ allLit: false, chiang: false, dimShen: false, labels: true }); hud(true); map.play(true); },
    () => { stopMap(); show('decay'); animateDecay(); },
    () => { stopMap(); show('lift'); animateLift(); },
    () => { stopMap(); show('bubbles'); if (bubbles.grouping !== 'map') bubbles.setGrouping('map'); bubbles.burst(); },
    () => { stopMap(); show('bubbles'); bubbles.setGrouping('type'); },
    () => { show('map'); map.pause(); map.set({ allLit: true, allLitChiang: true, chiang: true, dimShen: true, labels: true }); hud(false); },
    () => { show('map'); map.pause(); map.set({ allLit: true, allLitChiang: true, chiang: true, dimShen: false, labels: true }); hud(false); },
  ];
  function show(name) {
    stage.querySelectorAll('[data-layer]').forEach((l) => l.classList.toggle('is-on', l.dataset.layer === name));
  }
  function hud(on) {
    stage.classList.toggle('hud-on', on);
  }
  function stopMap() {
    map.pause();
    hud(false);
  }

  let current = -1;
  const steps = [...document.querySelectorAll('.story-step')];
  const go = (i) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    STEPS[i]();
  };
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) go(steps.indexOf(e.target));
    }
  }, {
    // 手機上文字卡疊在圖的下方，等卡片進到畫面下段才切換；桌機則在畫面中線切換
    rootMargin: window.matchMedia('(max-width: 760px)').matches ? '-62% 0px -8% 0px' : '-45% 0px -45% 0px',
  });
  steps.forEach((s) => observer.observe(s));
  go(0);
  H.storyGo = go;

  // 舞台尺寸改變時，重畫目前段落的靜態圖
  let lastSize = '';
  new ResizeObserver(() => {
    const key = `${stage.clientWidth}x${stage.clientHeight}`;
    if (key === lastSize) return;
    lastSize = key;
    if (current === 2) drawDecay();
    if (current === 3) animateLift();
  }).observe(stage);

  document.querySelector('.replay-btn')?.addEventListener('click', () => map.play(true));
})();
