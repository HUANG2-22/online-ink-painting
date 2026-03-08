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
   PRNG & Math Utils
---------------------------------- */
const PRNG = {
  s: 1234,
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
    this.s = this.hash(x) % this.m;
    for (let i = 0; i < 10; i++) this.next();
  },
  next() {
    this.s = (this.s * this.s) % this.m;
    return this.s / this.m;
  }
};

function rnd() { return PRNG.next(); }
function rand(min, max) { return min + (max - min) * rnd(); }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function randChoice(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function mapVal(v, a0, a1, b0, b1) { return b0 + (b1 - b0) * ((v - a0) / (a1 - a0)); }
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

/* ---------------------------------
   Perlin Noise
---------------------------------- */
const Noise = new (function () {
  const PERLIN_SIZE = 4095;
  let perlin_octaves = 4;
  let perlin_amp_falloff = 0.5;
  let perlin = null;
  const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));

  this.noiseSeed = function (seed) {
    let m = 4294967296, a = 1664525, c = 1013904223, z = seed >>> 0;
    perlin = new Array(PERLIN_SIZE + 1);
    for (let i = 0; i < PERLIN_SIZE + 1; i++) {
      z = (a * z + c) % m;
      perlin[i] = z / m;
    }
  };

  this.noise = function (x, y = 0, z = 0) {
    if (perlin == null) this.noiseSeed(Date.now());
    x = Math.abs(x); y = Math.abs(y); z = Math.abs(z);
    let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    let r = 0, ampl = 0.5;
    for (let o = 0; o < perlin_octaves; o++) {
      let of = xi + (yi << 4) + (zi << 8);
      let rxf = scaled_cosine(xf), ryf = scaled_cosine(yf);
      let n1 = perlin[of & PERLIN_SIZE];
      n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
      let n2 = perlin[(of + 16) & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + 17) & PERLIN_SIZE] - n2);
      n1 += ryf * (n2 - n1);
      r += n1 * ampl;
      ampl *= perlin_amp_falloff;
      xi <<= 1; xf *= 2; yi <<= 1; yf *= 2;
      if (xf >= 1.0) { xi++; xf--; }
      if (yf >= 1.0) { yi++; yf--; }
    }
    return r;
  };
})();

/* ---------------------------------
   Helper Utils
---------------------------------- */
function setStatus(text) { if (statusTag) statusTag.innerText = text; }
function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}
function avgY(points) { return points.reduce((s, p) => s + p.y, 0) / Math.max(1, points.length); }
function simplifyPoints(points, step = 2) { return points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0); }
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
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  const out = [];
  for (let k = 0; k < count; k++) {
    const target = (k / (count - 1)) * total;
    let acc = 0, idx = 0;
    while (idx < points.length - 1 && acc + dist(points[idx], points[idx + 1]) < target) {
      acc += dist(points[idx], points[idx + 1]);
      idx++;
    }
    const next = points[idx + 1] || points[idx];
    const d = dist(points[idx], next);
    const local = d === 0 ? 0 : (target - acc) / d;
    out.push({ x: lerp(points[idx].x, next.x, local), y: lerp(points[idx].y, next.y, local) });
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

/* ---------------------------------
   Scene Setup
---------------------------------- */
function setupCanvas() {
  PRNG.seed('qinglu-fixed-v4');
  Noise.noiseSeed(456789);
  ictx.fillStyle = '#f4eee1';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);
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
    const x = rnd() * oCanvas.width, y = rnd() * oCanvas.height;
    const c = 90 + rnd() * 45;
    octx.fillStyle = `rgba(${c},${c * 0.7},${c * 0.35},${rnd() * 0.045})`;
    octx.fillRect(x, y, 1, 1);
  }
}

