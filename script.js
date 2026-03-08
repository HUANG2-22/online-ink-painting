const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

const statusTag = document.getElementById('status');
const brushBtn = document.getElementById('brushBtn');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');

let isDrawing = false;
let currentTool = 'brush';
let currentStroke = null;
let renderTimer = null;
let strokes = [];

/* ---------------------------------
   PRNG
---------------------------------- */
const PRNG = {
  s: 1234,
  p: 999979,
  q: 999983,
  m: 999979 * 999983,
  hash(x) {
    const y = btoa(unescape(encodeURIComponent(JSON.stringify(x))));
    let z = 0;
    for (let i = 0; i < y.length; i++) {
      z += y.charCodeAt(i) * Math.pow(128, i % 8);
    }
    return Math.abs(z);
  },
  seed(x) {
    if (x === undefined) x = Date.now();
    let y = 0;
    let z = 0;
    const redo = () => {
      y = (this.hash(x) + z) % this.m;
      z += 1;
    };
    do {
      redo();
    } while (y % this.p === 0 || y % this.q === 0 || y === 0 || y === 1);
    this.s = y;
    for (let i = 0; i < 10; i++) this.next();
  },
  next() {
    this.s = (this.s * this.s) % this.m;
    return this.s / this.m;
  }
};

function rnd() {
  return PRNG.next();
}
function rand(min, max) {
  return min + (max - min) * rnd();
}
function randi(min, max) {
  return Math.floor(rand(min, max + 1));
}
function randChoice(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mapVal(v, a0, a1, b0, b1) {
  return b0 + (b1 - b0) * ((v - a0) / (a1 - a0));
}
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/* ---------------------------------
   Perlin Noise
---------------------------------- */
const Noise = new (function () {
  const PERLIN_YWRAPB = 4;
  const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
  const PERLIN_ZWRAPB = 8;
  const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
  const PERLIN_SIZE = 4095;

  let perlin_octaves = 4;
  let perlin_amp_falloff = 0.5;
  let perlin = null;

  const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));

  this.noiseSeed = function (seed) {
    let m = 4294967296;
    let a = 1664525;
    let c = 1013904223;
    let z = seed >>> 0;

    function randLCG() {
      z = (a * z + c) % m;
      return z / m;
    }

    perlin = new Array(PERLIN_SIZE + 1);
    for (let i = 0; i < PERLIN_SIZE + 1; i++) {
      perlin[i] = randLCG();
    }
  };

  this.noiseDetail = function (lod, falloff) {
    if (lod > 0) perlin_octaves = lod;
    if (falloff > 0) perlin_amp_falloff = falloff;
  };

  this.noise = function (x, y = 0, z = 0) {
    if (perlin == null) {
      perlin = new Array(PERLIN_SIZE + 1);
      for (let i = 0; i < PERLIN_SIZE + 1; i++) {
        perlin[i] = rnd();
      }
    }

    if (x < 0) x = -x;
    if (y < 0) y = -y;
    if (z < 0) z = -z;

    let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi;
    let yf = y - yi;
    let zf = z - zi;
    let rxf, ryf;
    let r = 0;
    let ampl = 0.5;

    for (let o = 0; o < perlin_octaves; o++) {
      let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

      rxf = scaled_cosine(xf);
      ryf = scaled_cosine(yf);

      let n1 = perlin[of & PERLIN_SIZE];
      n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
      let n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
      n1 += ryf * (n2 - n1);

      of += PERLIN_ZWRAP;
      n2 = perlin[of & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
      let n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
      n2 += ryf * (n3 - n2);
      n1 += scaled_cosine(zf) * (n2 - n1);

      r += n1 * ampl;
      ampl *= perlin_amp_falloff;
      xi <<= 1;
      xf *= 2;
      yi <<= 1;
      yf *= 2;
      zi <<= 1;
      zf *= 2;

      if (xf >= 1.0) {
        xi++;
        xf--;
      }
      if (yf >= 1.0) {
        yi++;
        yf--;
      }
      if (zf >= 1.0) {
        zi++;
        zf--;
      }
    }
    return r;
  };
})();

/* ---------------------------------
   Utils
---------------------------------- */
function setStatus(text) {
  if (statusTag) statusTag.innerText = text;
}

function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}

function avgY(points) {
  return points.reduce((s, p) => s + p.y, 0) / Math.max(1, points.length);
}

