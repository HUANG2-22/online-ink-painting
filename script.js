const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

const statusTag = document.getElementById('status');
const brushBtn = document.getElementById('brushBtn');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');

let isDrawing = false;
let isGenerating = false;
let currentTool = 'brush';
let lastPos = null;
let renderTimer = null;

let model = null;
let styleImg = null;

// 建议把风格图放到你自己仓库里，例如同目录下的 style.jpg
// 比外链更稳定，也避免跨域和远程加载波动
const STYLE_IMAGE_SRC = './style.jpg';

// 初始化
async function initApp() {
  try {
    setStatus('正在加载山水意境模型...');
    setupCanvas();
    bindEvents();

    await loadStyleImage();
    await initModel();

    fillOutputBackground();
    setStatus('🎨 已进入青绿山水画境');
  } catch (err) {
    console.error(err);
    setStatus('模型初始化失败，请检查网络、模型脚本或风格图路径');
  }
}

function setStatus(text) {
  statusTag.innerText = text;
}

function setupCanvas() {
  // 左侧输入底色为宣纸色
  ictx.fillStyle = '#f0ede5';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);

  fillOutputBackground();

  ictx.lineCap = 'round';
  ictx.lineJoin = 'round';
  ictx.strokeStyle = '#000000';
  ictx.lineWidth = 4;
}

function fillOutputBackground() {
  octx.fillStyle = '#f0ede5';
  octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
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

  // 防止触摸时页面滚动
  iCanvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}

function getPos(e) {
  const rect = iCanvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;

  return {
    x: (point.clientX - rect.left) * (iCanvas.width / rect.width),
    y: (point.clientY - rect.top) * (iCanvas.height / rect.height)
  };
}

function startDraw(e) {
  e.preventDefault();
  isDrawing = true;
  lastPos = getPos(e);

  ictx.beginPath();
  ictx.moveTo(lastPos.x, lastPos.y);
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();

  const pos = getPos(e);

  if (currentTool === 'brush') {
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#000000';
    ictx.lineWidth = 4;
  } else {
    // 用“宣纸色”模拟橡皮
    ictx.globalCompositeOperation = 'source-over';
    ictx.strokeStyle = '#f0ede5';
    ictx.lineWidth = 12;
  }

  ictx.lineTo(pos.x, pos.y);
  ictx.stroke();
  lastPos = pos;
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;
  lastPos = null;

  scheduleRender();
}

function clearAll() {
  ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
  octx.clearRect(0, 0, oCanvas.width, oCanvas.height);

  setupCanvas();
  setStatus('画卷已重置，等待新的山水勾勒');
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);

  // 防抖：停笔 250ms 后再生成
  renderTimer = setTimeout(() => {
    renderLandscape();
  }, 250);
}

async function loadStyleImage() {
  setStatus('正在加载山水风格图...');

  styleImg = new Image();
  styleImg.crossOrigin = 'anonymous';

  const imageLoaded = new Promise((resolve, reject) => {
    styleImg.onload = resolve;
    styleImg.onerror = reject;
  });

  styleImg.src = STYLE_IMAGE_SRC;
  await imageLoaded;
}

async function initModel() {
  setStatus('正在加载风格迁移模型...');

  // 兼容不同打包方式
  const magentaNS = window.magenta || window.mm || window.mi;
  if (!magentaNS) {
    throw new Error('Magenta 未正确加载');
  }

  // 某些版本在 magenta.image 下
  const imageModule = magentaNS.image || magentaNS;

  if (!imageModule.ArbitraryStyleTransferNetwork) {
    throw new Error('ArbitraryStyleTransferNetwork 不可用');
  }

  model = new imageModule.ArbitraryStyleTransferNetwork();
  await model.initialize();
}

async function renderLandscape() {
  if (!model || !styleImg || isGenerating) return;

  isGenerating = true;
  setStatus('正在渲染青绿山水...');

  try {
    // 风格迁移前清空输出，避免残影
    fillOutputBackground();

    const result = await model.transfer(iCanvas, styleImg);

    const tensor = tf.tidy(() => {
      // result 可能是 [1,h,w,3]，这里压成 [h,w,3]
      return result.squeeze();
    });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tensor.shape[1];
    tempCanvas.height = tensor.shape[0];

    await tf.browser.toPixels(tensor, tempCanvas);

    octx.clearRect(0, 0, oCanvas.width, oCanvas.height);
    octx.drawImage(tempCanvas, 0, 0, oCanvas.width, oCanvas.height);

    tensor.dispose();
    if (result && typeof result.dispose === 'function') {
      result.dispose();
    }

    setStatus('🎨 山水已更新');
  } catch (err) {
    console.error(err);
    setStatus('生成失败，请检查模型或风格图');
  } finally {
    isGenerating = false;
  }
}

initApp();