function drawAtmosphericMounts() {
  for (let layer = 0; layer < 4; layer++) {
    const baseY = 100 + layer * 64, pts = [];
    for (let i = 0; i <= 28; i++) {
      const x = mapVal(i, 0, 28, 0, oCanvas.width);
      const n = Noise.noise(i * 0.18, layer * 0.27);
      const y = baseY - n * (36 - layer * 4) - Math.sin(i / 28 * Math.PI * 2) * 8;
      pts.push({ x, y });
    }
    const poly = pts.concat([{ x: oCanvas.width, y: oCanvas.height * 0.72 }, { x: 0, y: oCanvas.height * 0.72 }]);
    octx.fillStyle = `rgba(88,84,78,${0.05 + layer * 0.016})`;
    polygonPath(octx, poly);
    octx.fill();
  }
}

function drawGroundMist() {
  for (let i = 0; i < 9; i++) {
    const cx = rand(40, oCanvas.width - 40), cy = rand(oCanvas.height * 0.42, oCanvas.height * 0.8), r = rand(50, 130);
    const g = octx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(245,240,235,0.11)');
    g.addColorStop(1, 'rgba(245,240,235,0)');
    octx.fillStyle = g;
    octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI * 2); octx.fill();
  }
}

/* ---------------------------------
   Drawing Logic
---------------------------------- */
function startDraw(e) {
  e.preventDefault(); isDrawing = true;
  const pos = getPos(e);
  ictx.beginPath(); ictx.moveTo(pos.x, pos.y);
  currentStroke = { tool: currentTool, points: [pos] };
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault(); const pos = getPos(e);
  ictx.strokeStyle = currentTool === 'brush' ? '#141414' : '#f4eee1';
  ictx.lineWidth = currentTool === 'brush' ? 4 : 18;
  ictx.lineTo(pos.x, pos.y); ictx.stroke();
  currentStroke.points.push(pos);
}

function endDraw() {
  if (!isDrawing) return; isDrawing = false;
  if (currentStroke && currentStroke.points.length > 1) {
    if (currentStroke.tool === 'eraser') eraseByStroke(currentStroke);
    else strokes.push(currentStroke);
  }
  scheduleRender();
}

function eraseByStroke(eraserStroke) {
  strokes = strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.filter(p => !eraserStroke.points.some(ep => dist(p, ep) < 20))
  })).filter(s => s.points.length > 1);
}

function clearAll() {
  strokes = []; setupCanvas();
  setStatus('画卷已重置，等待新的山水勾勒');
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderLandscape, 45);
}

/* ---------------------------------
   Mountain Engine
---------------------------------- */
function makeMountainFromStroke(stroke, index, total) {
  let pts = smoothPoints(simplifyPoints(stroke.points, 2), 2);
  if (pts.length < 2) return null;
  pts = resamplePolyline(pts, 92);
  const meanY = avgY(pts), depth = index / Math.max(1, total - 1);
  const seed = Math.floor(meanY * 19 + pts[0].x * 5 + index * 131);
  const ridge = pts.map((p, i) => {
    const t = i / (pts.length - 1);
    const n = Noise.noise(t * 3.0, seed * 0.01);
    return { x: p.x + (n - 0.5) * 10, y: p.y - (n - 0.5) * mapVal(1 - depth, 0, 1, 10, 42) };
  });
  const footPoints = ridge.map((p, i) => {
    const t = i / (ridge.length - 1);
    return { x: p.x, y: p.y + mapVal(depth, 0, 1, 128, 88) + Math.sin(t * Math.PI) * 5 };
  }).reverse();
  return { ridge, footPoints, poly: ridge.concat(footPoints), meanY, depth, seed };
}

function drawMountainBody(m) {
  if (!m) return;
  const topY = Math.min(...m.ridge.map(p => p.y)), bottomY = Math.max(...m.footPoints.map(p => p.y));
  
  // 主体填充 (修复: 使用 fill 代替 clip+fillRect)
  const g = octx.createLinearGradient(0, topY, 0, bottomY + 33);
  g.addColorStop(0.11, `rgba(42,78,122,${0.26 + (1 - m.depth) * 0.09})`);
  g.addColorStop(0.68, `rgba(104,146,86,${0.12 + (1 - m.depth) * 0.03})`);
  g.addColorStop(1.00, `rgba(110,108,80,0.03)`);
  octx.fillStyle = g;
  polygonPath(octx, m.poly); octx.fill();

  // 顶部罩染
  const topColor = randChoice([['34,74,128', 0.4], ['52,102,96', 0.12]]);
  const topWash = octx.createLinearGradient(0, topY, 0, bottomY);
  topWash.addColorStop(0.0, `rgba(${topColor[0]},${topColor[1]})`);
  topWash.addColorStop(0.5, `rgba(${topColor[0]},0.01)`);
  octx.fillStyle = topWash;
  polygonPath(octx, m.poly); octx.fill();
}