function simplifyPoints(points, step = 2) {
  if (points.length <= 2) return points.slice();
  return points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0);
}

function smoothPoints(points, passes = 2) {
  let pts = points.map(p => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    if (pts.length < 3) break;
    let out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      out.push({
        x: (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4,
        y: (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4
      });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function resamplePolyline(points, count = 90) {
  if (points.length < 2) return points.slice();
  const segLens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    segLens.push(d);
    total += d;
  }
  if (total < 1) return points.slice();

  const out = [];
  for (let k = 0; k < count; k++) {
    const t = (k / (count - 1)) * total;
    let acc = 0;
    let idx = 0;
    while (idx < segLens.length && acc + segLens[idx] < t) {
      acc += segLens[idx];
      idx++;
    }
    if (idx >= segLens.length) {
      out.push({ ...points[points.length - 1] });
      continue;
    }
    const local = (t - acc) / Math.max(segLens[idx], 1e-6);
    out.push({
      x: lerp(points[idx].x, points[idx + 1].x, local),
      y: lerp(points[idx].y, points[idx + 1].y, local)
    });
  }
  return out;
}

function polygonPath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawPolyline(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/* ---------------------------------
   Canvas setup
---------------------------------- */
function setupCanvas() {
  PRNG.seed('qinglu-layer-order-v3');
  Noise.noiseSeed(456789);
  Noise.noiseDetail(5, 0.52);

  ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
  ictx.fillStyle = '#f4eee1';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);
  ictx.lineCap = 'round';
  ictx.lineJoin = 'round';

  resetOutputScene();
}

function resetOutputScene() {
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);

  const bg = octx.createLinearGradient(0, 0, 0, oCanvas.height);
  bg.addColorStop(0, '#b18b54');
  bg.addColorStop(0.42, '#c89f66');
  bg.addColorStop(1, '#d6ae76');
  octx.fillStyle = bg;
  octx.fillRect(0, 0, oCanvas.width, oCanvas.height);

  drawPaperTexture();
  drawAtmosphericMounts();
  drawGroundMist();
}

function drawPaperTexture() {
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * oCanvas.width;
    const y = rnd() * oCanvas.height;
    const a = rnd() * 0.045;
    const c = 90 + rnd() * 45;
    octx.fillStyle = `rgba(${c},${c * 0.9},${c * 0.75},${a})`;
    octx.fillRect(x, y, 1, 1);
  }
}

function drawAtmosphericMounts() {
  for (let layer = 0; layer < 4; layer++) {
    const baseY = 100 + layer * 64;
    const alpha = 0.05 + layer * 0.016;
    const pts = [];
    const count = 28;
    for (let i = 0; i <= count; i++) {
      const x = mapVal(i, 0, count, 0, oCanvas.width);
      const n = Noise.noise(i * 0.18, layer * 0.27);
      const y = baseY - n * (36 - layer * 4) - Math.sin(i / count * Math.PI * 2) * 8;
      pts.push({ x, y });
    }
    const poly = pts.concat([
      { x: oCanvas.width, y: oCanvas.height * 0.72 },
      { x: 0, y: oCanvas.height * 0.72 }
    ]);
    octx.save();
    polygonPath(octx, poly);
    octx.fillStyle = `rgba(88,84,78,${alpha})`;
    octx.fill();
    octx.restore();
  }
}

function drawGroundMist() {
  for (let i = 0; i < 9; i++) {
    const cx = rand(40, oCanvas.width - 40);
    const cy = rand(oCanvas.height * 0.42, oCanvas.height * 0.8);
    const r = rand(50, 130);
    const g = octx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(245,240,235,0.11)');
    g.addColorStop(0.5, 'rgba(245,240,235,0.055)');
    g.addColorStop(1, 'rgba(245,240,235,0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.fill();
  }
}

/* ---------------------------------
   Input events
---------------------------------- */
function startDraw(e) {
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);

  ictx.beginPath();
  ictx.moveTo(pos.x, pos.y);

  currentStroke = {
    tool: currentTool,
    points: [pos]
  };
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();

  const pos = getPos(e);

  if (currentTool === 'brush') {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#141414';
    ictx.lineWidth = 4;
  } else {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#f4eee1';
    ictx.lineWidth = 18;
  }

  ictx.lineTo(pos.x, pos.y);
  ictx.stroke();

  currentStroke.points.push(pos);
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentStroke && currentStroke.points.length > 1) {
    if (currentStroke.tool === 'eraser') {
      eraseByStroke(currentStroke);
    } else {
      strokes.push(currentStroke);
    }
  }

  currentStroke = null;
  scheduleRender();
}

