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

// 存储左侧输入笔画
let strokes = [];

// ---------- 基础工具 ----------

function setStatus(text) {
  if (statusTag) statusTag.innerText = text;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function avgY(points) {
  if (!points.length) return 0;
  return points.reduce((s, p) => s + p.y, 0) / points.length;
}

function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}

function simplifyPoints(points, step = 2) {
  if (points.length <= 2) return points.slice();
  return points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0);
}

function smoothPoints(points, passes = 1) {
  let pts = points.map(p => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    if (pts.length < 3) break;
    const out = [pts[0]];
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

// ---------- 画布初始化 ----------

function setupCanvas() {
  ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
  ictx.fillStyle = '#f3efe3';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);

  ictx.lineCap = 'round';
  ictx.lineJoin = 'round';

  resetOutputScene();
}

function resetOutputScene() {
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);

  const bg = octx.createLinearGradient(0, 0, 0, oCanvas.height);
  bg.addColorStop(0, '#f6f1e6');
  bg.addColorStop(0.55, '#efe7d8');
  bg.addColorStop(1, '#e5dbc7');
  octx.fillStyle = bg;
  octx.fillRect(0, 0, oCanvas.width, oCanvas.height);

  drawPaperTexture();
  drawAtmosphereWash();
  drawWaterArea();
}

function drawPaperTexture() {
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * oCanvas.width;
    const y = Math.random() * oCanvas.height;
    const a = Math.random() * 0.045;
    octx.fillStyle = `rgba(96, 84, 62, ${a})`;
    octx.fillRect(x, y, 1, 1);
  }
}

function drawAtmosphereWash() {
  for (let i = 0; i < 7; i++) {
    const x = rand(40, oCanvas.width - 40);
    const y = rand(20, oCanvas.height * 0.55);
    const r = rand(70, 170);

    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(135, 150, 135, 0.05)');
    g.addColorStop(0.6, 'rgba(135, 150, 135, 0.025)');
    g.addColorStop(1, 'rgba(135, 150, 135, 0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawWaterArea() {
  octx.save();

  octx.fillStyle = 'rgba(112, 132, 126, 0.07)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.79);
  octx.quadraticCurveTo(oCanvas.width * 0.28, oCanvas.height * 0.74, oCanvas.width * 0.56, oCanvas.height * 0.81);
  octx.quadraticCurveTo(oCanvas.width * 0.78, oCanvas.height * 0.86, oCanvas.width, oCanvas.height * 0.79);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  for (let i = 0; i < 11; i++) {
    const y = rand(oCanvas.height * 0.79, oCanvas.height * 0.95);
    octx.strokeStyle = 'rgba(90, 106, 102, 0.09)';
    octx.lineWidth = rand(0.4, 1.1);
    octx.beginPath();
    octx.moveTo(0, y);
    for (let x = 0; x <= oCanvas.width; x += 20) {
      octx.lineTo(x, y + Math.sin(x * 0.018 + i * 1.7) * rand(1.2, 3.2));
    }
    octx.stroke();
  }

  octx.restore();
}

// ---------- 左侧输入交互 ----------

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
    ictx.strokeStyle = '#151515';
    ictx.lineWidth = 4;
  } else {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#f3efe3';
    ictx.lineWidth = 16;
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
  const eraserPoints = eraserStroke.points;
  if (!eraserPoints.length) return;

  const threshold = 20;

  strokes = strokes.map(stroke => {
    if (stroke.tool !== 'brush') return stroke;
    const filtered = stroke.points.filter(p => {
      for (const ep of eraserPoints) {
        if (Math.hypot(p.x - ep.x, p.y - ep.y) < threshold) {
          return false;
        }
      }
      return true;
    });
    return { ...stroke, points: filtered };
  }).filter(stroke => stroke.points.length > 1);
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
  renderTimer = setTimeout(renderLandscapeRuleBased, 50);
}

// ---------- 山体与笔墨 ----------

function fillMountainMass(points) {
  if (points.length < 2) return;

  const bottomY = oCanvas.height * 0.82;

  octx.save();
  octx.beginPath();
  octx.moveTo(points[0].x, bottomY);

  for (const p of points) {
    octx.lineTo(p.x, p.y);
  }

  octx.lineTo(points[points.length - 1].x, bottomY);
  octx.closePath();

  const topY = Math.min(...points.map(p => p.y));
  const grad = octx.createLinearGradient(0, topY, 0, bottomY);
  grad.addColorStop(0, 'rgba(92, 106, 98, 0.08)');
  grad.addColorStop(0.38, 'rgba(74, 86, 80, 0.13)');
  grad.addColorStop(1, 'rgba(58, 66, 62, 0.20)');
  octx.fillStyle = grad;
  octx.fill();

  octx.restore();
}

function addQingGreenWash(points) {
  if (points.length < 2) return;

  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y)) + 110;

  octx.save();
  octx.beginPath();
  octx.moveTo(points[0].x, maxY);

  for (const p of points) {
    octx.lineTo(p.x, p.y + rand(-1.5, 1.5));
  }

  octx.lineTo(points[points.length - 1].x, maxY);
  octx.closePath();

  const grad = octx.createLinearGradient(0, minY, 0, maxY);
  grad.addColorStop(0, 'rgba(78, 110, 96, 0.025)');
  grad.addColorStop(0.35, 'rgba(92, 126, 108, 0.05)');
  grad.addColorStop(0.7, 'rgba(102, 120, 82, 0.045)');
  grad.addColorStop(1, 'rgba(70, 92, 78, 0.02)');
  octx.fillStyle = grad;
  octx.fill();

  for (let i = 0; i < points.length; i += 3) {
    const p = points[i];
    const cy = p.y + rand(10, 28);
    const r = rand(7, 18);

    const g = octx.createRadialGradient(p.x, cy, 0, p.x, cy, r);
    g.addColorStop(0, 'rgba(72, 108, 98, 0.05)');
    g.addColorStop(0.55, 'rgba(95, 120, 88, 0.03)');
    g.addColorStop(1, 'rgba(95, 120, 88, 0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(p.x, cy, r, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
}

function addMist(points) {
  const sample = points[Math.floor(points.length / 2)];
  if (!sample) return;

  octx.save();
  const cx = sample.x;
  const cy = sample.y + rand(16, 44);
  const r = rand(45, 100);

  const g = octx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.5, 'rgba(244,242,236,0.08)');
  g.addColorStop(1, 'rgba(244,242,236,0)');
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(cx, cy, r, 0, Math.PI * 2);
  octx.fill();
  octx.restore();
}

