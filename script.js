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
let lastPos = null;
let renderTimer = null;

// 记录左侧笔迹点，用于在右侧生成山体结构
let strokes = [];
let currentStroke = null;

function setStatus(text) {
  statusTag.innerText = text;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}

function setupCanvas() {
  // 左画布：宣纸底
  ictx.fillStyle = '#f3efe3';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);

  resetOutputScene();

  ictx.lineCap = 'round';
  ictx.lineJoin = 'round';
}

function resetOutputScene() {
  // 右画布底色
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);

  const bg = octx.createLinearGradient(0, 0, 0, oCanvas.height);
  bg.addColorStop(0, '#f5f1e7');
  bg.addColorStop(0.55, '#efe8d8');
  bg.addColorStop(1, '#e7decb');
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
    const a = Math.random() * 0.05;
    octx.fillStyle = `rgba(90, 80, 60, ${a})`;
    octx.fillRect(x, y, 1, 1);
  }
}

function drawAtmosphereWash() {
  for (let i = 0; i < 6; i++) {
    const x = rand(40, oCanvas.width - 40);
    const y = rand(30, oCanvas.height * 0.55);
    const r = rand(80, 180);

    const g = octx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(130, 160, 145, 0.06)');
    g.addColorStop(0.7, 'rgba(130, 160, 145, 0.025)');
    g.addColorStop(1, 'rgba(130, 160, 145, 0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawWaterArea() {
  octx.save();
  octx.fillStyle = 'rgba(110, 145, 135, 0.08)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.78);
  octx.quadraticCurveTo(oCanvas.width * 0.3, oCanvas.height * 0.73, oCanvas.width * 0.55, oCanvas.height * 0.8);
  octx.quadraticCurveTo(oCanvas.width * 0.78, oCanvas.height * 0.85, oCanvas.width, oCanvas.height * 0.78);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  for (let i = 0; i < 10; i++) {
    const y = rand(oCanvas.height * 0.78, oCanvas.height * 0.95);
    octx.strokeStyle = 'rgba(90, 110, 105, 0.10)';
    octx.lineWidth = rand(0.5, 1.2);
    octx.beginPath();
    octx.moveTo(rand(0, 40), y);
    for (let x = 0; x <= oCanvas.width; x += 25) {
      octx.lineTo(x, y + Math.sin(x * 0.02 + i) * rand(1.5, 4));
    }
    octx.stroke();
  }
  octx.restore();
}

function startDraw(e) {
  e.preventDefault();
  isDrawing = true;
  lastPos = getPos(e);

  ictx.beginPath();
  ictx.moveTo(lastPos.x, lastPos.y);

  currentStroke = {
    tool: currentTool,
    points: [lastPos]
  };
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();

  const pos = getPos(e);

  if (currentTool === 'brush') {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#111';
    ictx.lineWidth = 4;
  } else {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#f3efe3';
    ictx.lineWidth = 16;
  }

  ictx.lineTo(pos.x, pos.y);
  ictx.stroke();

  currentStroke.points.push(pos);
  lastPos = pos;
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentStroke && currentStroke.points.length > 1) {
    strokes.push(currentStroke);
  }
  currentStroke = null;

  scheduleRender();
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderLandscapeRuleBased();
  }, 60);
}

