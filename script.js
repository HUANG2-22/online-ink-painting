const inputCanvas = document.getElementById('inputCanvas');
const renderCanvas = document.getElementById('renderCanvas');
const ctx = inputCanvas.getContext('2d');
const renderCtx = renderCanvas.getContext('2d');

let isDrawing = false;

// 初始化画布尺寸
function init() {
    inputCanvas.width = renderCanvas.width = 800;
    inputCanvas.height = renderCanvas.height = 500;
    renderCtx.fillStyle = '#f4f1de';
    renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);
}

// 模拟水墨生长逻辑
function drawLandscape(x, y) {
    const opacity = Math.random() * 0.2;
    const size = Math.random() * 20 + 5;
    
    // 模拟山脉：越靠下颜色越重
    const grey = Math.floor((y / renderCanvas.height) * 100);
    renderCtx.fillStyle = `rgba(${grey}, ${grey}, ${grey}, ${opacity})`;

    // 绘制“皴法”笔触：不规则的椭圆扩散
    for (let i = 0; i < 5; i++) {
        const offsetX = (Math.random() - 0.5) * 30;
        const offsetY = (Math.random() - 0.5) * 50;
        renderCtx.beginPath();
        renderCtx.ellipse(x + offsetX, y + offsetY, size, size * 2, Math.random() * Math.PI, 0, Math.PI * 2);
        renderCtx.fill();
    }
}

// 交互监听
inputCanvas.addEventListener('mousedown', () => isDrawing = true);
inputCanvas.addEventListener('mouseup', () => isDrawing = false);
inputCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = inputCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 绘制引导线
    ctx.lineTo(x, y);
    ctx.stroke();

    // 实时生成山水
    drawLandscape(x, y);
});

function clearCanvas() {
    renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
    ctx.beginPath();
}

init();