function addChineseCunTexture(points) {
  octx.save();

  for (let i = 2; i < points.length - 1; i += 2) {
    const p = points[i];
    const stylePick = Math.random();

    if (stylePick < 0.55) {
      const len = rand(8, 18);
      const angle = rand(Math.PI * 0.18, Math.PI * 0.42);

      octx.strokeStyle = `rgba(28, 26, 22, ${rand(0.07, 0.14)})`;
      octx.lineWidth = rand(0.5, 1.2);
      octx.beginPath();
      octx.moveTo(p.x + rand(-4, 4), p.y + rand(10, 24));
      octx.quadraticCurveTo(
        p.x + Math.cos(angle) * len * 0.45,
        p.y + rand(12, 26),
        p.x + Math.cos(angle) * len,
        p.y + rand(16, 30)
      );
      octx.stroke();
    } else {
      const len = rand(6, 14);
      const angle = rand(Math.PI * 0.25, Math.PI * 0.52);

      octx.strokeStyle = `rgba(24, 22, 18, ${rand(0.06, 0.12)})`;
      octx.lineWidth = rand(0.7, 1.4);
      octx.beginPath();
      octx.moveTo(p.x + rand(-3, 3), p.y + rand(8, 18));
      octx.lineTo(
        p.x + Math.cos(angle) * len,
        p.y + rand(14, 26)
      );
      octx.stroke();
    }
  }

  octx.restore();
}

function addDianTai(points) {
  octx.save();

  for (let i = 0; i < points.length; i += 2) {
    const p = points[i];
    const count = Math.floor(rand(2, 6));

    for (let j = 0; j < count; j++) {
      const x = p.x + rand(-10, 10);
      const y = p.y + rand(12, 36);
      const r = rand(0.7, 2.0);

      octx.fillStyle = `rgba(24, 24, 20, ${rand(0.06, 0.18)})`;
      octx.beginPath();
      octx.arc(x, y, r, 0, Math.PI * 2);
      octx.fill();
    }
  }

  octx.restore();
}