function eraseByStroke(eraserStroke) {
  const threshold = 20;
  strokes = strokes.map(stroke => {
    if (stroke.tool !== 'brush') return stroke;
    const filtered = stroke.points.filter(p => {
      for (const ep of eraserStroke.points) {
        if (Math.hypot(p.x - ep.x, p.y - ep.y) < threshold) return false;
      }
      return true;
    });
    return { ...stroke, points: filtered };
  }).filter(s => s.points.length > 1);
}

function clearAll() {
  strokes = [];
  currentStroke = null;
  ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);
  setupCanvas();
  setStatus('画卷已重置，等待新的山水勾勒');
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderLandscape, 45);
}

/* ---------------------------------
   Mountain generation
---------------------------------- */
function makeMountainFromStroke(stroke, index, total) {
  let pts = simplifyPoints(stroke.points, 2);
  pts = smoothPoints(pts, 2);
  pts = resamplePolyline(pts, 92);

  const meanY = avgY(pts);
  const depth = index / Math.max(1, total - 1);
  const seed = Math.floor(meanY * 19 + pts[0].x * 5 + index * 131);

  const ridge = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = i / (pts.length - 1);
    const n1 = Noise.noise(t * 3.0, seed * 0.01);
    const n2 = Noise.noise(t * 7.5, seed * 0.02 + 4.2);
    const jag = Noise.noise(t * 13.0, seed * 0.03 + 9.1);
    const lift = mapVal(1 - depth, 0, 1, 10, 42);

    ridge.push({
      x: p.x + (n1 - 0.5) * 10 + (jag - 0.5) * 4,
      y: p.y - (n1 - 0.5) * lift - (n2 - 0.5) * 12 - (jag - 0.5) * 8
    });
  }

  // 让底边跟随轮廓，不是直线下压
  const footPoints = [];
  for (let i = ridge.length - 1; i >= 0; i--) {
    const p = ridge[i];
    const t = i / (ridge.length - 1);
    const n = Noise.noise(t * 5.0, seed * 0.031 + 12.7);
    const baseDrop = mapVal(depth, 0, 1, 168, 112);
    footPoints.push({
      x: p.x + (n - 0.5) * 6,
      y: p.y + baseDrop + (n - 0.5) * 18 + Math.sin(t * Math.PI) * 10
    });
  }

  const poly = ridge.concat(footPoints);

  return {
    ridge,
    footPoints,
    poly,
    meanY,
    depth,
    seed
  };
}

/* ---------------------------------
   1) 山体填充颜色与透明度控制
   下面两个函数是主要控制区域
---------------------------------- */

// 这个函数控制“山体主体填色”
// 重点：
// - 颜色渐层
// - 顶部更深
// - 底部逐渐透明
function drawMountainBody(m) {
  const topY = Math.min(...m.ridge.map(p => p.y));
  const bottomY = Math.max(...m.footPoints.map(p => p.y));

  octx.save();
  polygonPath(octx, m.poly);
  octx.clip();

  // ---- 主体颜色渐层：这里控制山体大色 ----
  // 你可以改这里的 rgba 数值，控制蓝、绿、赭的比例
  const g = octx.createLinearGradient(0, topY, 0, bottomY);

  // 顶部更深的蓝绿
  g.addColorStop(0.11, `rgba(42,78,122,${0.26 + (1 - m.depth) * 0.09})`);//0->0.11,0.05->0.09
  g.addColorStop(0.30, `rgba(58,102,142,${0.22 + (1 - m.depth) * 0.05})`);//0.18->0.30

  // 中部青绿色
  g.addColorStop(0.42, `rgba(72,128,122,${0.18 + (1 - m.depth) * 0.04})`);

  // 下部偏石绿/赭绿
  g.addColorStop(0.68, `rgba(104,146,86,${0.12 + (1 - m.depth) * 0.03})`);//0.68->0.80

  // 最底部变得更透明
  g.addColorStop(1.00, `rgba(110,108,80,0.015)`);

  octx.fillStyle = g;
  octx.fillRect(0, topY, oCanvas.width, bottomY - topY);

  // ---- 顶部随机加深的蓝 / 绿罩染 ----
  // 这里专门控制“山顶颜色更重”
  const topColor = randChoice([
    ['34,74,128', rand(0.08, 0.36)],  // 蓝
    ['52,102,96', rand(0.07, 0.14)],  // 青绿
    ['76,120,88', rand(0.06, 0.12)]   // 绿
  ]);

  const topWash = octx.createLinearGradient(0, topY, 0, bottomY);
  topWash.addColorStop(0.00, `rgba(${topColor[0]},${topColor[1]})`);
  topWash.addColorStop(0.33, `rgba(${topColor[0]},${topColor[1] * 0.55})`);//0.22->0.33
  topWash.addColorStop(0.55, `rgba(${topColor[0]},0.02)`);
  topWash.addColorStop(1.00, `rgba(${topColor[0]},0)`);

  octx.fillStyle = topWash;
  octx.fillRect(0, topY, oCanvas.width, bottomY - topY);

  octx.restore();
}

