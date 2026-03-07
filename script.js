const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let drawing = false;
let mode = 'brush'; // 'brush' 或 'eraser'

// 初始化尺寸
[iCanvas, oCanvas].forEach(c => {
    c.width = 500;
    c.height = 600;
});

// 青绿山水核心色板
const colors = {
    rock: '#4a3d31',   // 赭石（山底/轮廓）
    green: '#2d5a27',  // 石绿（山腰）
    blue: '#1a3a5a',   // 石青（山顶）
    mist: '#f0ede5'    // 云雾
};

function draw(e) {
    if (!drawing) return;
    const rect = iCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'brush') {
        // 左边绘制简单黑线
        ictx.lineWidth = 2;
        ictx.lineCap = 'round';
        ictx.lineTo(x, y);
        ictx.stroke();

        // 右边实时生成青绿效果
        generateInk(x, y);
    } else {
        // 橡皮擦模式
        ictx.clearRect(x-10, y-10, 20, 20);
        octx.fillStyle = colors.mist;
        octx.beginPath();
        octx.arc(x, y, 25, 0, Math.PI*2);
        octx.fill();
    }
}

function generateInk(x, y) {
    // 模拟山体层次：底部赭石 -> 中部石绿 -> 顶部石青
    let color = colors.green;
    if (y < 200) color = colors.blue;
    if (y > 450) color = colors.rock;

    octx.save();
    octx.globalAlpha = 0.2; // 模拟半透明叠加
    octx.fillStyle = color;

    // 算法生成：不规则笔触模拟“皴法”
    for(let i=0; i<8; i++) {
        const r = Math.random() * 15 + 5;
        const dx = (Math.random() - 0.5) * 20;
        const dy = (Math.random() - 0.5) * 30;
        
        octx.beginPath();
        // 绘制略带菱形的块面，模拟岩石质感
        octx.moveTo(x + dx, y + dy - r);
        octx.lineTo(x + dx + r, y + dy);
        octx.lineTo(x + dx, y + dy + r);
        octx.lineTo(x + dx - r, y + dy);
        octx.closePath();
        octx.fill();
    }
    octx.restore();
}

// 事件监听
iCanvas.addEventListener('mousedown', () => { drawing = true; ictx.beginPath(); });
iCanvas.addEventListener('mouseup', () => drawing = false);
iCanvas.addEventListener('mousemove', draw);

// 工具切换
document.getElementById('brushBtn').onclick = () => {
    mode = 'brush';
    document.getElementById('brushBtn').classList.add('active');
    document.getElementById('eraserBtn').classList.remove('active');
};
document.getElementById('eraserBtn').onclick = () => {
    mode = 'eraser';
    document.getElementById('eraserBtn').classList.add('active');
    document.getElementById('brushBtn').classList.remove('active');
};

function clearAll() {
    ictx.clearRect(0, 0, 500, 600);
    octx.fillStyle = colors.mist;
    octx.fillRect(0, 0, 500, 600);
}

clearAll();
