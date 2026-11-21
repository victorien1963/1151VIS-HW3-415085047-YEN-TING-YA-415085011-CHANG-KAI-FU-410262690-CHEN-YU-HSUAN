// 貼文泡泡力導向圖：每篇熱門貼文一顆泡泡，大小代表互動數；可依地點、發文者類型、場次分群。
(() => {
  const H = window.HW3;
  let uid = 0;

  // 蔣萬安的貼文依發文日歸到「最近一場已發生的掃街地點」；10/27 之前沒有掃街，歸到 737 夜市。
  function chiangSpotFor(date) {
    const spot = [...H.CHIANG_SPOTS].reverse().find((s) => s.date <= date);
    return spot || H.CHIANG_SPOTS[0];
  }

  H.createBubbles = function createBubbles(el, options) {
    const id = `bub${uid++}`;
    const o = {
      grouping: 'map', height: null, name: 'bubbles', onPick: null, headline: null, interactive: true, linked: true, legend: null,
      ...options,
    };
    const wrap = d3.select(el).classed('bubbles-wrap', true);
    const svg = wrap.append('svg').attr('class', 'bubbles-svg').attr('role', 'img');
    // 圖例：explore 放在圖上方；敘事舞台放在圖下方，並從可用高度扣掉圖例的高度。
    let legendBox = null;
    if (o.legend) {
      legendBox = document.createElement('div');
      legendBox.className = 'chart-legend';
      if (o.legend === 'before') el.insertBefore(legendBox, svg.node());
      else el.append(legendBox);
    }
    let rScale = null;
    const defs = svg.append('defs');
    // 原文點名的小帳號（追蹤者不到 600 人）：底色維持發文者類型的填色，加 45° 細斜線。
    const hatchId = (type) => `${id}-hatch-${H.AUTHOR_TYPES.findIndex((t) => t.key === type)}`;
    H.AUTHOR_TYPES.forEach((t) => {
      const pat = defs.append('pattern').attr('id', hatchId(t.key)).attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
      pat.append('rect').attr('width', 5).attr('height', 5).attr('fill', t.fill);
      pat.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 5)
        .attr('stroke', H.HATCH_INK).attr('stroke-width', 1.2);
    });
    const gBack = svg.append('g').attr('class', 'bubble-backdrop').attr('pointer-events', 'none');
    const gLabels = svg.append('g').attr('class', 'bubble-labels').attr('pointer-events', 'none');
    const gNodes = svg.append('g');

    const nodes = H.data.posts.map((p, i) => ({
      i, post: p, type: H.authorTypeOf(p), r: 6, x: 0, y: 0,
      order: p.candidate === 'shen' ? H.sessionByDate.get(p.date).no : 7,
    }));
    let w = 0;
    let h = 0;
    let projection = null;
    let targets = new Map();
    let labels = [];
    // 點擊範圍至少半徑 9，泡泡之間也用這個距離排開，感應圓才不會蓋到旁邊的泡泡。
    const hitR = (d) => Math.max(d.r, 9);

    const sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX((d) => targets.get(d.i)?.[0] ?? w / 2).strength(0.09))
      .force('y', d3.forceY((d) => targets.get(d.i)?.[1] ?? h / 2).strength(0.09))
      .force('collide', d3.forceCollide((d) => hitR(d) + 1.5).iterations(3))
      .alphaDecay(0.035)
      .on('tick', ticked)
      .stop();

    const nodeSel = gNodes.selectAll('g.bubble').data(nodes, (d) => d.i).join((enter) => {
      const g = enter.append('g').attr('class', 'bubble');
      // 感應圓：透明但會接收點擊，讓虛線（沒有填色）和很小的泡泡也點得到。
      g.append('circle').attr('class', 'bubble-hit').attr('fill', 'transparent');
      g.append('circle').attr('class', 'bubble-body');
      return g;
    });
    nodeSel.select('.bubble-body')
      .attr('fill', (d) => {
        if (d.post.interactions == null) return 'none';
        return d.post.small ? `url(#${hatchId(d.type)})` : H.authorInfo(d.type).fill;
      })
      .attr('stroke', (d) => H.ringColor(d.post))
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', (d) => (d.post.interactions == null ? '3 3' : null));

    if (o.interactive) {
      nodeSel.attr('role', 'button').attr('tabindex', 0)
        .attr('aria-label', (d) => `${d.post.author}（${d.post.label}），${d.post.interactionsLabel} 次互動：${d.post.content}`)
        .style('cursor', 'pointer')
        .on('pointerenter focus', (event, d) => {
          postTip(d);
          if (event.type === 'focus') H.placeTipAt(event.currentTarget);
          else H.placeTip(event.clientX, event.clientY);
          if (o.linked && d.post.candidate === 'shen') H.setHover(d.post.date, o.name);
          highlight(d);
        })
        .on('pointermove', (event) => H.placeTip(event.clientX, event.clientY))
        .on('pointerleave blur', () => {
          H.hideTip();
          if (o.linked) H.setHover(null, o.name);
          highlight();
        })
        .on('click', (event, d) => o.onPick && o.onPick(d.post));
      H.activateOnKey(nodeSel, (event, d) => o.onPick && o.onPick(d.post));
    }

    function postTip(d) {
      const p = d.post;
      const where = p.candidate === 'shen'
        ? `沈伯洋 ${H.md(p.date)} ${p.session}`
        : `蔣萬安掃街期間 ${H.md(p.date)} 發文`;
      H.tipContent(`${p.author}（${p.label}）`, [
        { value: p.interactions == null ? '未顯示' : `${p.interactionsLabel} 次互動`, label: p.small ? '・追蹤者不到 600 人' : '', color: H.ringColor(p) },
      ], `${where}：${p.content}`);
    }

    function size() {
      w = el.clientWidth;
      h = o.height ? o.height(w, o.grouping) : el.clientHeight - (legendBox && o.legend !== 'before' ? legendBox.offsetHeight + 4 : 0);
    }

    function radii() {
      const narrow = w < 600;
      const maxR = o.grouping === 'map' ? (narrow ? 22 : 34) : (narrow ? 26 : Math.min(48, w / 16));
      const scale = d3.scaleSqrt().domain([0, 136000]).range([0, maxR]);
      rScale = scale;
      for (const d of nodes) d.r = d.post.interactions == null ? 5 : Math.max(5, scale(d.post.interactions));
    }

    function layout() {
      const narrow = w < 600;
      targets = new Map();
      labels = [];
      if (o.grouping === 'map') {
        projection = H.fitProjection(w, h, { top: 16, right: 16, bottom: 16, left: 16 });
        const path = d3.geoPath(projection);
        const point = (date) => {
          const s = H.sessionByDate.get(date);
          const feats = H.GEO.features.filter((f) => s.districts.includes(f.properties.name));
          let ax = 0;
          let ay = 0;
          let total = 0;
          for (const f of feats) {
            const a = path.area(f);
            const [cx, cy] = path.centroid(f);
            ax += cx * a;
            ay += cy * a;
            total += a;
          }
          return [ax / total, ay / total];
        };
        for (const d of nodes) {
          if (d.post.candidate === 'shen') targets.set(d.i, point(d.post.date));
          else {
            const s = chiangSpotFor(d.post.date);
            targets.set(d.i, projection([s.lon, s.lat]));
          }
        }
        gBack.selectAll('path').data(H.GEO.features).join('path').attr('d', path)
          .attr('fill', (f) => H.sessionByDistrict.get(f.properties.name).color)
          .attr('fill-opacity', 0.08).attr('stroke', 'rgba(255,255,255,0.14)');
      } else if (o.grouping === 'type') {
        const colX = [0.2, 0.5, 0.8].map((f) => f * w);
        // 窄螢幕的圖比較矮，兩列往下移，列標題（沈伯洋）才不會碰到上方的欄標題（一般民眾）
        const rowY = narrow ? [h * 0.37, h * 0.79] : [h * 0.33, h * 0.76];
        H.AUTHOR_TYPES.forEach((t, c) => labels.push({ x: colX[c], y: 22, text: t.key, cls: 'bubble-col' }));
        let lastStat = 0;
        ['shen', 'chiang'].forEach((cand, r) => {
          // 列標題不能比上一列的統計文字（「8 篇 · 33.9 萬」）高，圖比較矮時才不會疊在一起
          const rowLabelY = Math.max(rowY[r] - (narrow ? 70 : 92), lastStat + 26, narrow ? 46 : 0);
          labels.push({ x: 4, y: rowLabelY, base: rowLabelY, row: r, text: cand === 'shen' ? '沈伯洋' : '蔣萬安', cls: 'bubble-row', anchor: 'start' });
          H.AUTHOR_TYPES.forEach((t, c) => {
            const group = nodes.filter((d) => d.post.candidate === cand && d.type === t.key);
            group.forEach((d) => targets.set(d.i, [colX[c], rowY[r]]));
            const total = d3.sum(group, (d) => d.post.interactions || 0);
            const spread = Math.sqrt(d3.sum(group, (d) => d.r * d.r)) * 1.5;
            const statY = rowY[r] + spread + 16;
            lastStat = Math.max(lastStat, statY);
            labels.push({ x: colX[c], y: statY, group, row: r, text: group.length ? `${group.length} 篇 · ${H.wan(total)}` : '0 篇', cls: 'bubble-stat' });
          });
        });
      } else {
        const cols = narrow ? 2 : 3;
        const areaW = narrow ? w : w * 0.74;
        const rows = Math.ceil(H.sessions.length / cols);
        const areaH = narrow ? h * 0.72 : h;
        H.sessions.forEach((s, k) => {
          const cx = (areaW / cols) * ((k % cols) + 0.5);
          const cy = (areaH / rows) * (Math.floor(k / cols) + 0.55);
          nodes.filter((d) => d.post.candidate === 'shen' && d.post.date === s.date).forEach((d) => targets.set(d.i, [cx, cy]));
          labels.push({ x: cx, y: cy - (areaH / rows) * 0.38, text: `${H.md(s.date)} ${s.name}`, cls: 'bubble-col', color: s.color });
        });
        const chiangPos = narrow ? [w / 2, h * 0.86] : [w * 0.87, h * 0.5];
        nodes.filter((d) => d.post.candidate === 'chiang').forEach((d) => targets.set(d.i, chiangPos));
        labels.push({ x: chiangPos[0], y: chiangPos[1] - (narrow ? 72 : 110), text: '蔣萬安（14 篇）', cls: 'bubble-col', color: H.CHIANG_COLOR });
      }
      if (o.grouping !== 'map') gBack.selectAll('path').remove();

      const lab = gLabels.selectAll('text').data(labels).join('text')
        .attr('class', (d) => d.cls)
        .attr('x', (d) => d.x).attr('y', (d) => d.y)
        .attr('text-anchor', (d) => d.anchor || 'middle')
        .text((d) => d.text);
      lab.attr('opacity', 0).transition().delay(300).duration(500).attr('opacity', 1);
      gLabels.selectAll('circle').data(labels.filter((d) => d.color)).join('circle')
        .attr('r', 4).attr('fill', (d) => d.color)
        .attr('cx', (d) => d.x - textHalf(d.text) - 9).attr('cy', (d) => d.y - 4);
    }
    const textHalf = (t) => t.length * 6.2;

    // 依發文者類型：統計文字跟著泡泡實際的位置放在泡泡下方，蔣萬安的列標題再放在沈伯洋那列統計文字下方；
    // 圖比較矮時泡泡會被擠開，用預估位置的話文字會被泡泡壓到。
    function placeTypeLabels() {
      let shenStat = 0;
      for (const d of labels) {
        if (!d.group || !d.group.length) continue;
        d.y = d3.max(d.group, (n) => n.y + n.r) + 16;
        if (d.row === 0) shenStat = Math.max(shenStat, d.y);
      }
      for (const d of labels) {
        if (d.cls === 'bubble-row' && d.row === 1) d.y = Math.max(d.base, shenStat + 24);
      }
      gLabels.selectAll('text').attr('y', (d) => d.y);
    }

    function headline() {
      if (!o.headline) return;
      const shen = nodes.filter((d) => d.post.candidate === 'shen');
      const chiang = nodes.filter((d) => d.post.candidate === 'chiang');
      const share = (list) => {
        const total = d3.sum(list, (d) => d.post.interactions || 0);
        const grass = d3.sum(list.filter((d) => d.type !== '公眾帳號'), (d) => d.post.interactions || 0);
        return Math.round((grass / total) * 100);
      };
      const top = [...shen].sort((a, b) => b.post.interactions - a.post.interactions);
      const text = {
        map: '每顆泡泡是一篇熱門貼文，從它所屬的那場車掃（沈伯洋）或夜市（蔣萬安）冒出來；越大顆，互動越多。白色是一般民眾，畫斜線的是原文點名的小帳號（追蹤者不到 600 人）。',
        type: `沈伯洋的 ${shen.length} 篇熱門貼文，一般民眾和個人帳號的貼文拿下 ${share(shen)}% 的互動；蔣萬安的 ${chiang.length} 篇是 ${share(chiang)}%，多是政治人物、評論者與媒體的攻防。`,
        session: `每場車掃最熱的 3 篇貼文。最大顆的是 ${H.md(top[0].post.date)} ${top[0].post.author}（${top[0].post.interactionsLabel}），其次是 ${H.md(top[1].post.date)} ${top[1].post.author} 的貼文（${top[1].post.interactionsLabel}）：${top[1].post.content}。`,
      }[o.grouping];
      o.headline.textContent = text;
    }

    function drawLegend() {
      if (!legendBox) return;
      // 大小用和泡泡同一個比例尺，畫 1 萬、5 萬、10 萬次互動三個同心圓。
      const vals = [10000, 50000, 100000];
      const rs = vals.map((v) => rScale(v));
      const big = rs[2];
      const width = big * 2 + 52;
      const height = big * 2 + 4;
      const circles = vals.map((v, i) => {
        const cy = height - 2 - rs[i];
        const ty = height - 2 - rs[i] * 2;
        return `<circle cx="${big + 1}" cy="${cy}" r="${rs[i]}" fill="none" stroke="#aab3c5" stroke-width="1"/>`
          + `<line x1="${big + 1}" x2="${big * 2 + 6}" y1="${ty}" y2="${ty}" stroke="#4a5470" stroke-width="1"/>`
          + `<text x="${big * 2 + 8}" y="${ty + 3}">${v / 10000} 萬</text>`;
      }).join('');
      const sizeSvg = `<svg class="lg-size" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${circles}</svg>`;
      // 大小圓圈單獨放左邊，其餘項目包成一塊放右邊；斜線、虛線固定排在第二行。
      H.fillLegend(legendBox, [
        { html: sizeSvg, label: '' },
        { group: [
          { group: [
            { html: '', label: '大小＝互動數' },
            { type: 'fill', color: H.AUTHOR_TYPES[0].fill, label: '一般民眾' },
            { type: 'fill', color: H.AUTHOR_TYPES[1].fill, label: '個人帳號（追蹤者上萬）' },
            { type: 'fill', color: H.AUTHOR_TYPES[2].fill, label: '公眾帳號' },
            { type: 'rings', colors: H.sessions.map((s) => s.color), label: '外圈＝沈伯洋的車掃場次' },
            { type: 'ring', color: H.CHIANG_COLOR, label: '藍色外圈＝蔣萬安' },
          ] },
          { group: [
            { type: 'hatch', id, color: H.AUTHOR_TYPES[0].fill, label: '斜線＝原文點名的小帳號（追蹤者不到 600 人）' },
            { type: 'dashed-ring', color: '#aab3c5', label: '虛線＝原文沒有互動數' },
          ] },
        ] },
      ]);
    }

    function ticked() {
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
      if (o.grouping === 'type') placeTypeLabels();
    }

    function render({ burst = false } = {}) {
      size();
      if (w < 200) return;
      radii();
      drawLegend();
      size(); // 圖例畫好後高度才確定，敘事舞台要重新扣掉
      if (h < 200) return;
      lastSize = `${w}x${h}`; // 換分群時高度可能跟著變，記下來免得尺寸監聽又重畫一次
      svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h)
        .attr('aria-label', '熱門貼文泡泡圖，每篇貼文一顆泡泡，大小代表互動數。');
      layout();
      headline();
      nodeSel.select('.bubble-hit').attr('r', hitR);
      const body = nodeSel.select('.bubble-body');
      if (burst) {
        for (const d of nodes) {
          const t = targets.get(d.i);
          d.x = t[0] + (Math.random() - 0.5) * 4;
          d.y = t[1] + (Math.random() - 0.5) * 4;
        }
        body.attr('r', 0).transition().delay((d) => d.order * 140).duration(600).attr('r', (d) => d.r);
      } else {
        body.transition().duration(500).attr('r', (d) => d.r);
      }
      // forceX／forceY 會快取目標位置，換分群或尺寸後要重新指定才會重算
      sim.force('x').x((d) => targets.get(d.i)?.[0] ?? w / 2).strength(o.grouping === 'map' ? 0.14 : 0.09);
      sim.force('y').y((d) => targets.get(d.i)?.[1] ?? h / 2).strength(o.grouping === 'map' ? 0.14 : 0.09);
      sim.force('collide').radius((d) => hitR(d) + 1.5);
      if (H.prefersReducedMotion()) {
        sim.stop();
        for (let k = 0; k < 300; k += 1) sim.tick();
        ticked();
      } else {
        sim.alpha(burst ? 0.6 : 0.9).restart();
      }
      highlight();
    }

    function highlight(hovered) {
      const focus = o.linked ? H.active() : null;
      nodeSel.attr('opacity', (d) => {
        if (hovered) return d === hovered ? 1 : 0.55;
        if (!focus) return 1;
        return d.post.candidate === 'shen' && d.post.date === focus ? 1 : 0.18;
      });
    }

    let lastSize = '';
    let started = false;
    new ResizeObserver(() => {
      size();
      const key = `${w}x${h}`;
      if (key === lastSize || w < 200) return;
      lastSize = key;
      render({ burst: !started });
      started = true;
    }).observe(el);

    return {
      setGrouping(g) {
        o.grouping = g;
        render();
      },
      burst() {
        render({ burst: true });
      },
      highlight,
      get grouping() { return o.grouping; },
    };
  };
})();