// 这个函数控制“山体表面额外青绿渐层块”
// 如果想调石青 / 石绿的随机变化，主要看这里
function drawBlueGreenLayers(m) {
  const layerDefs = [
    { off: 0, alpha: 0.18, hue: '48,90,124' },
    { off: 16, alpha: 0.15, hue: '72,122,118' },
    { off: 30, alpha: 0.12, hue: '112,146,84' }
  ];

  for (const layerDef of layerDefs) {
    const layer = [];
    for (let i = 0; i < m.ridge.length; i++) {
      const p = m.ridge[i];
      const t = i / (m.ridge.length - 1);
      const n = Noise.noise(t * 4.0, m.seed * 0.013 + layerDef.off);
      const jag = Noise.noise(t * 9.0, m.seed * 0.021 + layerDef.off);
      layer.push({
        x: p.x + (jag - 0.5) * 3,
        y: p.y + layerDef.off + (n - 0.5) * 12
      });
    }

    const foot = [];
    for (let i = layer.length - 1; i >= 0; i--) {
      const p = layer[i];
      const t = i / (layer.length - 1);
      const n = Noise.noise(t * 4.2, m.seed * 0.025 + 30 + layerDef.off);
      foot.push({
        x: p.x + (n - 0.5) * 4,
        y: p.y + 95 + (n - 0.5) * 20
      });
    }

    const poly = layer.concat(foot);

    octx.save();
    polygonPath(octx, poly);
    octx.clip();

    // 这里控制附加青绿块的透明渐层
    const localTop = Math.min(...layer.map(p => p.y));
    const localBottom = Math.max(...foot.map(p => p.y));
    const gg = octx.createLinearGradient(0, localTop, 0, localBottom);
    gg.addColorStop(0.00, `rgba(${layerDef.hue},${layerDef.alpha})`);
    gg.addColorStop(0.55, `rgba(${layerDef.hue},${layerDef.alpha * 0.6})`);
    gg.addColorStop(1.00, `rgba(${layerDef.hue},0.01)`);

    octx.fillStyle = gg;
    octx.fillRect(0, localTop, oCanvas.width, localBottom - localTop);

    octx.restore();
  }

  // 随机青绿斑块
  for (let i = 0; i < m.ridge.length; i += 4) {
    const p = m.ridge[i];
    const cy = p.y + rand(14, 44);
    const r = rand(8, 22);

    // 这里控制随机色：蓝 / 青 / 绿
    const palette = randChoice([
      ['60,96,126', rand(0.04, 0.09)],
      ['78,124,116', rand(0.04, 0.08)],
      ['104,136,82', rand(0.03, 0.07)]
    ]);

    const g = octx.createRadialGradient(p.x, cy, 0, p.x, cy, r);
    g.addColorStop(0, `rgba(${palette[0]},${palette[1]})`);
    g.addColorStop(0.6, `rgba(${palette[0]},${palette[1] * 0.45})`);
    g.addColorStop(1, `rgba(${palette[0]},0)`);
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(p.x, cy, r, 0, Math.PI * 2);
    octx.fill();
  }
}

