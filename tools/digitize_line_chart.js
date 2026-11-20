// 從原文折線圖圖片讀出每日數值。
// 用法：在 Chrome 開啟原圖網址（例如 image-9.png），打開開發者工具的 Console，貼上本檔內容後執行。
// 圖片和頁面同網域，canvas 才讀得到像素。
//
// 步驟：
// 1. 找出水平格線（y 刻度）與垂直格線（日期刻度）的像素位置，換算成「每筆幾像素」「每天幾像素」。
// 2. 每兩天之間的線段取 30%～70% 位置的欄，算出線條中心，用最小平方法擬合直線。
// 3. 每天的值＝左右兩條線段在該日的外插值平均；避開資料點圓點和線段轉角的干擾。
//
// 下方設定是 image-9.png（沈伯洋掃街相關每日貼文，10/1–11/16）的校正值。

(() => {
  const CONFIG = {
    x0: 232.5,                         // 10/1 的垂直格線
    dx: (1663.5 - 232.5) / 45,         // 10/1 到 11/15 共 45 天
    days: 47,                          // 10/1–11/16
    yZero: 791.5,                      // 0 的水平格線
    pxPerUnit: (791.5 - 188.5) / 1400, // 0 到 1400 的距離
    rowTop: 150,
    rowBottom: 800,
    isLine: ([r, g, b]) => r > 200 && g > 70 && g < 170 && b < 110, // 橘色線條
  };

  const img = document.images[0];
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const pixelAt = (x, y) => {
    const k = (y * width + x) * 4;
    return [pixels[k], pixels[k + 1], pixels[k + 2]];
  };

  const lineCenter = (x) => {
    const rows = [];
    for (let y = CONFIG.rowTop; y < CONFIG.rowBottom; y += 1) {
      if (CONFIG.isLine(pixelAt(x, y))) rows.push(y);
    }
    if (!rows.length) return null;
    const runs = [];
    let start = rows[0];
    let prev = rows[0];
    for (const y of rows.slice(1)) {
      if (y !== prev + 1) {
        runs.push([start, prev]);
        start = y;
      }
      prev = y;
    }
    runs.push([start, prev]);
    runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    return (runs[0][0] + runs[0][1]) / 2;
  };

  const toValue = (row) => (CONFIG.yZero - row) / CONFIG.pxPerUnit;

  const segments = [];
  for (let k = 0; k < CONFIG.days - 1; k += 1) {
    const points = [];
    for (let f = 0.3; f <= 0.701; f += 0.04) {
      const x = Math.round(CONFIG.x0 + CONFIG.dx * (k + f));
      const center = lineCenter(x);
      if (center !== null) points.push([(x - CONFIG.x0) / CONFIG.dx - k, toValue(center)]);
    }
    const n = points.length;
    const meanT = points.reduce((s, p) => s + p[0], 0) / n;
    const meanV = points.reduce((s, p) => s + p[1], 0) / n;
    let num = 0;
    let den = 0;
    for (const [t, v] of points) {
      num += (t - meanT) * (v - meanV);
      den += (t - meanT) ** 2;
    }
    const slope = num / den;
    const intercept = meanV - slope * meanT;
    segments.push({ left: intercept, right: intercept + slope });
  }

  const values = [];
  for (let k = 0; k < CONFIG.days; k += 1) {
    const estimates = [];
    if (k > 0) estimates.push(segments[k - 1].right);
    if (k < CONFIG.days - 1) estimates.push(segments[k].left);
    values.push(Math.round(estimates.reduce((s, v) => s + v, 0) / estimates.length));
  }
  console.log(values.join(','));
  return values;
})();