function simplifyPoints(points, step = 3) {
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

function drawInkStroke(points) {
  if (points.length < 2) return;

  octx.save();
  octx.lineCap = 'round';
  octx.lineJoin = 'round';

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);

    octx.strokeStyle = `rgba(28, 28, 28, ${clamp(0.12 + dist * 0.01, 0.12, 0.28)})`;
    octx.lineWidth = clamp(1 + dist * 0.06, 1, 5);

    octx.beginPath();
    octx.moveTo(p0.x, p0.y);
    octx.lineTo(p1.x, p1.y);
    octx.stroke();

    // 模拟毛边和飞白
    if (Math.random() < 0.45) {
      octx.strokeStyle = `rgba(40, 40, 40, 0.05)`;
      octx.lineWidth = rand(0.3, 1.0);
      octx.beginPath();
      octx.moveTo(p0.x + rand(-2, 2), p0.y + rand(-2, 2));
      octx.lineTo(p1.x + rand(-2, 2), p1.y + rand(-2, 2));
      octx.stroke();
    }
  }

  octx.restore();
}

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

  const grad = octx.createLinearGradient(0, Math.min(...points.map(p => p.y)), 0, bottomY);
  grad.addColorStop(0, 'rgba(90, 135, 120, 0.10)');
  grad.addColorStop(0.45, 'rgba(78, 120, 108, 0.16)');
  grad.addColorStop(1, 'rgba(65, 92, 86, 0.22)');
  octx.fillStyle = grad;
  octx.fill();

  octx.restore();
}

function addMossTexture(points) {
  octx.save();
  for (let i = 0; i < points.length; i += 2) {
    const p = points[i];
    const n = Math.floor(rand(1, 4));
    for (let j = 0; j < n; j++) {
      const x = p.x + rand(-8, 8);
      const y = p.y + rand(8, 30);
      const r = rand(1, 3.5);
      octx.fillStyle = `rgba(55, 95, 70, ${rand(0.05, 0.18)})`;
      octx.beginPath();
      octx.arc(x, y, r, 0, Math.PI * 2);
      octx.fill();
    }
  }
  octx.restore();
}

function addCunTexture(points) {
  octx.save();
  octx.strokeStyle = 'rgba(35, 35, 35, 0.10)';
  octx.lineWidth = 0.8;

  for (let i = 2; i < points.length - 2; i += 2) {
    const p = points[i];
    const len = rand(6, 16);
    const angle = rand(Math.PI * 0.2, Math.PI * 0.45);

    octx.beginPath();
    octx.moveTo(p.x + rand(-4, 4), p.y + rand(6, 18));
    octx.lineTo(
      p.x + Math.cos(angle) * len,
      p.y + rand(10, 26) + Math.sin(angle) * len * 0.25
    );
    octx.stroke();
  }
  octx.restore();
}

function addMist(points) {
  const sample = points[Math.floor(points.length / 2)];
  if (!sample) return;

  octx.save();
  const r = rand(45, 100);
  const g = octx.createRadialGradient(sample.x, sample.y + rand(20, 50), 0, sample.x, sample.y + rand(20, 50), r);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.5, 'rgba(240,240,235,0.08)');
  g.addColorStop(1, 'rgba(240,240,235,0)');
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(sample.x, sample.y + rand(20, 50), r, 0, Math.PI * 2);
  octx.fill();
  octx.restore();
}

function addBlueGreenWash(points) {
  if (points.length < 2) return;

  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y)) + 120;

  octx.save();
  octx.beginPath();
  octx.moveTo(points[0].x, maxY);

  for (const p of points) {
    octx.lineTo(p.x, p.y + rand(-2, 2));
  }

  octx.lineTo(points[points.length - 1].x, maxY);
  octx.closePath();

  const grad = octx.createLinearGradient(0, minY, 0, maxY);
  grad.addColorStop(0, 'rgba(78, 128, 115, 0.04)');
  grad.addColorStop(0.4, 'rgba(90, 150, 125, 0.08)');
  grad.addColorStop(1, 'rgba(58, 102, 92, 0.03)');
  octx.fillStyle = grad;
  octx.fill();

  octx.restore();
}