/* ---------------------------------
   Brush-like ridge outline
   起笔/收笔有粗细变化
---------------------------------- */
function drawBrushRidgeStroke(m) {
  const pts = m.ridge;
  if (pts.length < 2) return;

  octx.save();
  octx.lineCap = 'round';
  octx.lineJoin = 'round';

  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const t = i / (pts.length - 1);

    // 起笔细，中段厚，收笔细
    const taper = Math.sin(t * Math.PI);
    const w = 0.55 + taper * (1.2 + (1 - m.depth) * 0.5);

    octx.beginPath();
    octx.moveTo(p0.x, p0.y);
    octx.lineTo(p1.x, p1.y);
    octx.strokeStyle = `rgba(18,18,16,${0.28 - m.depth * 0.08})`;
    octx.lineWidth = w;
    octx.stroke();

    // 轻微侧锋墨痕
    if (rnd() < 0.72) {
      octx.beginPath();
      octx.moveTo(p0.x + rand(-1.5, 1.5), p0.y + rand(-1.5, 1.5));
      octx.lineTo(p1.x + rand(-1.8, 1.8), p1.y + rand(-1.8, 1.8));
      octx.strokeStyle = `rgba(22,20,18,${0.06 - m.depth * 0.01})`;
      octx.lineWidth = w * rand(0.8, 1.3);
      octx.stroke();
    }
  }

  // 飞白
  for (let i = 1; i < pts.length; i += 3) {
    if (rnd() < 0.45) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      octx.beginPath();
      octx.moveTo(lerp(p0.x, p1.x, 0.18), lerp(p0.y, p1.y, 0.18));
      octx.lineTo(lerp(p0.x, p1.x, 0.88), lerp(p0.y, p1.y, 0.88));
      octx.strokeStyle = 'rgba(245,238,224,0.08)';
      octx.lineWidth = rand(0.25, 0.7);
      octx.stroke();
    }
  }

  octx.restore();
}

function drawContourLines(m) {
  const layerCount = randi(6, 10);
  for (let k = 1; k <= layerCount; k++) {
    const ratio = k / (layerCount + 1);
    const line = [];

    for (let i = 0; i < m.ridge.length; i++) {
      const p = m.ridge[i];
      const t = i / (m.ridge.length - 1);
      const n = Noise.noise(t * 4.2, k * 0.45 + m.seed * 0.011);
      const n2 = Noise.noise(t * 10.0, k * 0.12 + m.seed * 0.017);
      const bend = Math.sin(t * Math.PI) * 14;

      const footY = m.footPoints[m.footPoints.length - 1 - i].y;

      line.push({
        x: p.x + (n2 - 0.5) * 5,
        y: lerp(p.y + 12, footY - 8, ratio) - bend * (1 - ratio) * 0.78 + (n - 0.5) * 8
      });
    }

    octx.save();
    drawPolyline(octx, line);
    octx.strokeStyle = `rgba(30,30,26,${0.12 + (1 - ratio) * 0.05})`;
    octx.lineWidth = 0.95;
    octx.stroke();
    octx.restore();
  }
}

function drawRuggedTexture(m) {
  octx.save();

  for (let i = 2; i < m.ridge.length - 2; i += 2) {
    const p = m.ridge[i];
    const density = mapVal(m.depth, 0, 1, 1.0, 0.55);
    if (rnd() > 0.7 * density) continue;

    const count = randi(2, 5);
    for (let j = 0; j < count; j++) {
      const len = rand(12, 34);
      const ox = rand(-8, 8);
      const oy = rand(8, 55);
      const a = rand(Math.PI * 0.16, Math.PI * 0.48);

      octx.beginPath();
      octx.moveTo(p.x + ox, p.y + oy);
      octx.quadraticCurveTo(
        p.x + ox + Math.cos(a) * len * 0.35,
        p.y + oy + len * 0.35,
        p.x + ox + Math.cos(a) * len,
        p.y + oy + len * 0.95
      );
      octx.strokeStyle = `rgba(24,24,20,${rand(0.07, 0.16)})`;
      octx.lineWidth = rand(0.45, 1.2);
      octx.stroke();
    }
  }

  for (let i = 3; i < m.ridge.length - 3; i += 3) {
    const p = m.ridge[i];
    if (rnd() > 0.52) continue;
    const y = p.y + rand(18, 66);
    const half = rand(5, 18);
    octx.beginPath();
    octx.moveTo(p.x - half, y);
    octx.lineTo(p.x + half, y + rand(-2, 2));
    octx.strokeStyle = `rgba(28,28,24,${rand(0.04, 0.09)})`;
    octx.lineWidth = rand(0.45, 0.9);
    octx.stroke();
  }

  octx.restore();
}

