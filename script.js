const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let drawing = false;
let mode = 'brush';
let lastX = 0, lastY = 0;

// 初始化尺寸
function resize() {
    [iCanvas, oCanvas].forEach(c => {
        c.width = 600;
        c.height = 600;
    });
    clearAll(); // 初始背景
}

const PALETTE = {
    outline: '#2c3e50', // 墨色
    green: '#2d5a27',   // 石绿
    blue: '#1a3a5a',    // 石青
    paper: '#f0ede5'    // 宣纸色
};

// 核心：青绿晕染笔触
function inkStroke(x, y) {
    octx.save();
    
    // 1. 根据高度动态选色（高处青，低处绿）
    const color = y < 300 ? PALETTE.blue : PALETTE.green;
    
    // 2. 绘制晕染效果 (扩散的半透明块)
    const gradient = octx.createRadialGradient(x, y, 0, x, y, 20);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    
    octx.globalAlpha = 0.15; // 极低透明度，通过堆叠产生深浅
    octx.fillStyle = gradient;
    
    // 模拟毛笔散锋：在坐标周围随机散落几个墨点
    for(let i=0; i<3; i++) {
        const offset = (Math.random() - 0.5) * 15;
        octx.beginPath();
        octx.arc(x + offset, y + offset, Math.random() * 10 + 5, 0, Math.PI * 2);
        octx.fill();
    }
    
    // 3. 实时勾勒山脊碎线 (皴法)
    octx.globalAlpha = 0.3;
    octx.strokeStyle = PALETTE.outline;
    octx.lineWidth = 0.5;
    octx.beginPath();
    octx.moveTo(lastX, lastY);
    octx.lineTo(x, y);
    octx.stroke();
    
    octx.restore();
}

function handleMove(e) {
    if (!drawing) return;
    const rect = iCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'brush') {
        // 左侧：绘制引导线条
        ictx.strokeStyle = '#666';
        ictx.lineWidth = 1;
        ictx.beginPath();
        ictx.moveTo(lastX, lastY);
        ictx.lineTo(x, y);
        ictx.stroke();

        // 右侧：随笔触生成的青绿效果
        inkStroke(x, y);
    } else {
        // 橡皮擦：精准擦除
        // ictx 使用 'destination-out' 实现透明擦除
        ictx.globalCompositeOperation = 'destination-out';
        ictx.beginPath();
        ictx.arc(x, y, 20, 0, Math.PI * 2);
        ictx.fill();
        ictx.globalCompositeOperation = 'source-over';

        // octx 覆盖宣纸底色来模拟擦除
        octx.fillStyle = PALETTE.paper;
        octx.beginPath();
        octx.arc(x, y, 25, 0, Math.PI * 2);
        octx.fill();
    }

    [lastX, lastY] = [x, y];
}

// 事件监听
iCanvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const rect = iCanvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
});
iCanvas.addEventListener('mouseup', () => drawing = false);
iCanvas.addEventListener('mousemove', handleMove);

// 工具切换 (修复按钮逻辑)
document.getElementById('brushBtn').addEventListener('click', () => {
    mode = 'brush';
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    document.getElementById('brushBtn').classList.add('active');
});

document.getElementById('eraserBtn').addEventListener('click', () => {
    mode = 'eraser';
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    document.getElementById('eraserBtn').classList.add('active');
});

// 重置画卷 (修复逻辑)
window.clearAll = function() {
    ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
    octx.fillStyle = PALETTE.paper;
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
    // 重新开启路径
    ictx.beginPath();
};

resize();
