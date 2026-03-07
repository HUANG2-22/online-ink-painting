const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let drawing = false;
let mode = 'brush';

[iCanvas, oCanvas].forEach(c => {
    c.width = 500;
    c.height = 600;
});

// 核心色调：经典的王希孟《千里江山图》色系
const palette = {
    line: '#2b2b2b',     // 墨线
    stone: '#5c4b37',    // 赭石（底部）
    mid: '#3a6342',      // 石绿（山腰）
    top: '#1e488f',      // 石青（山顶）
    paper: '#f2e9d9'     // 仿旧宣纸
};

function getInkStyle(y) {
    // 根据高度返回颜色和透明度，模拟层叠感
    if (y < 250) return { color: palette.top, alpha: 0.15 };
    if (y < 450) return { color: palette.mid, alpha: 0.2 };
    return { color: palette.stone, alpha: 0.25 };
}

function generateLandscape(x, y) {
    const style = getInkStyle(y);
    octx.save();
    
    // 模拟水墨晕染扩散
    const layers = 12; 
    for (let i = 0; i < layers; i++) {
        const offset = (Math.random() - 0.5) * 40;
        const size = Math.random() * 25 + 5;
        
        // 关键：不规则的多边形模拟碎石皴法
        drawShanshuiStroke(x + offset, y + offset, size, style);
    }
    octx.restore();
}

function drawShanshuiStroke(x, y, size, style) {
    octx.beginPath();
    octx.globalAlpha = style.alpha;
    octx.fillStyle = style.color;
    
    // 生成一个随机的“岩石状”多边形
    const points = 6;
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const dist = size * (0.6 + Math.random() * 0.4);
        const px = x + Math.cos(angle) * dist;
        const py = y + Math.sin(angle) * dist;
        if (i === 0) octx.moveTo(px, py);
        else octx.lineTo(px, py);
    }
    octx.closePath();
    octx.fill();

    // 偶尔添加细微的墨色勾勒边框
    if (Math.random() > 0.8) {
        octx.strokeStyle = palette.line;
        octx.globalAlpha = 0.1;
        octx.stroke();
    }
}

// --- 交互逻辑 ---
function handleMove(e) {
    if (!drawing) return;
    const rect = iCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'brush') {
        // 左侧：绘制具有“枯笔”感的勾勒线
        ictx.strokeStyle = 'rgba(0,0,0,0.6)';
        ictx.lineWidth = 1.5;
        ictx.lineTo(x, y);
        ictx.stroke();

        // 右侧：生成山水
        generateLandscape(x, y);
    } else {
        erase(x, y);
    }
}

function erase(x, y) {
    ictx.clearRect(x - 15, y - 15, 30, 30);
    octx.fillStyle = palette.paper;
    octx.beginPath();
    octx.arc(x, y, 30, 0, Math.PI * 2);
    octx.fill();
}

iCanvas.addEventListener('mousedown', (e) => { 
    drawing = true; 
    ictx.beginPath(); 
    const rect = iCanvas.getBoundingClientRect();
    ictx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});
iCanvas.addEventListener('mouseup', () => drawing = false);
iCanvas.addEventListener('mousemove', handleMove);

function clearAll() {
    ictx.clearRect(0, 0, 500, 600);
    octx.fillStyle = palette.paper;
    octx.fillRect(0, 0, 500, 600);
    // 预刷一层淡墨，模拟空气感
    octx.globalAlpha = 0.05;
    octx.fillStyle = '#8c7e6d';
    octx.fillRect(0,0,500,600);
}

clearAll();
