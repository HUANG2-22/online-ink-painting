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

// ---------------------------------
// PRNG
// ---------------------------------
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

// ---------------------------------
// Perlin Noise
// ---------------------------------
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

// ---------------------------------
// Utilities
// ---------------------------------
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

function resamplePolyline(points, count = 64) {
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
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

function drawPolyline(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

function blobStroke(ctx, pts, opts = {}) {
  if (pts.length < 2) return;
  const width = opts.width ?? 4;
  const color = opts.color ?? 'rgba(40,40,40,0.18)';
  const noiseAmp = opts.noiseAmp ?? 0.35;

  const left = [];
  const right = [];
  const seed = rand(0, 999);

  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const taper = Math.sin((i / Math.max(1, pts.length - 1)) * Math.PI);
    const w = width * (0.55 + taper * 0.45) *
      (1 - noiseAmp + Noise.noise(i * 0.15, seed) * noiseAmp);

    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------
// Scene setup
// ---------------------------------
function setupCanvas() {
  PRNG.seed('shan-shui-seed');
  Noise.noiseSeed(123456);
  Noise.noiseDetail(4, 0.5);

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
  bg.addColorStop(0, '#b48e56');
  bg.addColorStop(0.5, '#c79b61');
  bg.addColorStop(1, '#d7ae75');
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
    const a = rnd() * 0.04;
    const c = 90 + rnd() * 40;
    octx.fillStyle = `rgba(${c},${c * 0.9},${c * 0.75},${a})`;
    octx.fillRect(x, y, 1, 1);
  }

  for (let i = 0; i < 30; i++) {
    const x = rand(0, oCanvas.width);
    const y = rand(0, oCanvas.height);
    const r = rand(18, 60);
    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,250,240,0.03)');
    g.addColorStop(1, 'rgba(255,250,240,0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawAtmosphericMounts() {
  for (let layer = 0; layer < 4; layer++) {
    const baseY = 110 + layer * 65;
    const alpha = 0.06 + layer * 0.015;
    const pts = [];
    const count = 28;
    for (let i = 0; i <= count; i++) {
      const x = mapVal(i, 0, count, 0, oCanvas.width);
      const n = Noise.noise(i * 0.18, layer * 0.27);
      const y = baseY - n * (35 - layer * 5) - Math.sin(i / count * Math.PI * 2) * 8;
      pts.push({ x, y });
    }
    const poly = pts.concat([
      { x: oCanvas.width, y: oCanvas.height * 0.72 },
      { x: 0, y: oCanvas.height * 0.72 }
    ]);
    octx.save();
    polygonPath(octx, poly);
    octx.fillStyle = `rgba(90,85,78,${alpha})`;
    octx.fill();
    octx.restore();
  }
}

function drawGroundMist() {
  for (let i = 0; i < 8; i++) {
    const cx = rand(50, oCanvas.width - 50);
    const cy = rand(oCanvas.height * 0.45, oCanvas.height * 0.8);
    const r = rand(50, 120);
    const g = octx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(240,236,230,0.10)');
    g.addColorStop(0.5, 'rgba(240,236,230,0.05)');
    g.addColorStop(1, 'rgba(240,236,230,0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.fill();
  }
}

// ---------------------------------
// Input events
// ---------------------------------
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

// ---------------------------------
// Mountain generation
// ---------------------------------
function makeMountainFromStroke(stroke, index, total) {
  let pts = simplifyPoints(stroke.points, 2);
  pts = smoothPoints(pts, 2);
  pts = resamplePolyline(pts, 72);

  const meanY = avgY(pts);
  const depth = index / Math.max(1, total - 1);
  const seed = Math.floor(meanY * 17 + pts[0].x * 3 + index * 97);

  const ridge = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = i / (pts.length - 1);
    const n1 = Noise.noise(t * 3.2, seed * 0.01);
    const n2 = Noise.noise(t * 7.7, seed * 0.02 + 5);
    const lift = mapVal(1 - depth, 0, 1, 8, 38);
    ridge.push({
      x: p.x + (n1 - 0.5) * 8,
      y: p.y - (n1 - 0.5) * lift - (n2 - 0.5) * 10
    });
  }

  let footY = clamp(meanY + mapVal(depth, 0, 1, 150, 100), meanY + 60, oCanvas.height - 28);
  const fillPoly = ridge.concat([
    { x: ridge[ridge.length - 1].x, y: footY },
    { x: ridge[0].x, y: footY }
  ]);

  return {
    ridge,
    poly: fillPoly,
    meanY,
    footY,
    depth,
    seed
  };
}

function drawMountainBody(m) {
  const topY = Math.min(...m.ridge.map(p => p.y));
  const g = octx.createLinearGradient(0, topY, 0, m.footY);
  g.addColorStop(0.00, `rgba(64,96,112,${0.18 + (1 - m.depth) * 0.05})`);
  g.addColorStop(0.25, `rgba(72,122,128,${0.16 + (1 - m.depth) * 0.05})`);
  g.addColorStop(0.52, `rgba(96,138,118,${0.15 + (1 - m.depth) * 0.05})`);
  g.addColorStop(0.78, `rgba(132,146,86,${0.12 + (1 - m.depth) * 0.04})`);
  g.addColorStop(1.00, `rgba(98,94,72,${0.08 + (1 - m.depth) * 0.03})`);

  octx.save();
  polygonPath(octx, m.poly);
  octx.fillStyle = g;
  octx.fill();
  octx.restore();
}

function drawBlueGreenLayers(m) {
  const offsets = [
    { off: 0, color: 'rgba(44,88,118,0.18)' },
    { off: 16, color: 'rgba(72,132,120,0.13)' },
    { off: 28, color: 'rgba(126,150,86,0.10)' }
  ];

  for (const item of offsets) {
    const layer = [];
    for (let i = 0; i < m.ridge.length; i++) {
      const p = m.ridge[i];
      const t = i / (m.ridge.length - 1);
      const n = Noise.noise(t * 4.0, m.seed * 0.013 + item.off);
      layer.push({
        x: p.x,
        y: p.y + item.off + (n - 0.5) * 10
      });
    }
    const poly = layer.concat([
      { x: layer[layer.length - 1].x, y: m.footY },
      { x: layer[0].x, y: m.footY }
    ]);

    octx.save();
    polygonPath(octx, poly);
    octx.fillStyle = item.color;
    octx.fill();
    octx.restore();
  }
}

function drawRidgeOutline(m) {
  // 主山脊线
  octx.save();
  drawPolyline(octx, m.ridge);
  octx.strokeStyle = `rgba(22,22,20,${0.35 - m.depth * 0.12})`;
  octx.lineWidth = 1.3;
  octx.stroke();

  // 侧锋加墨
  blobStroke(octx, m.ridge, {
    width: 1.6 + (1 - m.depth) * 0.8,
    color: `rgba(26,24,20,${0.07 + (1 - m.depth) * 0.04})`,
    noiseAmp: 0.55
  });

  // 飞白
  for (let i = 1; i < m.ridge.length; i += 3) {
    if (rnd() < 0.45) {
      const p0 = m.ridge[i - 1];
      const p1 = m.ridge[i];
      octx.beginPath();
      octx.moveTo(lerp(p0.x, p1.x, 0.2), lerp(p0.y, p1.y, 0.2));
      octx.lineTo(lerp(p0.x, p1.x, 0.85), lerp(p0.y, p1.y, 0.85));
      octx.strokeStyle = 'rgba(245,238,224,0.10)';
      octx.lineWidth = rand(0.3, 0.8);
      octx.stroke();
    }
  }

  octx.restore();
}

function drawContourLines(m) {
  const layerCount = randi(5, 8);
  for (let k = 1; k <= layerCount; k++) {
    const ratio = k / (layerCount + 1);
    const line = [];

    for (let i = 0; i < m.ridge.length; i++) {
      const p = m.ridge[i];
      const t = i / (m.ridge.length - 1);
      const n = Noise.noise(t * 4.2, k * 0.4 + m.seed * 0.011);
      const bend = Math.sin(t * Math.PI) * 12;
      line.push({
        x: p.x + (n - 0.5) * 4,
        y: lerp(p.y + 12, m.footY - 8, ratio) - bend * (1 - ratio) * 0.75 + (n - 0.5) * 6
      });
    }

    octx.save();
    drawPolyline(octx, line);
    octx.strokeStyle = `rgba(34,34,30,${0.12 + (1 - ratio) * 0.04})`;
    octx.lineWidth = 0.9;
    octx.stroke();
    octx.restore();
  }
}

function drawCunTexture(m) {
  octx.save();
  for (let i = 3; i < m.ridge.length - 3; i += 2) {
    const p = m.ridge[i];
    const density = mapVal(m.depth, 0, 1, 1.0, 0.5);
    if (rnd() > 0.75 * density) continue;

    const count = randi(2, 4);
    for (let j = 0; j < count; j++) {
      const len = rand(7, 18);
      const ox = rand(-10, 10);
      const oy = rand(10, 50);
      const a = rand(Math.PI * 0.15, Math.PI * 0.42);

      octx.beginPath();
      octx.moveTo(p.x + ox, p.y + oy);
      octx.quadraticCurveTo(
        p.x + ox + Math.cos(a) * len * 0.4,
        p.y + oy + len * 0.4,
        p.x + ox + Math.cos(a) * len,
        p.y + oy + len * 0.85
      );
      octx.strokeStyle = `rgba(28,28,24,${rand(0.06, 0.14)})`;
      octx.lineWidth = rand(0.45, 1.1);
      octx.stroke();
    }
  }
  octx.restore();
}

function drawMossDots(m) {
  octx.save();
  for (let i = 0; i < m.ridge.length; i += 2) {
    const p = m.ridge[i];
    const count = randi(1, 4);
    for (let j = 0; j < count; j++) {
      const x = p.x + rand(-8, 8);
      const y = p.y + rand(10, 40);
      const r = rand(0.7, 2.0);
      const tone = rnd() < 0.75 ? '22,22,18' : '74,78,44';
      const alpha = tone === '22,22,18' ? rand(0.06, 0.16) : rand(0.02, 0.06);

      octx.fillStyle = `rgba(${tone},${alpha})`;
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
  const r = rand(40, 90);
  const g = octx.createRadialGradient(p.x, p.y + rand(18, 50), 0, p.x, p.y + rand(18, 50), r);
  g.addColorStop(0, 'rgba(245,240,235,0.16)');
  g.addColorStop(0.5, 'rgba(245,240,235,0.08)');
  g.addColorStop(1, 'rgba(245,240,235,0)');
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(p.x, p.y + rand(18, 50), r, 0, Math.PI * 2);
  octx.fill();
}

function drawSmallHouse(m) {
  if (rnd() > 0.18) return;
  const p = m.ridge[Math.floor(m.ridge.length * rand(0.2, 0.8))];
  if (!p) return;
  const x = p.x + rand(-18, 18);
  const y = p.y + rand(32, 56);
  const s = rand(7, 11);

  octx.save();
  octx.fillStyle = 'rgba(245,242,236,0.80)';
  octx.strokeStyle = 'rgba(40,36,30,0.35)';
  octx.lineWidth = 0.8;

  // 屋身
  octx.beginPath();
  octx.rect(x - s * 0.8, y - s * 0.5, s * 1.6, s);
  octx.fill();
  octx.stroke();

  // 屋顶
  octx.beginPath();
  octx.moveTo(x - s, y - s * 0.45);
  octx.lineTo(x, y - s * 1.05);
  octx.lineTo(x + s, y - s * 0.45);
  octx.strokeStyle = 'rgba(28,26,24,0.45)';
  octx.lineWidth = 1.0;
  octx.stroke();

  octx.restore();
}

// ---------------------------------
// Trees
// ---------------------------------
function drawTreeCluster(x, y, scale = 1, inkAlpha = 0.18) {
  const mode = rnd() < 0.55 ? 'pine' : 'dot';

  if (mode === 'pine') {
    const trunkH = rand(7, 14) * scale;
    octx.save();
    octx.strokeStyle = `rgba(22,22,18,${inkAlpha})`;
    octx.lineWidth = 0.8 * scale;
    octx.beginPath();
    octx.moveTo(x, y);
    octx.lineTo(x, y + trunkH);
    octx.stroke();

    const layers = randi(3, 5);
    for (let i = 0; i < layers; i++) {
      const ly = y - i * rand(3, 6) * scale;
      const hw = rand(5, 10) * scale;
      octx.beginPath();
      octx.moveTo(x - hw, ly);
      octx.lineTo(x, ly - rand(1, 3) * scale);
      octx.lineTo(x + hw, ly);
      octx.strokeStyle = `rgba(22,22,18,${inkAlpha * rand(0.8, 1.2)})`;
      octx.lineWidth = rand(0.6, 1.0) * scale;
      octx.stroke();
    }
    octx.restore();
  } else {
    octx.save();
    octx.strokeStyle = `rgba(22,22,18,${inkAlpha * 0.9})`;
    octx.lineWidth = 0.7 * scale;
    octx.beginPath();
    octx.moveTo(x, y);
    octx.lineTo(x, y + rand(6, 12) * scale);
    octx.stroke();

    for (let i = 0; i < randi(10, 18); i++) {
      const dx = rand(-8, 8) * scale;
      const dy = rand(-10, 2) * scale;
      const r = rand(0.7, 1.8) * scale;
      octx.fillStyle = `rgba(22,22,18,${rand(inkAlpha * 0.7, inkAlpha * 1.15)})`;
      octx.beginPath();
      octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      octx.fill();
    }
    for (let i = 0; i < randi(2, 5); i++) {
      const dx = rand(-7, 7) * scale;
      const dy = rand(-9, 2) * scale;
      const r = rand(0.5, 1.4) * scale;
      octx.fillStyle = `rgba(88,100,56,${rand(0.03, 0.07)})`;
      octx.beginPath();
      octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      octx.fill();
    }
    octx.restore();
  }
}

function drawTreeBelts(m) {
  const count = clamp(Math.floor(m.ridge.length / 7), 4, 12);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(mapVal(i, 0, Math.max(1, count - 1), 4, m.ridge.length - 5));
    const p = m.ridge[idx];
    const x = p.x + rand(-6, 6);
    const y = p.y + rand(8, 28);
    const scale = mapVal(1 - m.depth, 0, 1, 0.55, 1.0);
    drawTreeCluster(x, y, scale, mapVal(1 - m.depth, 0, 1, 0.10, 0.22));
  }
}

// ---------------------------------
// Foreground and water
// ---------------------------------
function drawWaterAndReflections(mountains) {
  const waterY = oCanvas.height * 0.84;

  octx.save();
  octx.fillStyle = 'rgba(110,130,124,0.06)';
  octx.beginPath();
  octx.moveTo(0, waterY);
  octx.quadraticCurveTo(oCanvas.width * 0.25, waterY - 10, oCanvas.width * 0.52, waterY + 6);
  octx.quadraticCurveTo(oCanvas.width * 0.78, waterY + 14, oCanvas.width, waterY - 2);
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
      octx.strokeStyle = `rgba(78,102,98,${rand(0.04, 0.09)})`;
      octx.lineWidth = rand(0.5, 1.0);
      octx.stroke();
    }
  }

  for (let i = 0; i < 14; i++) {
    const y = rand(waterY, oCanvas.height * 0.96);
    octx.beginPath();
    octx.moveTo(0, y);
    for (let x = 0; x <= oCanvas.width; x += 20) {
      octx.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * rand(1, 3));
    }
    octx.strokeStyle = 'rgba(70,88,86,0.08)';
    octx.lineWidth = rand(0.35, 0.8);
    octx.stroke();
  }
}

function drawForegroundDetails() {
  octx.save();

  octx.fillStyle = 'rgba(80,88,70,0.12)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.88);
  octx.quadraticCurveTo(oCanvas.width * 0.22, oCanvas.height * 0.80, oCanvas.width * 0.38, oCanvas.height * 0.89);
  octx.quadraticCurveTo(oCanvas.width * 0.58, oCanvas.height * 0.95, oCanvas.width * 0.74, oCanvas.height * 0.87);
  octx.quadraticCurveTo(oCanvas.width * 0.88, oCanvas.height * 0.81, oCanvas.width, oCanvas.height * 0.91);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  for (let i = 0; i < 220; i++) {
    const x = rand(0, oCanvas.width);
    const y = rand(oCanvas.height * 0.78, oCanvas.height * 0.98);
    const r = rand(0.5, 1.8);
    if (rnd() < 0.76) {
      octx.fillStyle = `rgba(22,22,18,${rand(0.04, 0.13)})`;
    } else {
      octx.fillStyle = `rgba(112,95,62,${rand(0.02, 0.06)})`;
    }
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }

  // 前景丛树
  const treeBaseY = oCanvas.height * 0.86;
  for (let i = 0; i < 12; i++) {
    const x = mapVal(i, 0, 11, 25, oCanvas.width - 25) + rand(-10, 10);
    drawTreeCluster(x, treeBaseY + rand(-8, 8), rand(0.8, 1.25), rand(0.10, 0.22));
  }

  octx.restore();
}

// ---------------------------------
// Main render
// ---------------------------------
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

  // 使用用户笔迹作为主山脊
  const sorted = [...brushStrokes].sort((a, b) => avgY(a.points) - avgY(b.points));
  const mountains = sorted.map((s, i) => makeMountainFromStroke(s, i, sorted.length));

  // 先远后近
  for (const m of mountains) {
    drawMountainBody(m);
    drawBlueGreenLayers(m);
  }

  for (const m of mountains) {
    drawContourLines(m);
    drawCunTexture(m);
    drawMossDots(m);
    drawTreeBelts(m);
    drawRidgeOutline(m);
    drawMistBand(m);
    drawSmallHouse(m);
  }

  drawWaterAndReflections(mountains);
  drawForegroundDetails();

  setStatus('青绿山水正在随笔生长');
}

// ---------------------------------
// Bind events
// ---------------------------------
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

// ---------------------------------
// Init
// ---------------------------------
function initApp() {
  setupCanvas();
  bindEvents();
  setStatus('已进入青绿山水画境，开始勾勒山势');
}

initApp();