function drawMossDots(m) {
  octx.save();
  for (let i = 0; i < m.ridge.length; i += 2) {
    const p = m.ridge[i];
    const count = randi(2, 6);
    for (let j = 0; j < count; j++) {
      const x = p.x + rand(-10, 10);
      const y = p.y + rand(12, 46);
      const r = rand(0.7, 2.0);
      const palette = rnd() < 0.72
        ? ['22,22,18', rand(0.06, 0.16)]
        : ['82,96,48', rand(0.02, 0.06)];
      octx.fillStyle = `rgba(${palette[0]},${palette[1]})`;
      octx.beginPath();
      octx.arc(x, y, r, 0, Math.PI * 2);
      octx.fill();
    }
  }
  octx.restore();
}

function drawMistBand(m) {
  const p = m.ridge[Math.floor(m.ridge.length * rand(0.25, 0.75))];
  if (!p) return;

  const r = rand(44, 100);
  const cy = p.y + rand(16, 54);
  const g = octx.createRadialGradient(p.x, cy, 0, p.x, cy, r);
  g.addColorStop(0, 'rgba(245,240,235,0.17)');
  g.addColorStop(0.5, 'rgba(245,240,235,0.08)');
  g.addColorStop(1, 'rgba(245,240,235,0)');
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(p.x, cy, r, 0, Math.PI * 2);
  octx.fill();
}

function drawSmallHouse(m) {
  if (rnd() > 0.18) return;
  const p = m.ridge[Math.floor(m.ridge.length * rand(0.2, 0.8))];
  if (!p) return;

  const x = p.x + rand(-18, 18);
  const y = p.y + rand(34, 58);
  const s = rand(7, 11);

  octx.save();
  octx.fillStyle = 'rgba(246,242,236,0.80)';
  octx.strokeStyle = 'rgba(40,36,30,0.35)';
  octx.lineWidth = 0.8;

  octx.beginPath();
  octx.rect(x - s * 0.8, y - s * 0.5, s * 1.6, s);
  octx.fill();
  octx.stroke();

  octx.beginPath();
  octx.moveTo(x - s, y - s * 0.45);
  octx.lineTo(x, y - s * 1.05);
  octx.lineTo(x + s, y - s * 0.45);
  octx.strokeStyle = 'rgba(28,26,24,0.45)';
  octx.lineWidth = 1.0;
  octx.stroke();

  octx.restore();
}

/* ---------------------------------
   Trees
---------------------------------- */
function drawPineTree(x, y, scale, inkAlpha, greenAlpha) {
  const trunkH = rand(12, 22) * scale;
  const lean = rand(-2.5, 2.5) * scale;

  octx.save();

  octx.strokeStyle = `rgba(20,20,18,${inkAlpha})`;
  octx.lineWidth = rand(0.9, 1.6) * scale;
  octx.beginPath();
  octx.moveTo(x, y);
  octx.lineTo(x + lean, y + trunkH);
  octx.stroke();

  const crownTop = y - rand(6, 14) * scale;
  const layers = randi(4, 6);

  for (let i = 0; i < layers; i++) {
    const ly = crownTop + i * rand(4.2, 7.0) * scale;
    const hw = rand(8, 18) * scale * (1 - i / (layers + 1) * 0.15);
    const lift = rand(1.2, 3.2) * scale;

    octx.beginPath();
    octx.moveTo(x - hw, ly);
    octx.lineTo(x, ly - lift);
    octx.lineTo(x + hw, ly);
    octx.strokeStyle = `rgba(18,18,16,${inkAlpha * rand(0.85, 1.15)})`;
    octx.lineWidth = rand(0.7, 1.25) * scale;
    octx.stroke();

    if (greenAlpha > 0) {
      octx.beginPath();
      octx.moveTo(x - hw * 0.82, ly + 1);
      octx.lineTo(x, ly - lift * 0.5);
      octx.lineTo(x + hw * 0.82, ly + 1);
      const palette = randChoice([
        `rgba(64,100,78,${greenAlpha * rand(0.75, 1.0)})`,
        `rgba(76,112,84,${greenAlpha * rand(0.6, 0.9)})`,
        `rgba(56,86,96,${greenAlpha * rand(0.55, 0.85)})`
      ]);
      octx.strokeStyle = palette;
      octx.lineWidth = rand(0.55, 1.0) * scale;
      octx.stroke();
    }
  }

  octx.restore();
}

