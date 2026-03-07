/**
 * 墨染青绿 - 最终修复版 (AI 模型 + 坐标修正 + 青绿滤镜)
 */

// 这是一个目前依然活跃且允许跨域加载的风景模型地址
const MODEL_URL = 'https://raw.githubusercontent.com/yining1023/pix2pix_tensorflowjs/master/models/scenery/model.json';


let model;
const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let isDrawing = false;
let mode = 'brush'; 
const MODEL_SIZE = 256;

// 1. 初始化 AI 与画布
async function init() {
    // 强制同步物理像素与显示尺寸
    iCanvas.width = oCanvas.width = 500;
    iCanvas.height = oCanvas.height = 600;

    const statusTag = document.getElementById('status');
    try {
        if(statusTag) statusTag.innerText = "正在唤醒 AI 笔墨 ....";
        // 尝试从镜像仓库加载模型
        model = await tf.loadLayersModel(MODEL_URL);
        if(statusTag) statusTag.innerText = "🎨 AI 已就绪，请在左侧勾勒山河";
    } catch (e) {
        console.error(e);
        if(statusTag) statusTag.innerText = "模型加载失败，请检查网络或更换模型路径";
    }

    // 初始化渲染层背景（仿宣纸）
    octx.fillStyle = '#f0ede5';
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
}

// 2. 坐标修正逻辑 (关键：解决轨迹不准)
function getCanvasPos(e) {
    const rect = iCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 计算缩放比：Canvas 内部像素尺寸 / 页面显示尺寸
    const scaleX = iCanvas.width / rect.width;
    const scaleY = iCanvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// 3. 绘图交互
function start(e) {
    isDrawing = true;
    const pos = getCanvasPos(e);
    ictx.beginPath();
    ictx.moveTo(pos.x, pos.y);
    if(e.cancelable) e.preventDefault();
}

function move(e) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);

    if (mode === 'brush') {
        ictx.globalCompositeOperation = 'source-over';
        ictx.lineWidth = 4; // 加粗线条让 AI 更容易识别形状
        ictx.lineCap = 'round';
        ictx.lineJoin = 'round';
        ictx.strokeStyle = '#000000';
        ictx.lineTo(pos.x, pos.y);
        ictx.stroke();
    } else {
        ictx.globalCompositeOperation = 'destination-out';
        ictx.beginPath();
        ictx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
        ictx.fill();
    }
    if(e.cancelable) e.preventDefault();
}

async function end() {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (model) {
        // AI 预测逻辑
        tf.tidy(() => {
            const input = tf.browser.fromPixels(iCanvas)
                .resizeNearestNeighbor([MODEL_SIZE, MODEL_SIZE])
                .toFloat()
                .div(tf.scalar(127.5))
                .sub(tf.scalar(1))
                .expandDims();
            
            const prediction = model.predict(input);
            
            // 预测完成后，将其绘制到输出画布
            tf.browser.toPixels(prediction.squeeze().add(1).div(2), oCanvas).then(() => {
                applyCyanGreenFilter(); // 实时上色：转为青绿山水风格
            });
        });
    }
}

// 4. 风格转换：强行将普通风景映射为青绿山水色调
function applyCyanGreenFilter() {
    octx.save();
    // 使用 multiply 模式叠加石青/石绿色
    octx.globalCompositeOperation = 'color'; 
    octx.globalAlpha = 0.4;
    
    // 创建一个径向渐变：山顶偏蓝(石青)，山底偏绿(石绿)
    let grad = octx.createLinearGradient(0, 0, 0, oCanvas.height);
    grad.addColorStop(0.2, '#1a3a5a'); // 石青
    grad.addColorStop(0.6, '#2d5a27'); // 石绿
    grad.addColorStop(0.9, '#8c7e6d'); // 赭石
    
    octx.fillStyle = grad;
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    octx.restore();
}

// 5. 重置功能
window.clearAll = function() {
    ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
    octx.fillStyle = '#f0ede5';
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    ictx.beginPath();
};

// 按钮切换
document.getElementById('brushBtn').onclick = () => mode = 'brush';
document.getElementById('eraserBtn').onclick = () => mode = 'eraser';

// 事件绑定
iCanvas.addEventListener('mousedown', start);
iCanvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', end);
iCanvas.addEventListener('touchstart', start, {passive: false});
iCanvas.addEventListener('touchmove', move, {passive: false});
iCanvas.addEventListener('touchend', end);

init();
