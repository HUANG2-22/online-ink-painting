/**
 * 墨染青绿 - AI 实时山水生成 (直接引用云端模型版)
 */


// 官方 Edges2Paints 风景模型地址
const MODEL_URL = 'https://storage.googleapis.com/tfjs-models/tfjs/pix2pix/scenery/model.json';

let model;
const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let isDrawing = false;
let mode = 'brush'; 
const MODEL_SIZE = 256; // 模型固定的输入尺寸

// 1. 初始化 AI 模型
async function initAI() {
    const statusTag = document.getElementById('status');
    if(statusTag) statusTag.innerText = "正在从云端唤醒 AI 笔墨 (约 10MB)...";

    try {
        // 直接从 Google 存储加载模型
        model = await tf.loadLayersModel(MODEL_URL);
        console.log("AI 模型加载成功");
        if(statusTag) statusTag.innerText = "🎨 AI 已就绪，请在左侧勾勒山河";
    } catch (error) {
        console.error("加载失败:", error);
        if(statusTag) statusTag.innerText = "无法连接 AI 服务器，请检查网络或刷新";
    }

    // 初始化画布背景
    octx.fillStyle = '#f0ede5'; // 宣纸底色
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
}

// 2. 图像预测与青绿风格化
async function predict() {
    if (!model) return;

    // 内存管理：防止张量泄露导致浏览器卡死
    tf.tidy(() => {
        // A. 预处理：获取左侧涂鸦并转为张量
        const input = tf.browser.fromPixels(iCanvas)
            .resizeNearestNeighbor([MODEL_SIZE, MODEL_SIZE])
            .toFloat()
            .div(tf.scalar(127.5))
            .sub(tf.scalar(1)) 
            .expandDims();

        // B. AI 推理
        const prediction = model.predict(input);

        // C. 后处理：将结果渲染到右侧
        // squeeze() 去掉维度，add(1).div(2) 转回 [0, 1] 范围
        tf.browser.toPixels(prediction.squeeze().add(1).div(2), oCanvas)
            .then(() => {
                // 在生成图上叠加一层轻微的“青绿”滤镜效果
                applyGreenStyle();
            });
    });
}

// 模拟青绿山水的色彩叠加逻辑
function applyGreenStyle() {
    octx.save();
    octx.globalCompositeOperation = 'multiply'; // 叠加模式
    octx.globalAlpha = 0.2; // 淡淡的色彩感
    octx.fillStyle = '#2d5a27'; // 石绿色
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    octx.restore();
}

// 3. 交互绘图逻辑
function getPos(e) {
    const rect = iCanvas.getBoundingClientRect();
    // 适配触摸屏和鼠标
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function start(e) {
    isDrawing = true;
    ictx.beginPath();
    const pos = getPos(e);
    ictx.moveTo(pos.x, pos.y);
}

function move(e) {
    if (!isDrawing) return;
    const pos = getPos(e);

    if (mode === 'brush') {
        ictx.globalCompositeOperation = 'source-over';
        ictx.lineWidth = 3;
        ictx.lineCap = 'round';
        ictx.strokeStyle = '#000000';
        ictx.lineTo(pos.x, pos.y);
        ictx.stroke();
    } else {
        ictx.globalCompositeOperation = 'destination-out';
        ictx.beginPath();
        ictx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
        ictx.fill();
    }
}

function end() {
    if (!isDrawing) return;
    isDrawing = false;
    predict(); // 停笔时触发 AI 生成
}

// 4. 全局功能
function clearAll() {
    ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
    octx.fillStyle = '#f0ede5';
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    ictx.beginPath();
}

// 按钮切换
document.getElementById('brushBtn').onclick = () => {
    mode = 'brush';
    document.getElementById('brushBtn').style.background = '#2d5a27';
    document.getElementById('eraserBtn').style.background = '#f0ede5';
};
document.getElementById('eraserBtn').onclick = () => {
    mode = 'eraser';
    document.getElementById('eraserBtn').style.background = '#2d5a27';
    document.getElementById('brushBtn').style.background = '#f0ede5';
};

// 绑定事件
iCanvas.addEventListener('mousedown', start);
iCanvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', end);
// 适配手机
iCanvas.addEventListener('touchstart', start);
iCanvas.addEventListener('touchmove', move);
iCanvas.addEventListener('touchend', end);

// 启动执行
initAI();
