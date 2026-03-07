const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let drawing = false;
let mode = 'brush';

// 初始化画布
[iCanvas, oCanvas].forEach(c => {
    c.width = 600;
    c.height = 600;
});

// 青绿山水核心色调
const PALETTE = {
    outline: '#2c3e50', // 浓墨勾勒
    green: '#2d5a27',   // 石绿
    blue: '#1a3a5a',    // 石青
    ochre: '#8c7e6d',   // 赭石
    paper: '#f0ede5'    // 宣纸底色
};

// 模拟 LingDong 的山体生成算法
function drawMountain(x, y) {
    const height = Math.random() * 100 + 50;
    const width = Math.random() * 80 + 40;
    
    octx.save();
    
    // 1. 绘制山体阴影/基色 (赭石渐变到石绿)
    let grad = octx.createLinearGradient(x, y - height, x, y);
    grad.addColorStop(0, PALETTE.blue);
    grad.addColorStop(0.5, PALETTE.green);
    grad.addColorStop(1, PALETTE.ochre);
    
    octx.fillStyle = grad;
    octx.globalAlpha = 0.7;
    
    // 生成不规则的山脊形状 (抖动算法)
    octx.beginPath();
    octx.moveTo(x - width, y);
    
    for (let i = -width; i <= width; i += 5) {
        // 关键：引入随机偏移模拟岩石崎岖感
        const jitter = Math.sin(i * 0.1) * 10 + (Math.random() - 0.5) * 15;
        const currY = y - (Math.cos((i / width) * (Math.PI / 2)) * height) + jitter;
        octx.lineTo(x + i, currY);
    }
    
    octx.lineTo(x + width, y);
    octx.closePath();
    octx.fill();

    // 2. 勾勒边缘 (模拟“皴法”)
    octx.strokeStyle = PALETTE.outline;
    octx.lineWidth = 0.5;
    octx.globalAlpha = 0.3;
    octx.stroke();

    octx.restore();
}

// 交互逻辑
function handleMove(e) {
    if (!drawing) return;
    const rect = iCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'brush') {
        // 左侧绘制引导线
        ictx.lineTo(x, y);
        ictx.stroke();

        // 右侧生成山体：我们限制生成频率，防止画面太乱
        if (Math.random() > 0.85) { 
            drawMountain(x, y);
        }
    } else {
        // 橡皮擦：同时清理两边
        ictx.clearRect(x-20, y-20, 40, 40);
        octx.fillStyle = PALETTE.paper;
        octx.beginPath();
        octx.arc(x, y, 30, 0, Math.PI*2);
        octx.fill();
    }
}

iCanvas.addEventListener('mousedown', () => { drawing = true; ictx.beginPath(); });
iCanvas.addEventListener('mouseup', () => drawing = false);
iCanvas.addEventListener('mousemove', handleMove);

// 按钮逻辑... (保留之前的按钮绑定)
