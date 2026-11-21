// 洋流發光地圖：台北 12 區依車掃場次分 6 塊，亮度跟著每天的掃街相關討論變化。
(() => {
  const H = window.HW3;
  let uid = 0;

  // d3-geo 以球面計算面積，外環方向反了會變成「整個地球減掉台北」，這裡統一修正。
  function rewind(geo) {
    for (const f of geo.features) {
      if (d3.geoArea(f) > 2 * Math.PI) {
        const g = f.geometry;
        if (g.type === 'Polygon') g.coordinates = g.coordinates.map((r) => r.slice().reverse());
        else g.coordinates = g.coordinates.map((p) => p.map((r) => r.slice().reverse()));
      }
    }
    return geo;
  }
  const GEO = rewind(window.TAIPEI_GEO);
  // 地圖畫得小時的標籤位移 [右移, 下移]：中山×大同往上、松山×信義往右下，避開彼此和中正×萬華
  const LABEL_NUDGE = { '2026-10-11': [0, -8], '2026-10-18': [10, 3] };
  H.GEO = GEO;
  H.fitProjection = (w, h, pad) => d3.geoMercator()
    .fitExtent([[pad.left, pad.top], [w - pad.right, h - pad.bottom]], GEO);

  H.createMap = function createMap(el, options) {
    const id = `map${uid++}`;
    const o = {
      hud: true, controls: true, interactive: true, labels: true,
      chiang: false, dimShen: false, allLit: false, allLitChiang: false, focus: null,
      height: null, onSelect: null, name: 'map',
      ...options,
    };
    const wrap = d3.select(el).classed('map-wrap', true);
    const svg = wrap.append('svg').attr('class', 'map-svg').attr('role', 'img');
    const defs = svg.append('defs');
    const glowFilter = defs.append('filter').attr('id', `${id}-glow`)
      .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', 9).attr('result', 'blur');
    const merge = glowFilter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'blur');
    const softFilter = defs.append('filter').attr('id', `${id}-soft`)
      .attr('x', '-200%').attr('y', '-200%').attr('width', '500%').attr('height', '500%');
    softFilter.append('feGaussianBlur').attr('stdDeviation', 5);

    const gGlow = svg.append('g').attr('filter', `url(#${id}-glow)`).attr('pointer-events', 'none');
    const gFill = svg.append('g');
    const gWaves = svg.append('g').attr('pointer-events', 'none');
    const gSel = svg.append('g').attr('pointer-events', 'none');
    const gSpots = svg.append('g');
    const gLabels = svg.append('g').attr('pointer-events', 'none');
    const gHud = svg.append('g').attr('class', 'map-hud');

    let controls = null;
    if (o.controls) {
      controls = wrap.append('div').attr('class', 'map-controls');
      controls.append('button').attr('type', 'button').attr('class', 'play-btn')
        .on('click', () => (timer ? pause() : play()));
    }

    const last = H.DAYS.length - 1;
    let dayIdx = last;
    let timer = null;
    let w = 0;
    let h = 0;
    let projection;
    let path;
    let spark = null;
    let legend = null;

    const sessionOf = (f) => H.sessionByDistrict.get(f.properties.name);
    const touchOnly = window.matchMedia('(hover: none)').matches;

    function size() {
      w = el.clientWidth;
      h = o.height ? o.height(w) : el.clientHeight;
    }

    function build() {
      size();
      if (w < 200 || h < 200) return false;
      svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
      const sparkH = o.hud ? 58 : 0;
      // 窄螢幕的筆數那行分成兩行（避開右上角的播放按鈕），日期區多留一行高
      const hudTop = w < 500 ? 118 : 100;
      const pad = { top: o.hud ? hudTop : 16, right: 16, bottom: 16 + sparkH, left: 16 };
      projection = H.fitProjection(w, h, pad);
      path = d3.geoPath(projection);

      // 發光層
      gGlow.selectAll('path').data(GEO.features, (f) => f.properties.name).join('path')
        .attr('d', path).attr('fill', (f) => sessionOf(f).color);

      // 可點的場次區塊（兩區一組）
      const groups = gFill.selectAll('g.session').data(H.sessions, (s) => s.date).join('g')
        .attr('class', 'session');
      groups.selectAll('path').data((s) => GEO.features.filter((f) => s.districts.includes(f.properties.name)))
        .join('path').attr('d', path)
        .attr('fill', (f) => sessionOf(f).color)
        .attr('stroke', 'rgba(255,255,255,0.18)').attr('stroke-width', 1);
      if (o.interactive) {
        groups.attr('role', 'button').attr('tabindex', 0)
          .attr('aria-label', (s) => `${H.md(s.date)} ${s.name} 車掃，當天 ${H.fmt(s.street)} 筆。選取這一場`)
          .style('cursor', 'pointer')
          .on('pointerenter focus', (event, s) => {
            // 觸控沒有「滑過」，點一下直接選取；不先預覽，免得手機把第一下當成滑過而不觸發點擊。
            if (event.type !== 'focus' && event.pointerType !== 'mouse') return;
            sessionTip(s);
            if (event.type === 'focus') H.placeTipAt(event.currentTarget);
            else H.placeTip(event.clientX, event.clientY);
            H.setHover(s.date, o.name);
            update();
          })
          .on('pointermove', (event) => H.placeTip(event.clientX, event.clientY))
          .on('pointerleave blur', () => {
            H.hideTip();
            H.setHover(null, o.name);
            update();
          })
          .on('click', (event, s) => select(s));
        H.activateOnKey(groups, (event, s) => select(s));
      }

      // 洋流波紋：在每場的兩區裡畫流動的波浪線
      gWaves.selectAll('*').remove();
      for (const s of H.sessions) {
        const feats = GEO.features.filter((f) => s.districts.includes(f.properties.name));
        const clipId = `${id}-clip-${s.no}`;
        const clip = defs.selectAll(`#${clipId}`).data([null]).join('clipPath').attr('id', clipId);
        clip.selectAll('path').data(feats).join('path').attr('d', path);
        const b = feats.map((f) => path.bounds(f));
        const x0 = d3.min(b, (q) => q[0][0]) - 20;
        const x1 = d3.max(b, (q) => q[1][0]) + 20;
        const y0 = d3.min(b, (q) => q[0][1]);
        const y1 = d3.max(b, (q) => q[1][1]);
        const g = gWaves.append('g').attr('class', 'waves').attr('data-date', s.date)
          .attr('clip-path', `url(#${clipId})`);
        const gap = w < 500 ? 7 : 9;
        const line = d3.line().curve(d3.curveBasis);
        for (let y = y0 + gap / 2, n = 0; y < y1; y += gap, n += 1) {
          const pts = d3.range(x0, x1 + 10, 10).map((x) => [x, y + 2.6 * Math.sin(x / 17 + n * 0.9)]);
          g.append('path').attr('d', line(pts)).attr('class', 'wave')
            .attr('stroke', s.color).style('animation-delay', `${-(n % 5) * 0.3}s`);
        }
      }

      // 標籤：地圖畫得比較小（矮手機）時，中山×大同和松山×信義的標籤會疊在一起，稍微拉開
      const [[, top], [, bottom]] = path.bounds(GEO);
      const compact = bottom - top < 360;
      gLabels.selectAll('g').data(H.sessions, (s) => s.date).join((enter) => {
        const g = enter.append('g');
        g.append('text').attr('class', 'map-label-no');
        g.append('text').attr('class', 'map-label-name');
        return g;
      }).attr('transform', (s) => {
        const [x, y] = sessionPoint(s.date);
        const [nx, ny] = (compact && LABEL_NUDGE[s.date]) || [0, 0];
        return `translate(${x + nx},${y + ny})`;
      }).call((g) => {
        g.select('.map-label-no').attr('y', -2).attr('text-anchor', 'middle').text((s) => `${H.md(s.date)}`);
        g.select('.map-label-name').attr('y', 13).attr('text-anchor', 'middle').text((s) => s.name);
      });

      // 蔣萬安的夜市
      const spots = gSpots.selectAll('g').data(H.CHIANG_SPOTS, (s) => s.date).join((enter) => {
        const g = enter.append('g').attr('class', 'spot');
        // 只有透明的感應圓接收滑鼠，光暈、圓點和標籤（窄螢幕時透明）都不擋住下面的區塊。
        g.append('circle').attr('class', 'spot-halo').attr('filter', `url(#${id}-soft)`).attr('pointer-events', 'none');
        g.append('circle').attr('class', 'spot-core').attr('pointer-events', 'none');
        g.append('circle').attr('class', 'spot-hit').attr('r', 12).attr('fill', 'transparent');
        g.append('text').attr('class', 'spot-label').attr('pointer-events', 'none');
        return g;
      }).attr('transform', (s) => `translate(${projection([s.lon, s.lat])})`);
      // 觸控螢幕上，夜市光點不接收點擊，手指點到哪一區就選哪一區。
      spots.attr('pointer-events', touchOnly ? 'none' : null);
      spots.select('.spot-label').attr('x', (s) => s.dx).attr('y', (s) => s.dy)
        .attr('text-anchor', (s) => s.anchor).text((s) => s.name);
      placeSpotLabels(spots);
      spots.on('pointerenter', (event, s) => {
        spotTip(s);
        H.placeTip(event.clientX, event.clientY);
      }).on('pointerleave', H.hideTip);

      if (o.hud) buildHud(pad);
      return true;
    }

    // 夜市名稱先放在資料指定的位置；如果碰到場次標籤（如「10/11 中山×大同」）或其他夜市，
    // 依序改放到上、下、右、左等位置，挑第一個不重疊的。地圖大小不同，擠的地方也不同，所以每次重畫都重算。
    const SPOT_SPOTS = [[0, -10, 'middle'], [0, 18, 'middle'], [9, 4, 'start'], [-9, 4, 'end'],
      [9, -7, 'start'], [-9, -7, 'end'], [9, 15, 'start'], [-9, 15, 'end']];
    function placeSpotLabels(spots) {
      const origin = svg.node().getBoundingClientRect();
      if (!origin.width) return;
      const box = (el, pad = 1) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left - origin.left - pad, y0: r.top - origin.top - pad, x1: r.right - origin.left + pad, y1: r.bottom - origin.top + pad };
      };
      const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      const taken = gLabels.selectAll('text').nodes().map((el) => box(el));
      // 夜市光點本身也不能被名稱蓋住（光點大小在 update 才設，這裡用半徑 12 的感應圓縮成半徑約 6）
      spots.select('.spot-hit').each(function () { taken.push(box(this, -6)); });
      spots.each(function (s) {
        const label = d3.select(this).select('.spot-label');
        const tries = [[s.dx, s.dy, s.anchor], ...SPOT_SPOTS];
        let chosen = tries[0];
        for (const t of tries) {
          label.attr('x', t[0]).attr('y', t[1]).attr('text-anchor', t[2]);
          if (!taken.some((b) => hit(box(label.node()), b))) {
            chosen = t;
            break;
          }
        }
        label.attr('x', chosen[0]).attr('y', chosen[1]).attr('text-anchor', chosen[2]);
        taken.push(box(label.node()));
      });
    }

    function sessionPoint(date) {
      const s = H.sessionByDate.get(date);
      const feats = GEO.features.filter((f) => s.districts.includes(f.properties.name));
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
    }
    const spotPoint = (date) => {
      const s = H.CHIANG_SPOTS.find((q) => q.date === date);
      return projection([s.lon, s.lat]);
    };

    function sessionTip(s) {
      const pct = (k) => {
        const v = H.pctAt(H.decay.shen, s.date, k);
        return v == null ? '—' : `${Math.round(v)}%`;
      };
      H.tipContent(`${H.md(s.date)}（${s.weekday}）${s.name}`, [
        { value: `${H.fmt(s.street)} 筆`, label: '車掃當天的掃街相關討論', color: s.color },
        { value: pct(1), label: '隔天（相對當天）' },
        { value: `${s.ratio.toFixed(2)} 倍`, label: s.excluded ? '當天 vs 前 3 天（受辯論影響，不列入）' : '當天 vs 前 3 天' },
      ], s.scene);
    }
    function spotTip(s) {
      const day0 = H.byDate.get(s.date).chiang;
      const day1 = H.byDate.get(H.shiftDate(s.date, 1))?.chiang;
      H.tipContent(`蔣萬安 ${H.md(s.date)}（${H.weekday(s.date)}）${s.name}`, [
        { value: `${H.fmt(day0)} 筆`, label: '當天掃街相關討論', color: H.CHIANG_COLOR },
        { value: day1 == null ? '—' : `${H.fmt(day1)} 筆`, label: '隔天' },
      ], H.CHIANG_NOTES[s.date] || '');
    }

    function buildHud(pad) {
      gHud.selectAll('*').remove();
      gHud.append('text').attr('class', 'hud-date').attr('x', 16).attr('y', 30);
      gHud.append('text').attr('class', 'hud-count').attr('x', 16).attr('y', 50);
      // 亮度參考條：最近一場車掃的兩區，亮度＝當天筆數 ÷ 期間最多的一天；三角形標出目前這一天的位置。
      const lg = gHud.append('g').attr('class', 'glow-legend').attr('transform', `translate(16,${pad.top - 36})`);
      const barX = 30;
      const barW = Math.min(200, w - 80);
      const gradId = `${id}-legend`;
      const grad = defs.selectAll(`#${gradId}`).data([null]).join('linearGradient').attr('id', gradId);
      const stops = grad.selectAll('stop').data(d3.range(11)).join('stop')
        .attr('offset', (i) => `${i * 10}%`);
      lg.append('text').attr('class', 'spark-tick').attr('x', 0).attr('y', 14).text('亮度');
      lg.append('rect').attr('x', barX).attr('y', 6).attr('width', barW).attr('height', 10).attr('rx', 2)
        .attr('fill', `url(#${gradId})`);
      const ticks = [0, 400, 800, H.MAX_SHEN];
      lg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'legend-tick')
        .attr('x1', (d) => barX + (d / H.MAX_SHEN) * barW).attr('x2', (d) => barX + (d / H.MAX_SHEN) * barW)
        .attr('y1', 16).attr('y2', 20);
      lg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'spark-tick')
        .attr('x', (d) => barX + (d / H.MAX_SHEN) * barW).attr('y', 31)
        .attr('text-anchor', (d, i) => (i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'))
        .text((d, i) => (i === ticks.length - 1 ? `${H.fmt(d)} 筆` : H.fmt(d)));
      const marker = lg.append('path').attr('class', 'legend-marker').attr('d', 'M0,5 l-4,-6 h8 z');
      legend = { barX, barW, stops, marker };
      const sy0 = h - 50;
      const sy1 = h - 14;
      const sx = d3.scaleLinear().domain([0, last]).range([20, w - 20]);
      const sy = d3.scaleLinear().domain([0, H.MAX_SHEN]).range([sy1, sy0]);
      const series = H.data.daily.map((d, i) => [sx(i), sy(d.shen)]);
      gHud.append('path').attr('class', 'spark-area')
        .attr('d', d3.area().x((p) => p[0]).y0(sy1).y1((p) => p[1])(series));
      gHud.append('path').attr('class', 'spark-line').attr('d', d3.line()(series));
      gHud.append('g').selectAll('circle').data(H.sessions).join('circle')
        .attr('cx', (s) => sx(H.dayIndex.get(s.date))).attr('cy', (s) => sy(s.street)).attr('r', 3.5)
        .attr('fill', (s) => s.color);
      gHud.append('text').attr('class', 'spark-tick').attr('x', 20).attr('y', h - 1).text('10/1');
      gHud.append('text').attr('class', 'spark-tick').attr('x', w - 20).attr('y', h - 1).attr('text-anchor', 'end').text('11/16');
      // 走勢線的圖例，放在兩端日期中間
      gHud.append('text').attr('class', 'spark-tick').attr('x', w / 2).attr('y', h - 1).attr('text-anchor', 'middle')
        .text(w < 500 ? '每日筆數 · 圓點＝車掃日 · 白線＝目前日期' : '下方走勢＝每日筆數 · 圓點＝車掃當天 · 白線＝目前日期（可拖曳）');
      const cursor = gHud.append('line').attr('class', 'spark-cursor').attr('y1', sy0 - 6).attr('y2', sy1);
      const scrub = (event) => {
        const [px] = d3.pointer(event, svg.node());
        pause();
        setDay(Math.round(sx.invert(Math.max(20, Math.min(w - 20, px)))));
      };
      gHud.append('rect').attr('x', 10).attr('y', sy0 - 10).attr('width', w - 20).attr('height', sy1 - sy0 + 16)
        .attr('fill', 'transparent').style('cursor', 'ew-resize')
        .on('pointerdown', (event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub(event);
        })
        .on('pointermove', (event) => {
          if (event.buttons) scrub(event);
        });
      spark = { sx, cursor };
    }

    function update() {
      if (!projection) return;
      const focus = o.interactive ? H.active() : o.focus;
      const glow = o.allLit ? H.shenGlowAll() : H.shenGlow(dayIdx).glow;
      const shenK = o.dimShen ? 0.18 : 1;
      const level = (date) => {
        const v = glow.get(date) * shenK;
        return focus && focus !== date ? v * 0.25 : v;
      };
      gFill.selectAll('g.session')
        .attr('fill-opacity', (s) => 0.1 + 0.5 * level(s.date) + (focus === s.date ? 0.15 : 0));
      gGlow.selectAll('path').attr('opacity', (f) => Math.pow(level(sessionOf(f).date), 1.3) * 0.95);
      gWaves.selectAll('g.waves').attr('opacity', function () {
        const v = level(this.dataset.date);
        return v < 0.05 ? 0 : Math.min(1, v * 1.15);
      });
      gSel.selectAll('path').data(focus ? GEO.features.filter((f) => sessionOf(f).date === focus) : [])
        .join('path').attr('d', path).attr('fill', 'none').attr('stroke', '#ffffff').attr('stroke-width', 2);
      gLabels.attr('opacity', o.labels ? 1 : 0);
      gLabels.selectAll('g').attr('opacity', (s) => (o.dimShen ? 0.35 : focus && focus !== s.date ? 0.45 : 1));

      const spotGlow = o.allLitChiang ? H.chiangGlowAll() : H.chiangGlow(dayIdx);
      gSpots.attr('display', o.chiang ? null : 'none');
      gSpots.selectAll('g.spot').each(function (s) {
        const v = spotGlow.get(s.date);
        const g = d3.select(this);
        g.select('.spot-core').attr('r', 2.5 + 5 * v).attr('fill', H.CHIANG_COLOR).attr('opacity', 0.35 + 0.65 * v);
        g.select('.spot-halo').attr('r', 6 + 16 * v).attr('fill', H.CHIANG_COLOR).attr('opacity', v * 0.9);
        g.select('.spot-label').attr('opacity', v > 0.2 && w >= 500 ? 1 : 0);
      });

      svg.attr('aria-label', ariaText());
      if (o.hud) updateHud();
      if (controls) {
        controls.select('.play-btn').text(timer ? '❚❚ 暫停' : dayIdx >= last ? '▶ 從頭播放' : '▶ 播放')
          .attr('aria-label', timer ? '暫停播放' : '播放 10/1 到 11/16 的每日變化');
      }
    }

    function ariaText() {
      const d = H.DAYS[dayIdx];
      return `台北市 12 區地圖，依沈伯洋 6 場車掃分成 6 塊。目前顯示 ${H.md(d)}，沈伯洋掃街相關討論 ${H.fmt(H.byDate.get(d).shen)} 筆。`;
    }

    function updateHud() {
      const d = H.DAYS[dayIdx];
      const row = H.byDate.get(d);
      const { current } = H.shenGlow(dayIdx);
      gHud.select('.hud-date').text(`${H.md(d)}（${H.weekday(d)}）`);
      const main = o.chiang && o.dimShen
        ? `蔣萬安掃街相關 ${H.fmt(row.chiang)} 筆`
        : `沈伯洋掃街相關 ${H.fmt(row.shen)} 筆`;
      const extra = [];
      if (row.shenCampaign) extra.push(`${row.shenCampaign} 車掃日`);
      else if (current) extra.push(`距 ${current.name} ${dayDiff(current.date, d)} 天`);
      if (row.note) extra.push(row.note);
      const count = gHud.select('.hud-count').text(null);
      if (w < 500) {
        count.append('tspan').attr('x', 16).text(main);
        if (extra.length) count.append('tspan').attr('x', 16).attr('dy', 17).text(extra.join(' · '));
      } else {
        count.text([main, ...extra].join(' · '));
      }
      if (legend) {
        // 亮度畫在「最近一場車掃」的兩區，參考條也用那一場的顏色。
        const color = current ? current.color : '#9aa6bd';
        // 和地圖區塊同樣的換算：填色透明度 0.1＋0.5×亮度，再加上光暈。
        legend.stops.attr('stop-color', color)
          .attr('stop-opacity', (i) => {
            const t = i / 10;
            return Math.min(1, 0.1 + 0.5 * t + 0.35 * Math.pow(t, 1.3));
          });
        const v = Math.min(1, row.shen / H.MAX_SHEN);
        legend.marker.attr('transform', `translate(${legend.barX + v * legend.barW},4)`);
      }
      if (spark) {
        const x = spark.sx(dayIdx);
        spark.cursor.attr('x1', x).attr('x2', x);
      }
    }
    const dayDiff = (a, b) => Math.round((H.parseDate(b) - H.parseDate(a)) / 86400000);

    function setDay(i) {
      dayIdx = Math.max(0, Math.min(last, i));
      update();
    }
    function play(fromStart) {
      if (timer) return;
      if (fromStart || dayIdx >= last) dayIdx = 0;
      timer = d3.interval(() => {
        if (dayIdx >= last) {
          pause();
          return;
        }
        setDay(dayIdx + 1);
      }, 260);
      update();
    }
    function pause() {
      if (timer) timer.stop();
      timer = null;
      update();
    }
    function select(s) {
      pause();
      if (o.onSelect) o.onSelect(s);
      else H.setSession(s.date);
      setDay(H.dayIndex.get(s.date));
    }
    function set(partial) {
      Object.assign(o, partial);
      update();
    }

    let lastSize = '';
    new ResizeObserver(() => {
      size();
      const key = `${w}x${h}`;
      if (key === lastSize) return;
      lastSize = key;
      if (build()) update();
    }).observe(el);

    return {
      setDay, play, pause, set, update,
      get day() { return dayIdx; },
      get playing() { return !!timer; },
      dayOf: (date) => H.dayIndex.get(date),
      sessionPoint: (date) => (projection ? sessionPoint(date) : [0, 0]),
      spotPoint: (date) => (projection ? spotPoint(date) : [0, 0]),
    };
  };
})();
