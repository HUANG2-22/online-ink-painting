/**
 * 墨染青绿 - 修复版 (解决坐标偏移与加载问题)
 */


// 建议下载模型后上传到你的仓库，使用相对路径
const MODEL_URL = 'model/model.json'; 

let model;
const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let isDrawing = false;
let mode = 'brush'; 
const MODEL_SIZE = 256;

// 1. 初始化
async function init() {
    // 强制设置 Canvas 像素大小，确保与 CSS 比例一致
    iCanvas.width = oCanvas.width = 500;
    iCanvas.height = oCanvas.height = 600;

    const statusTag = document.getElementById('status');
    try {
        // 如果本地没有模型，这里会报错，转而尝试引用备用云端（部分网络可用）
        model = await tf.loadLayersModel(MODEL_URL);
        if(statusTag) statusTag.innerText = "🎨 AI 已就绪";
    } catch (e) {
        console.warn("本地模型未找到，尝试云端备用...");
        try {
            // 这是一个常用的公共镜像地址
            model = await tf.loadLayersModel('https://raw.githubusercontent.com/mizchi/tfjs-pix2pix/master/models/scenery/model.json');
            if(statusTag) statusTag.innerText = "🎨 AI 已从镜像加载";
        } catch (err) {
            if(statusTag) statusTag.innerText = "无法加载 AI 模型，请确保 model 文件夹已上传";
        }
    }
}

// 2. 精确坐标计算 (修复轨迹不准的关键)
function getCanvasPos(e) {
    const rect = iCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // 计算缩放比例（防止 CSS 缩放导致位移）
    const scaleX = iCanvas.width / rect.width;
    const scaleY = iCanvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// 3. 绘图函数
function start(e) {
    isDrawing = true;
    const pos = getCanvasPos(e);
    ictx.beginPath();
    ictx.moveTo(pos.x, pos.y);
    e.preventDefault(); // 防止手机端滑动页面
}

function move(e) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);

    if (mode === 'brush') {
        ictx.globalCompositeOperation = 'source-over';
        ictx.lineWidth = 4; // 稍微加粗线条，利于 AI 识别
        ictx.lineCap = 'round';
        ictx.lineJoin = 'round';
        ictx.strokeStyle = '#000000';
        ictx.lineTo(pos.x, pos.y);
        ictx.stroke();
    } else {
        ictx.globalCompositeOperation = 'destination-out';
        ictx.beginPath();
        ictx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
        ictx.fill();
    }
    e.preventDefault();
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
            tf.browser.toPixels(prediction.squeeze().add(1).div(2), oCanvas);
        });
    }
}

// 4. 重置功能
window.clearAll = function() {
    ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
    octx.fillStyle = '#f0ede5';
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    ictx.beginPath();
};

// 事件绑定
iCanvas.addEventListener('mousedown', start);
iCanvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', end);
iCanvas.addEventListener('touchstart', start, {passive: false});
iCanvas.addEventListener('touchmove', move, {passive: false});
iCanvas.addEventListener('touchend', end);

init();