function drawBrushStrokeChinese(points) {
  if (points.length < 2) return;

  octx.save();
  octx.lineCap = 'butt';
  octx.lineJoin = 'miter';

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const baseWidth = clamp(segDist * 0.18 + 1.2, 1.2, 6.5);

    // 主笔线
    octx.strokeStyle = `rgba(26, 24, 20, ${clamp(0.16 + segDist * 0.008, 0.16, 0.30)})`;
    octx.lineWidth = baseWidth;
    octx.beginPath();
    octx.moveTo(p0.x, p0.y);
    octx.lineTo(p1.x, p1.y);
    octx.stroke();

    // 侧锋擦笔
    if (Math.random() < 0.9) {
      octx.strokeStyle = `rgba(42, 38, 30, ${rand(0.04, 0.09)})`;
      octx.lineWidth = baseWidth * rand(0.6, 1.3);
      octx.beginPath();
      octx.moveTo(
        p0.x + nx * rand(-1.8, 1.8),
        p0.y + ny * rand(-1.8, 1.8)
      );
      octx.lineTo(
        p1.x + nx * rand(-3.0, 3.0),
        p1.y + ny * rand(-3.0, 3.0)
      );
      octx.stroke();
    }

    // 飞白
    const dryCount = Math.floor(rand(1, 4));
    for (let j = 0; j < dryCount; j++) {
      if (Math.random() < 0.55) {
        const t0 = rand(0.05, 0.45);
        const t1 = rand(0.55, 0.95);

        const sx = p0.x + dx * t0 + nx * rand(-baseWidth * 0.35, baseWidth * 0.35);
        const sy = p0.y + dy * t0 + ny * rand(-baseWidth * 0.35, baseWidth * 0.35);
        const ex = p0.x + dx * t1 + nx * rand(-baseWidth * 0.35, baseWidth * 0.35);
        const ey = p0.y + dy * t1 + ny * rand(-baseWidth * 0.35, baseWidth * 0.35);

        octx.strokeStyle = `rgba(245, 240, 228, ${rand(0.05, 0.12)})`;
        octx.lineWidth = rand(0.35, 0.9);
        octx.beginPath();
        octx.moveTo(sx, sy);
        octx.lineTo(ex, ey);
        octx.stroke();
      }
    }

    // 顿挫墨结
    if (Math.random() < 0.28) {
      octx.fillStyle = `rgba(20, 18, 16, ${rand(0.04, 0.10)})`;
      octx.beginPath();
      octx.ellipse(
        p1.x + rand(-1.2, 1.2),
        p1.y + rand(-1.2, 1.2),
        rand(0.8, 2.8),
        rand(0.6, 1.8),
        angle,
        0,
        Math.PI * 2
      );
      octx.fill();
    }
  }

  octx.restore();
}

// ---------- 树法 ----------

function drawChineseTrees(points) {
  if (points.length < 3) return;

  octx.save();

  for (let i = 1; i < points.length; i += 5) {
    const p = points[i];
    if (p.y > oCanvas.height * 0.74) continue;

    const tx = p.x + rand(-10, 10);
    const ty = p.y + rand(18, 40);

    octx.strokeStyle = `rgba(34, 28, 22, ${rand(0.10, 0.22)})`;
    octx.lineWidth = rand(0.8, 1.8);
    octx.beginPath();
    octx.moveTo(tx, ty);
    octx.lineTo(tx + rand(-2, 2), ty + rand(10, 20));
    octx.stroke();

    if (Math.random() < 0.55) {
      drawDianYeTree(tx, ty);
    } else {
      drawPineTree(tx, ty);
    }
  }

  octx.restore();
}

