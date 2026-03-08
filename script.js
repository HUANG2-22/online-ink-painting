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
  s: 1234, m: 999979 * 999983,
  seed(x) { 
    let y = (typeof x === 'string' ? x.length * 12345 : x) % this.m;
    this.s = y || 1234; 
    for (let i = 0; i < 10; i++) this.next();
  },
  next() { this.s = (this.s * this.s) % this.m; return this.s / this.m; }
};

function rnd() { return PRNG.next(); }
function rand(min, max) { return min + (max - min) * rnd(); }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function randChoice(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mapVal(v, a0, a1, b0, b1) { return b0 + (b1 - b0) * ((v - a0) / (a1 - a0)); }
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

/* ---------------------------------
   Perlin Noise
---------------------------------- */
const Noise = new (function () {
  const PERLIN_SIZE = 4095;
  let perlin = null;
  this.noiseSeed = function (seed) {
    perlin = new Array(PERLIN_SIZE + 1);
    for (let i = 0; i <= PERLIN_SIZE; i++) perlin[i] = rnd();
  };
  this.noise = function (x, y = 0) {
    if (!perlin) this.noiseSeed(123);
    let xi = Math.floor(Math.abs(x)) & PERLIN_SIZE;
    let yi = Math.floor(Math.abs(y)) & PERLIN_SIZE;
    let xf = Math.abs(x) - Math.floor(Math.abs(x));
    let u = xf * xf * (3 - 2 * xf);
    return lerp(perlin[xi], perlin[(xi + 1) & PERLIN_SIZE], u);
  };
})();

/* ---------------------------------
   Basic Canvas Helpers
---------------------------------- */
function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}

function simplifyPoints(points, step = 2) {
  return points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0);
}

function smoothPoints(points) {
  if (points.length < 3) return points;
  let out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    out.push({
      x: (points[i - 1].x + points[i].x * 2 + points[i + 1].x) / 4,
      y: (points[i - 1].y + points[i].y * 2 + points[i + 1].y) / 4
    });
  }
  out.push(points[points.length - 1]);
  return out;
}

function polygonPath(ctx, pts) {
  if (!pts || pts.length < 3) return false;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  return true;
}

/* ---------------------------------
   Scene Drawing
---------------------------------- */
function setupCanvas() {
  PRNG.seed('qinglu-full-v3');
  ictx.fillStyle = '#f4eee1';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);
  resetOutputScene();
}

function resetOutputScene() {
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);
  const bg = octx.createLinearGradient(0, 0, 0, oCanvas.height);
  bg.addColorStop(0, '#c8a672'); bg.addColorStop(0.42, '#d8bb8d'); bg.addColorStop(1, '#ead3ad');
  octx.fillStyle = bg;
  octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
  
  // 纸张纹理
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * oCanvas.width, y = rnd() * oCanvas.height;
    octx.fillStyle = `rgba(100,80,50,${rnd() * 0.03})`;
    octx.fillRect(x, y, 1, 1);
  }
}

/* ---------------------------------
   Trees & Clusters
---------------------------------- */
function drawPineTree(x, y, scale, inkA, greenA) {
  octx.save();
  octx.strokeStyle = `rgba(20,20,18,${inkA})`;
  octx.lineWidth = 1.2 * scale;
  octx.beginPath(); octx.moveTo(x, y); octx.lineTo(x + rand(-2, 2), y + 15 * scale); octx.stroke();
  
  for (let i = 0; i < 5; i++) {
    const ly = y - 5 * scale + i * 6 * scale;
    const hw = (15 - i * 2) * scale;
    octx.beginPath();
    octx.moveTo(x - hw, ly); octx.lineTo(x, ly - 3 * scale); octx.lineTo(x + hw, ly);
    octx.strokeStyle = `rgba(18,18,16,${inkA})`;
    octx.stroke();
    if (greenA > 0) {
      octx.strokeStyle = `rgba(60,90,70,${greenA})`;
      octx.stroke();
    }
  }
  octx.restore();
}

function drawDotTree(x, y, scale, inkA, greenA) {
  octx.save();
  octx.fillStyle = `rgba(20,20,18,${inkA})`;
  for (let i = 0; i < 15; i++) {
    octx.beginPath();
    octx.arc(x + rand(-10, 10) * scale, y + rand(-15, 0) * scale, rand(1, 3) * scale, 0, Math.PI * 2);
    octx.fill();
  }
  octx.restore();
}

/* ---------------------------------
   Mountain Details
---------------------------------- */
function drawMountainBody(m) {
  if (!m) return;
  const ys = m.poly.map(p => p.y).filter(Number.isFinite);
  const ty = Math.min(...ys), by = Math.max(...ys);
  if (by <= ty) return;

  octx.save();
  if (polygonPath(octx, m.poly)) {
    const g = octx.createLinearGradient(0, ty, 0, by);
    g.addColorStop(0, `rgba(40,70,110,${0.2 + (1-m.depth)*0.1})`);
    g.addColorStop(0.7, `rgba(80,120,80,0.15)`);
    g.addColorStop(1, `rgba(100,100,80,0.05)`);
    octx.fillStyle = g;
    octx.fill();
  }
  octx.restore();
}