function drawDotLeafTree(x, y, scale, inkAlpha, greenAlpha) {
  octx.save();

  const trunkH = rand(8, 15) * scale;
  octx.strokeStyle = `rgba(22,22,18,${inkAlpha})`;
  octx.lineWidth = rand(0.8, 1.4) * scale;
  octx.beginPath();
  octx.moveTo(x, y);
  octx.lineTo(x + rand(-2, 2) * scale, y + trunkH);
  octx.stroke();

  const crownW = rand(12, 24) * scale;
  const crownH = rand(10, 20) * scale;

  for (let i = 0; i < randi(18, 30); i++) {
    const dx = rand(-crownW, crownW);
    const dy = rand(-crownH, 2 * scale);
    const r = rand(0.8, 2.6) * scale;
    octx.fillStyle = `rgba(20,20,18,${rand(inkAlpha * 0.65, inkAlpha * 1.08)})`;
    octx.beginPath();
    octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    octx.fill();
  }

  for (let i = 0; i < randi(6, 14); i++) {
    const dx = rand(-crownW * 0.9, crownW * 0.9);
    const dy = rand(-crownH * 0.9, 0);
    const r = rand(0.7, 2.1) * scale;
    const palette = randChoice([
      `rgba(72,104,64,${greenAlpha * rand(0.65, 1.0)})`,
      `rgba(86,118,72,${greenAlpha * rand(0.55, 0.95)})`,
      `rgba(66,96,88,${greenAlpha * rand(0.5, 0.9)})`
    ]);
    octx.fillStyle = palette;
    octx.beginPath();
    octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
}

function drawTreeCluster(x, y, depth = 0.5) {
  const bigScale = mapVal(1 - depth, 0, 1, 0.8, 1.55);
  const inkAlpha = mapVal(1 - depth, 0, 1, 0.10, 0.24);
  const greenAlpha = mapVal(1 - depth, 0, 1, 0.03, 0.10);

  const treeType = rnd() < 0.58 ? 'pine' : 'dot';
  if (treeType === 'pine') {
    drawPineTree(
      x + rand(-2, 2),
      y,
      bigScale * rand(0.92, 1.15),
      inkAlpha * rand(0.9, 1.1),
      greenAlpha * rand(0.9, 1.15)
    );
  } else {
    drawDotLeafTree(
      x + rand(-2, 2),
      y,
      bigScale * rand(0.9, 1.18),
      inkAlpha * rand(0.88, 1.12),
      greenAlpha * rand(0.85, 1.2)
    );
  }
}

function drawTreeBelts(m) {
  const count = clamp(Math.floor(m.ridge.length / 6), 5, 15);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(mapVal(i, 0, Math.max(1, count - 1), 5, m.ridge.length - 6));
    const p = m.ridge[idx];
    const x = p.x + rand(-7, 7);
    const y = p.y + rand(10, 34);

    const group = randi(1, 3);
    for (let g = 0; g < group; g++) {
      drawTreeCluster(
        x + rand(-10, 10),
        y + rand(-4, 6),
        m.depth + rand(-0.08, 0.08)
      );
    }
  }
}

/* ---------------------------------
   Water and foreground
---------------------------------- */
function drawWaterAndReflections(mountains) {
  const waterY = oCanvas.height * 0.84;

  octx.save();
  octx.fillStyle = 'rgba(104,128,122,0.07)';
  octx.beginPath();
  octx.moveTo(0, waterY);
  octx.quadraticCurveTo(oCanvas.width * 0.25, waterY - 10, oCanvas.width * 0.52, waterY + 7);
  octx.quadraticCurveTo(oCanvas.width * 0.78, waterY + 15, oCanvas.width, waterY - 2);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();
  octx.restore();

  for (const m of mountains) {
    for (let i = 0; i < m.ridge.length; i += 4) {
      const p = m.ridge[i];
      if (p.y > waterY) continue;
      const ry = waterY + (waterY - p.y) * 0.18;
      const len = rand(10, 32);
      octx.beginPath();
      octx.moveTo(p.x - len * 0.5, ry);
      octx.lineTo(p.x + len * 0.5, ry + rand(-1.2, 1.2));
      octx.strokeStyle = `rgba(74,100,96,${rand(0.04, 0.09)})`;
      octx.lineWidth = rand(0.45, 1.0);
      octx.stroke();
    }
  }

  for (let i = 0; i < 14; i++) {
    const y = rand(waterY, oCanvas.height * 0.96);
    octx.beginPath();
    octx.moveTo(0, y);
    for (let x = 0; x <= oCanvas.width; x += 18) {
      octx.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * rand(1, 3));
    }
    octx.strokeStyle = 'rgba(70,88,86,0.08)';
    octx.lineWidth = rand(0.35, 0.8);
    octx.stroke();
  }
}