function drawTrees(points) {
  if (points.length < 3) return;

  octx.save();
  for (let i = 1; i < points.length; i += 4) {
    const p = points[i];
    if (p.y > oCanvas.height * 0.72) continue;

    const tx = p.x + rand(-8, 8);
    const ty = p.y + rand(18, 42);

    octx.strokeStyle = 'rgba(45, 35, 25, 0.22)';
    octx.lineWidth = rand(0.8, 1.8);
    octx.beginPath();
    octx.moveTo(tx, ty);
    octx.lineTo(tx, ty + rand(8, 18));
    octx.stroke();

    const crownR = rand(4, 10);
    octx.fillStyle = `rgba(62, 96, 72, ${rand(0.12, 0.22)})`;
    octx.beginPath();
    octx.arc(tx, ty, crownR, 0, Math.PI * 2);
    octx.fill();

    octx.fillStyle = `rgba(82, 122, 88, ${rand(0.08, 0.18)})`;
    octx.beginPath();
    octx.arc(tx + rand(-3, 3), ty - rand(2, 5), crownR * 0.7, 0, Math.PI * 2);
    octx.fill();
  }
  octx.restore();
}

function drawReflection(points) {
  if (points.length < 2) return;

  octx.save();
  octx.strokeStyle = 'rgba(70, 100, 95, 0.08)';
  octx.lineWidth = 1.2;

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

function renderLandscapeRuleBased() {
  resetOutputScene();

  const brushStrokes = strokes.filter(s => s.tool === 'brush');

  if (brushStrokes.length === 0) {
    setStatus('画卷已重置，等待新的山水勾勒');
    return;
  }

  // 先按 y 值排序，让高处山先画，低处山后画，形成层次
  const sorted = [...brushStrokes].sort((a, b) => {
    const ay = a.points.reduce((sum, p) => sum + p.y, 0) / a.points.length;
    const by = b.points.reduce((sum, p) => sum + p.y, 0) / b.points.length;
    return ay - by;
  });

  for (const stroke of sorted) {
    const pts = simplifyPoints(stroke.points, 2);
    fillMountainMass(pts);
    addBlueGreenWash(pts);
    addMist(pts);
    addMossTexture(pts);
    addCunTexture(pts);
    drawTrees(pts);
    drawInkStroke(pts);
    drawReflection(pts);
  }

  drawForegroundDetails();
  setStatus('青绿山水正在随笔生长');
}

function drawForegroundDetails() {
  octx.save();

  // 前景坡岸
  octx.fillStyle = 'rgba(75, 95, 78, 0.16)';
  octx.beginPath();
  octx.moveTo(0, oCanvas.height * 0.86);
  octx.quadraticCurveTo(oCanvas.width * 0.22, oCanvas.height * 0.8, oCanvas.width * 0.38, oCanvas.height * 0.88);
  octx.quadraticCurveTo(oCanvas.width * 0.58, oCanvas.height * 0.94, oCanvas.width * 0.75, oCanvas.height * 0.86);
  octx.quadraticCurveTo(oCanvas.width * 0.88, oCanvas.height * 0.8, oCanvas.width, oCanvas.height * 0.9);
  octx.lineTo(oCanvas.width, oCanvas.height);
  octx.lineTo(0, oCanvas.height);
  octx.closePath();
  octx.fill();

  // 点苔
  for (let i = 0; i < 160; i++) {
    const x = rand(0, oCanvas.width);
    const y = rand(oCanvas.height * 0.76, oCanvas.height * 0.98);
    const r = rand(0.8, 2.4);
    octx.fillStyle = `rgba(55, 88, 64, ${rand(0.06, 0.18)})`;
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
}

function clearAll() {
  strokes = [];
  currentStroke = null;
  ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);
  setupCanvas();
  setStatus('画卷已重置，等待新的山水勾勒');
}

function bindEvents() {
  brushBtn.addEventListener('click', () => {
    currentTool = 'brush';
    brushBtn.classList.add('active');
    eraserBtn.classList.remove('active');
  });

  eraserBtn.addEventListener('click', () => {
    currentTool = 'eraser';
    eraserBtn.classList.add('active');
    brushBtn.classList.remove('active');
  });

  clearBtn.addEventListener('click', clearAll);

  iCanvas.addEventListener('mousedown', startDraw);
  iCanvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', endDraw);

  iCanvas.addEventListener('touchstart', startDraw, { passive: false });
  iCanvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', endDraw);
}

function initApp() {
  setupCanvas();
  bindEvents();
}

initApp();