function drawBlueGreenLayers(m) {
  if (!m) return;
  [{ off: 0, a: 0.18, c: '48,90,124' }, { off: 20, a: 0.12, c: '112,146,84' }].forEach(ld => {
    const layer = m.ridge.map((p, i) => ({ x: p.x, y: p.y + ld.off + (Noise.noise(i * 0.1, m.seed) - 0.5) * 10 }));
    const foot = layer.map(p => ({ x: p.x, y: p.y + 60 })).reverse();
    const poly = layer.concat(foot);
    const gg = octx.createLinearGradient(0, layer[0].y, 0, foot[0].y);
    gg.addColorStop(0, `rgba(${ld.c},${ld.a})`);
    gg.addColorStop(1, `rgba(${ld.c},0)`);
    octx.fillStyle = gg;
    polygonPath(octx, poly); octx.fill();
  });
}

function drawBrushRidgeStroke(m) {
  if (!m) return;
  m.ridge.forEach((p, i) => {
    if (i === 0) return;
    const t = i / m.ridge.length;
    octx.beginPath();
    octx.moveTo(m.ridge[i - 1].x, m.ridge[i - 1].y);
    octx.lineTo(p.x, p.y);
    octx.strokeStyle = `rgba(18,18,16,${0.28 - m.depth * 0.08})`;
    octx.lineWidth = 0.5 + Math.sin(t * Math.PI) * (1.2 + (1 - m.depth) * 0.5);
    octx.stroke();
  });
}

// ... 辅助装饰函数 (保持原逻辑但增加安全检查) ...
function drawContourLines(m) {
  if(!m) return;
  for (let k = 1; k <= 6; k++) {
    const ratio = k / 7, line = m.ridge.map((p, i) => ({
      x: p.x, y: lerp(p.y + 10, m.footPoints[m.footPoints.length - 1 - i].y - 5, ratio)
    }));
    octx.beginPath(); octx.moveTo(line[0].x, line[0].y);
    line.forEach(p => octx.lineTo(p.x, p.y));
    octx.strokeStyle = `rgba(30,30,26,${0.08})`; octx.stroke();
  }
}

/* ---------------------------------
   Render Loop
---------------------------------- */
function renderLandscape() {
  resetOutputScene();
  const brushStrokes = strokes.filter(s => s.tool === 'brush' && s.points.length > 1);
  if (brushStrokes.length === 0) return setStatus('画卷已重置');

  const mountains = brushStrokes.map((s, i) => makeMountainFromStroke(s, i, brushStrokes.length)).filter(m => m !== null);
  
  // 按照从远到近绘制 (最后绘制的 Stroke 通常在最前)
  mountains.forEach(m => {
    drawMountainBody(m);
    drawBlueGreenLayers(m);
    drawContourLines(m);
    drawBrushRidgeStroke(m);
  });

  setStatus('青绿山水正在随笔生长');
}

/* ---------------------------------
   Init
---------------------------------- */
function bindEvents() {
  const start = (e) => startDraw(e);
  const move = (e) => draw(e);
  const end = () => endDraw();
  
  iCanvas.addEventListener('mousedown', start);
  iCanvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  iCanvas.addEventListener('touchstart', start, { passive: false });
  iCanvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
  
  brushBtn.onclick = () => { currentTool = 'brush'; brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); };
  eraserBtn.onclick = () => { currentTool = 'eraser'; eraserBtn.classList.add('active'); brushBtn.classList.remove('active'); };
  clearBtn.onclick = clearAll;
}

setupCanvas(); bindEvents();
setStatus('已进入青绿山水画境，开始勾勒山势');