function drawForegroundDetails() {
  octx.save();

  octx.fillStyle = 'rgba(80,88,70,0.13)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.88);
  octx.quadraticCurveTo(oCanvas.width * 0.22, oCanvas.height * 0.80, oCanvas.width * 0.38, oCanvas.height * 0.89);
  octx.quadraticCurveTo(oCanvas.width * 0.58, oCanvas.height * 0.95, oCanvas.width * 0.74, oCanvas.height * 0.87);
  octx.quadraticCurveTo(oCanvas.width * 0.88, oCanvas.height * 0.81, oCanvas.width, oCanvas.height * 0.91);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  for (let i = 0; i < 240; i++) {
    const x = rand(0, oCanvas.width);
    const y = rand(oCanvas.height * 0.78, oCanvas.height * 0.98);
    const r = rand(0.5, 1.8);
    if (rnd() < 0.74) {
      octx.fillStyle = `rgba(22,22,18,${rand(0.04, 0.13)})`;
    } else {
      octx.fillStyle = `rgba(112,95,62,${rand(0.02, 0.06)})`;
    }
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }

  const treeBaseY = oCanvas.height * 0.865;
  for (let i = 0; i < 10; i++) {
    const x = mapVal(i, 0, 9, 35, oCanvas.width - 35) + rand(-12, 12);
    const group = randi(1, 3);
    for (let g = 0; g < group; g++) {
      drawTreeCluster(
        x + rand(-12, 12),
        treeBaseY + rand(-10, 8),
        rand(0.05, 0.25)
      );
    }
  }

  octx.restore();
}

/* ---------------------------------
   Main render
---------------------------------- */
function renderLandscape() {
  resetOutputScene();

  const brushStrokes = strokes
    .filter(s => s.tool === 'brush' && s.points.length > 1)
    .map(s => ({
      ...s,
      points: smoothPoints(simplifyPoints(s.points, 2), 2)
    }));

  if (brushStrokes.length === 0) {
    setStatus('画卷已重置，等待新的山水勾勒');
    return;
  }

  // 重要：
  // 这里不再“按远近排序”
  // 直接按照用户绘制顺序渲染
  // 因为 canvas 后画的会盖住前画的，所以为了“先画的在上层”，
  // 我们要反过来画：最后画的先渲染，最早画的最后渲染
  const ordered = brushStrokes.map((s, i) => ({
    stroke: s,
    idx: i
  }));

  const mountains = ordered.map((item, i) =>
    makeMountainFromStroke(item.stroke, i, ordered.length)
  );

  // 先画后面的，最后画最早画的
  const renderOrder = mountains.slice().reverse();

  for (const m of renderOrder) {
    drawMountainBody(m);
    drawBlueGreenLayers(m);
  }

  for (const m of renderOrder) {
    drawContourLines(m);
    drawRuggedTexture(m);
    drawMossDots(m);
    drawTreeBelts(m);
    drawBrushRidgeStroke(m);
    drawMistBand(m);
    drawSmallHouse(m);
  }

  drawWaterAndReflections(renderOrder);
  drawForegroundDetails();

  setStatus('青绿山水正在随笔生长');
}

/* ---------------------------------
   Bind
---------------------------------- */
function bindEvents() {
  if (brushBtn) {
    brushBtn.addEventListener('click', () => {
      currentTool = 'brush';
      brushBtn.classList.add('active');
      if (eraserBtn) eraserBtn.classList.remove('active');
    });
  }

  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      currentTool = 'eraser';
      eraserBtn.classList.add('active');
      if (brushBtn) brushBtn.classList.remove('active');
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearAll);
  }

  iCanvas.addEventListener('mousedown', startDraw);
  iCanvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', endDraw);

  iCanvas.addEventListener('touchstart', startDraw, { passive: false });
  iCanvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', endDraw);
}

/* ---------------------------------
   Init
---------------------------------- */
function initApp() {
  setupCanvas();
  bindEvents();
  setStatus('已进入青绿山水画境，开始勾勒山势');
}

initApp();
