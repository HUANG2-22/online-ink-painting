const iCanvas = document.getElementById('inputCanvas');
const oCanvas = document.getElementById('outputCanvas');
const ictx = iCanvas.getContext('2d');
const octx = oCanvas.getContext('2d');

let isDrawing = false;
let model;

// 1. 初始化模型 (使用的是经过优化的轻量化生成器)
async function initModel() {
    const statusTag = document.getElementById('status');
    statusTag.innerText = "正在加载山水意境模型...";
    
    // 加载风格迁移模型 (这个地址是公共可用的，且支持 CORS)
    model = new mi.ArbitraryStyleTransferNetwork();
    await model.initialize();
    
    statusTag.innerText = "🎨 已进入青绿山水画境";
    
    // 默认背景
    octx.fillStyle = '#f0ede5';
    octx.fillRect(0, 0, oCanvas.width, oCanvas.height);
}

// 2. 核心：实时渲染山水
async function renderLandscape() {
    if (!model) return;

    // 获取左侧涂鸦作为“内容图”
    const contentImg = iCanvas;
    
    // 我们需要一张“风格图”作为参考，这里用一张青绿山水的图片地址
    // 你可以找一张你喜欢的千里江山图切片作为 style.jpg 放在仓库里
    const styleImg = new Image();
    styleImg.crossOrigin = "anonymous";
    styleImg.src = "https://images.metmuseum.org/CRDImages/as/original/DP155455.jpg"; // 这是一个水墨示例

    styleImg.onload = async () => {
        // 进行风格合并
        const result = await model.transfer(contentImg, styleImg);
        
        // 将生成的结果画到右边
        const tempCanvas = document.createElement('canvas');
        await tf.browser.toPixels(result.squeeze(), tempCanvas);
        
        octx.drawImage(tempCanvas, 0, 0, oCanvas.width, oCanvas.height);
        
        // 释放内存
        result.dispose();
    };
}

// 3. 修复后的坐标系统
function getPos(e) {
    const rect = iCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * (iCanvas.width / rect.width),
        y: (clientY - rect.top) * (iCanvas.height / rect.height)
    };
}

// 4. 交互绑定
iCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    ictx.beginPath();
    const pos = getPos(e);
    ictx.moveTo(pos.x, pos.y);
});

iCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    
    ictx.lineWidth = 5;
    ictx.lineCap = 'round';
    ictx.strokeStyle = '#000';
    ictx.lineTo(pos.x, pos.y);
    ictx.stroke();
});

// 松开笔触时生成
window.addEventListener('mouseup', () => {
    if (isDrawing) {
        isDrawing = false;
        renderLandscape();
    }
});

initModel();