function drawMountainDecor(m) {
  // 1. 皴法纹理
  m.ridge.forEach((p, i) => {
    if (i % 6 === 0 && rnd() < 0.4) {
      octx.strokeStyle = `rgba(20,20,15,0.08)`;
      octx.beginPath();
      octx.moveTo(p.x, p.y + 10);
      octx.lineTo(p.x + rand(-5, 5), p.y + 40);
      octx.stroke();
    }
  });

  // 2. 苔点
  m.ridge.forEach((p, i) => {
    if (i % 4 === 0 && rnd() < 0.3) {
      octx.fillStyle = `rgba(10,20,10,0.15)`;
      octx.beginPath();
      octx.arc(p.x + rand(-5, 5), p.y + rand(5, 20), rand(1, 2), 0, Math.PI * 2);
      octx.fill();
    }
  });

  // 3. 树群 (核心补回部分)
  const treeCount = Math.floor(m.ridge.length / 8);
  for (let i = 0; i < treeCount; i++) {
    const p = m.ridge[randi(0, m.ridge.length - 1)];
    const x = p.x + rand(-5, 5);
    const y = p.y + rand(15, 30);
    const depthScale = mapVal(1 - m.depth, 0, 1, 0.6, 1.2);
    if (rnd() < 0.5) drawPineTree(x, y, depthScale, 0.2, 0.1);
    else drawDotTree(x, y, depthScale, 0.2, 0.1);
  }
}

function makeMountainFromStroke(stroke, index, total) {
  let pts = smoothPoints(simplifyPoints(stroke.points, 2));
  if (pts.length < 2) return null;
  
  const depth = index / Math.max(1, total - 1);
  const ridge = pts.map((p, i) => {
    const n = Noise.noise(p.x * 0.02, index);
    return { x: p.x, y: p.y - n * 30 };
  });
  const foot = ridge.map(p => ({ x: p.x, y: p.y + 120 + rand(0, 20) })).reverse();
  
  return { ridge, foot, poly: ridge.concat(foot), depth };
}

/* ---------------------------------
   Main Logic
---------------------------------- */
function renderLandscape() {
  octx.globalCompositeOperation = 'source-over';
  resetOutputScene();
  
  const brushStrokes = strokes.filter(s => s.tool === 'brush');
  const ordered = brushStrokes.map((s, i) => ({ s, y: s.points[0].y })).sort((a, b) => a.y - b.y);
  const mountains = ordered.map((it, i) => makeMountainFromStroke(it.s, i, ordered.length)).filter(Boolean);

  mountains.forEach(m => {
    drawMountainBody(m);
    drawMountainDecor(m);
    
    // 轮廓线
    octx.save();
    octx.beginPath();
    octx.moveTo(m.ridge[0].x, m.ridge[0].y);
    m.ridge.forEach(p => octx.lineTo(p.x, p.y));
    octx.strokeStyle = `rgba(20,20,15,${0.2 - m.depth * 0.1})`;
    octx.lineWidth = 1;
    octx.stroke();
    octx.restore();
  });
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderLandscape, 45);
}

// 事件绑定
function bindEvents() {
  const start = (e) => { e.preventDefault(); isDrawing = true; currentStroke = { tool: currentTool, points: [getPos(e)] }; };
  const move = (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    ictx.strokeStyle = currentTool === 'brush' ? '#141414' : '#f4eee1';
    ictx.lineWidth = currentTool === 'brush' ? 3 : 20;
    ictx.lineTo(pos.x, pos.y); ictx.stroke();
    currentStroke.points.push(pos);
  };
  const end = () => {
    if (isDrawing && currentStroke.points.length > 1) {
      if (currentTool === 'brush') strokes.push(currentStroke);
      else strokes = strokes.filter(s => !currentStroke.points.some(ep => dist(s.points[0], ep) < 30));
      scheduleRender();
    }
    isDrawing = false;
  };

  iCanvas.addEventListener('mousedown', start);
  iCanvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  iCanvas.addEventListener('touchstart', start, {passive:false});
  iCanvas.addEventListener('touchmove', move, {passive:false});
  window.addEventListener('touchend', end);
  
  brushBtn.onclick = () => { currentTool = 'brush'; brushBtn.classList.add('active'); eraserBtn.classList.remove('active'); };
  eraserBtn.onclick = () => { currentTool = 'eraser'; eraserBtn.classList.add('active'); brushBtn.classList.remove('active'); };
  clearBtn.onclick = () => { strokes = []; setupCanvas(); };
}

setupCanvas();
bindEvents();