function drawDianYeTree(x, y) {
  for (let k = 0; k < 16; k++) {
    const dx = rand(-10, 10);
    const dy = rand(-12, 4);
    const r = rand(0.8, 2.2);

    octx.fillStyle = `rgba(28, 28, 22, ${rand(0.08, 0.20)})`;
    octx.beginPath();
    octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    octx.fill();
  }

  for (let k = 0; k < 6; k++) {
    const dx = rand(-8, 8);
    const dy = rand(-10, 2);
    const r = rand(0.6, 1.8);

    octx.fillStyle = `rgba(96, 102, 62, ${rand(0.03, 0.08)})`;
    octx.beginPath();
    octx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawPineTree(x, y) {
  octx.strokeStyle = `rgba(26, 22, 18, ${rand(0.10, 0.18)})`;
  octx.lineWidth = rand(0.8, 1.4);
  octx.beginPath();
  octx.moveTo(x, y);
  octx.lineTo(x, y + rand(10, 16));
  octx.stroke();

  const layers = Math.floor(rand(3, 5));
  for (let i = 0; i < layers; i++) {
    const ly = y - i * rand(3, 6);
    const half = rand(6, 12);

    octx.strokeStyle = `rgba(24, 24, 20, ${rand(0.08, 0.16)})`;
    octx.lineWidth = rand(0.6, 1.1);

    octx.beginPath();
    octx.moveTo(x - half, ly);
    octx.lineTo(x, ly - rand(1, 3));
    octx.lineTo(x + half, ly);
    octx.stroke();
  }
}

// ---------- 倒影与前景 ----------

function drawReflection(points) {
  if (points.length < 2) return;

  octx.save();
  octx.strokeStyle = 'rgba(70, 100, 95, 0.08)';
  octx.lineWidth = 1.1;

  for (let i = 1; i < points.length; i += 3) {
    const p = points[i];
    const ry = oCanvas.height * 0.82 + (oCanvas.height * 0.82 - p.y) * 0.18;
    const len = rand(18, 42);

    octx.beginPath();
    octx.moveTo(p.x - len * 0.5, ry);
    octx.lineTo(p.x + len * 0.5, ry + rand(-1.5, 1.5));
    octx.stroke();
  }
  octx.restore();
}

function drawForegroundDetails() {
  octx.save();

  octx.fillStyle = 'rgba(72, 82, 68, 0.12)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.86);
  octx.quadraticCurveTo(oCanvas.width * 0.22, oCanvas.height * 0.8, oCanvas.width * 0.38, oCanvas.height * 0.88);
  octx.quadraticCurveTo(oCanvas.width * 0.58, oCanvas.height * 0.94, oCanvas.width * 0.75, oCanvas.height * 0.86);
  octx.quadraticCurveTo(oCanvas.width * 0.88, oCanvas.height * 0.8, oCanvas.width, oCanvas.height * 0.9);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  for (let i = 0; i < 170; i++) {
    const x = rand(0, oCanvas.width);
    const y = rand(oCanvas.height * 0.77, oCanvas.height * 0.98);
    const r = rand(0.6, 2.1);

    if (Math.random() < 0.72) {
      octx.fillStyle = `rgba(22, 22, 18, ${rand(0.04, 0.14)})`;
    } else {
      octx.fillStyle = `rgba(110, 92, 62, ${rand(0.02, 0.07)})`;
    }

    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
}

// ---------- 主渲染 ----------

function renderLandscapeRuleBased() {
  resetOutputScene();

  const brushStrokes = strokes
    .filter(s => s.tool === 'brush' && s.points.length > 1)
    .map(s => {
      const simplified = simplifyPoints(s.points, 2);
      const smoothed = smoothPoints(simplified, 1);
      return { ...s, points: smoothed };
    });

  if (brushStrokes.length === 0) {
    setStatus('画卷已重置，等待新的山水勾勒');
    return;
  }

  const sorted = [...brushStrokes].sort((a, b) => avgY(a.points) - avgY(b.points));

  for (const stroke of sorted) {
    const pts = stroke.points;

    fillMountainMass(pts);
    addQingGreenWash(pts);
    addMist(pts);
    addDianTai(pts);
    addChineseCunTexture(pts);
    drawChineseTrees(pts);
    drawBrushStrokeChinese(pts);
    drawReflection(pts);
  }

  drawForegroundDetails();
  setStatus('青绿山水正在随笔生长');
}

// ---------- 事件绑定 ----------

function bindEvents() {
  if (brushBtn) {
    brushBtn.addEventListener('click', () => {
      currentTool = 'brush';
      brushBtn.classList.add('active');
      eraserBtn && eraserBtn.classList.remove('active');
    });
  }

  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      currentTool = 'eraser';
      eraserBtn.classList.add('active');
      brushBtn && brushBtn.classList.remove('active');
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

// ---------- 启动 ----------

function initApp() {
  setupCanvas();
  bindEvents();
  setStatus('已进入青绿山水画境，开始勾勒山势');
}

initApp();
