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
let renderTimer = null;

let model = null;
let styleImg = null;

// 把风格图放到你的仓库根目录
const STYLE_IMAGE_SRC = './style.jpg';

function setStatus(text) {
  statusTag.innerText = text;
}

function setupCanvas() {
  ictx.fillStyle = '#f0ede5';
  ictx.fillRect(0, 0, iCanvas.width, iCanvas.height);

  octx.fillStyle = '#f0ede5';
  octx.fillRect(0, 0, oCanvas.width, oCanvas.height);

  ictx.lineCap = 'round';
  ictx.lineJoin = 'round';
}

async function loadStyleImage() {
  setStatus('正在加载山水风格图...');
  styleImg = new Image();
  styleImg.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    styleImg.onload = resolve;
    styleImg.onerror = () => reject(new Error('style.jpg 加载失败'));
    styleImg.src = STYLE_IMAGE_SRC;
  });

  console.log('style image loaded');
}

async function initModel() {
  setStatus('正在加载模型...');

  // 兼容不同全局命名
  const magentaNS = window.magenta || window.mm || window.mi;
  console.log('magentaNS =', magentaNS);

  if (!magentaNS) {
    throw new Error('Magenta 没有成功加载');
  }

  const imageModule = magentaNS.image || magentaNS;
  console.log('imageModule =', imageModule);

  if (!imageModule.ArbitraryStyleTransferNetwork) {
    throw new Error('ArbitraryStyleTransferNetwork 不存在，说明当前引入的 magenta 包不对');
  }

  model = new imageModule.ArbitraryStyleTransferNetwork();
  await model.initialize();

  console.log('model initialized');
}

async function initApp() {
  try {
    setupCanvas();
    bindEvents();
    await loadStyleImage();
    await initModel();
    setStatus('🎨 已进入青绿山水画境');
  } catch (err) {
    console.error(err);
    setStatus('初始化失败: ' + err.message);
  }
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

  const pos = getPos(e);
  ictx.beginPath();
  ictx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();

  const pos = getPos(e);

  if (currentTool === 'brush') {
    ictx.strokeStyle = '#000000';
    ictx.lineWidth = 4;
  } else {
    ictx.strokeStyle = '#f0ede5';
    ictx.lineWidth = 12;
  }

  ictx.lineTo(pos.x, pos.y);
  ictx.stroke();
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;
  scheduleRender();
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderLandscape();
  }, 300);
}

async function renderLandscape() {
  if (!model || !styleImg) {
    setStatus('模型或风格图尚未准备好');
    return;
  }

  if (isGenerating) return;
  isGenerating = true;

  setStatus('正在渲染青绿山水...');

  try {
    const result = await model.transfer(iCanvas, styleImg);
    console.log('transfer result =', result);

    // 尝试兼容不同返回格式
    let outputTensor = result;

    if (result && result.tensor) {
      outputTensor = result.tensor;
    }

    if (outputTensor instanceof tf.Tensor) {
      const squeezed = outputTensor.squeeze();

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = squeezed.shape[1];
      tempCanvas.height = squeezed.shape[0];

      await tf.browser.toPixels(squeezed, tempCanvas);

      octx.clearRect(0, 0, oCanvas.width, oCanvas.height);
      octx.drawImage(tempCanvas, 0, 0, oCanvas.width, oCanvas.height);

      squeezed.dispose();

      if (outputTensor !== result && outputTensor.dispose) {
        outputTensor.dispose();
      }
      if (result.dispose) {
        result.dispose();
      }

      setStatus('🎨 山水已更新');
    } else {
      throw new Error('模型返回结果不是 Tensor，当前库版本和代码不匹配');
    }
  } catch (err) {
    console.error('renderLandscape error:', err);
    setStatus('生成失败: ' + err.message);
  } finally {
    isGenerating = false;
  }
}

function clearAll() {
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

initApp();
