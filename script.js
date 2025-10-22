const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const loadingOverlay = document.getElementById('loading-overlay');
const gameArea = document.getElementById('game-area');
const canvas = document.getElementById('color-canvas');
const paletteContainer = document.getElementById('palette');
const completionMessage = document.getElementById('completion-message');
const zoomInfo = document.getElementById('zoom-info');
const ctx = canvas.getContext('2d');

const difficultySettings = {
    easy: { gridSize: 20, maxColors: 8 },
    medium: { gridSize: 30, maxColors: 16 },
    hard: { gridSize: 50, maxColors: 32 }
};

let GRID_SIZE = difficultySettings.easy.gridSize;
let MAX_COLORS = difficultySettings.easy.maxColors;

let gridData = [];
let colorMap = new Map();
let selectedColorId = null;
let filledCells = new Set();
let totalTargetCells = 0;

// Zoom and pan state
let transform = { x: 0, y: 0, scale: 1 };
let isPanning = false;
let startPan = { x: 0, y: 0 };
let lastPinchDist = 0;

promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
    GRID_SIZE = difficultySettings[selectedDifficulty].gridSize;
    MAX_COLORS = difficultySettings[selectedDifficulty].maxColors;
    
    resetState();
    loadingOverlay.classList.remove('hidden');
    
    try {
        const result = await websim.imageGen({
            prompt: `pixel art, simple color palette, ${prompt}`,
            aspect_ratio: "1:1",
        });
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = result.url;
        img.onload = () => {
            processImage(img);
            loadingOverlay.classList.add('hidden');
            gameArea.classList.remove('hidden');
            zoomInfo.classList.add('visible');
            setTimeout(() => zoomInfo.classList.remove('visible'), 3000);
        };
        img.onerror = () => {
            alert('Failed to load generated image.');
            loadingOverlay.classList.add('hidden');
        }

    } catch (error) {
        console.error('Error generating image:', error);
        alert('Could not generate image. Please try again.');
        loadingOverlay.classList.add('hidden');
    }
});

function resetState() {
    gridData = [];
    colorMap.clear();
    selectedColorId = null;
    filledCells.clear();
    totalTargetCells = 0;
    paletteContainer.innerHTML = '';
    completionMessage.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    transform = { x: 0, y: 0, scale: 1 };
}

function processImage(img) {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = GRID_SIZE;
    offscreenCanvas.height = GRID_SIZE;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    offscreenCtx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);

    const imageData = offscreenCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const pixels = imageData.data;

    const colorCounts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] < 250 || (pixels[i] > 245 && pixels[i+1] > 245 && pixels[i+2] > 245) ) continue;
        const colorString = `rgb(${pixels[i]}, ${pixels[i+1]}, ${pixels[i+2]})`;
        colorCounts.set(colorString, (colorCounts.get(colorString) || 0) + 1);
    }
    
    const sortedColors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
    
    let dominantColors = new Set();
    let hasOtherCategory = false;

    if (sortedColors.length > MAX_COLORS) {
        hasOtherCategory = true;
        for (let i = 0; i < MAX_COLORS - 1; i++) {
            dominantColors.add(sortedColors[i][0]);
        }
    } else {
        dominantColors = new Set(sortedColors.map(c => c[0]));
    }

    let colorIdCounter = 1;
    for (const color of dominantColors) {
        colorMap.set(color, { id: colorIdCounter++, count: 0 });
    }

    if (hasOtherCategory) {
        colorMap.set('other', { id: MAX_COLORS, count: 0 });
    }

    gridData = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    totalTargetCells = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = (y * GRID_SIZE + x) * 4;
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i+3];
            
            if (a < 250 || (r > 245 && g > 245 && b > 245)) {
                gridData[y][x] = { id: 0, color: null };
                continue;
            }

            totalTargetCells++;
            const colorString = `rgb(${r}, ${g}, ${b})`;
            
            let colorInfo;
            if (dominantColors.has(colorString)) {
                colorInfo = colorMap.get(colorString);
            } else {
                colorInfo = colorMap.get('other');
            }

            gridData[y][x] = { id: colorInfo.id, color: colorString };
            colorInfo.count++;
        }
    }
    
    setupCanvas();
    setupPalette();
    drawGrid();
}


function setupCanvas() {
    const container = document.getElementById('canvas-container');
    const size = Math.min(container.clientWidth, window.innerHeight * 0.5, 500);
    canvas.width = size;
    canvas.height = size;
    
    ctx.imageSmoothingEnabled = false;
}

function setupPalette() {
    paletteContainer.innerHTML = '';
    const sortedColors = [...colorMap.entries()]
        .filter(([key]) => key !== 'other')
        .sort((a, b) => a[1].id - b[1].id);

    const otherColor = colorMap.get('other');
    if (otherColor) {
        sortedColors.push(['other', otherColor]);
    }

    for (const [color, {id, count}] of sortedColors) {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.dataset.colorId = id;
        
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'palette-color';

        if (color === 'other') {
            colorSwatch.classList.add('other');
        } else {
            colorSwatch.style.backgroundColor = color;
        }
        
        const colorIdSpan = document.createElement('span');
        colorIdSpan.className = 'palette-id';
        colorIdSpan.textContent = id;
        
        item.appendChild(colorSwatch);
        item.appendChild(colorIdSpan);
        paletteContainer.appendChild(item);
        
        item.addEventListener('click', () => {
            if (item.classList.contains('completed')) return;

            const currentSelected = document.querySelector('.palette-item.selected');
            if (currentSelected) {
                currentSelected.classList.remove('selected');
            }
            item.classList.add('selected');
            selectedColorId = id;
        });
    }
}

function drawGrid() {
    const cellSize = canvas.width / GRID_SIZE;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1 / transform.scale;
    
    const view = {
        x: -transform.x / transform.scale,
        y: -transform.y / transform.scale,
        w: canvas.width / transform.scale,
        h: canvas.height / transform.scale,
    };

    const startX = Math.floor(view.x / cellSize);
    const startY = Math.floor(view.y / cellSize);
    const endX = Math.ceil((view.x + view.w) / cellSize);
    const endY = Math.ceil((view.y + view.h) / cellSize);

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) continue;

            const cellKey = `${x},${y}`;
            const cellData = gridData[y][x];

            if (filledCells.has(cellKey)) {
                ctx.fillStyle = cellData.color;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            } else {
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
                
                if (cellData.id === 0) continue; 
                
                if (transform.scale > 1.5) { // Only draw numbers when zoomed in
                    ctx.fillStyle = '#aaa';
                    const fontSize = Math.max(6, cellSize * 0.5);
                    ctx.font = `${fontSize}px Poppins`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(cellData.id, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
                }
            }
        }
    }
    ctx.restore();
}

function fillCell(x, y, checkCompletion = true) {
    const cellData = gridData[y][x];
    const color = cellData.color;
    if (!color) return;

    const cellKey = `${x},${y}`;
    if (!filledCells.has(cellKey)) {
        filledCells.add(cellKey);
        
        const cellSize = canvas.width / GRID_SIZE;
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);
        ctx.fillStyle = color;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        ctx.restore();
    }
    
    if (checkCompletion) {
        updatePaletteCompletion(cellData.id);
        checkGameCompletion();
    }
}


function updatePaletteCompletion(colorId) {
    let colorInfo, totalCount;
    const isOther = colorMap.has('other') && colorMap.get('other').id === colorId;
    
    if (isOther) {
        colorInfo = colorMap.get('other');
    } else {
        colorInfo = [...colorMap.values()].find(info => info.id === colorId);
    }
    
    if (!colorInfo) return;
    totalCount = colorInfo.count;

    let filledCount = 0;
     for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (gridData[y][x].id === colorId && filledCells.has(`${x},${y}`)) {
                filledCount++;
            }
        }
    }
    
    if (filledCount >= totalCount) {
        const paletteItem = document.querySelector(`.palette-item[data-color-id='${colorId}']`);
        if (paletteItem) {
            paletteItem.classList.add('completed');
            if (paletteItem.classList.contains('selected')) {
                paletteItem.classList.remove('selected');
                selectedColorId = null;
            }
        }
    }
}


function checkGameCompletion() {
    if (filledCells.size >= totalTargetCells) {
        completionMessage.classList.remove('hidden');
    }
}

function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Invert the transform
    const worldX = (canvasX - transform.x) / transform.scale;
    const worldY = (canvasY - transform.y) / transform.scale;

    return { x: worldX, y: worldY };
}

canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    if (e.touches && e.touches.length > 1) {
        isPanning = false;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastPinchDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        return;
    }

    isPanning = true;
    startPan.x = e.clientX - transform.x;
    startPan.y = e.clientY - transform.y;
    
    const { x, y } = getCanvasCoords(e);
    const cellSize = canvas.width / GRID_SIZE;
    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);

    if (selectedColorId !== null && gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        if (gridData[gridY][gridX].id === selectedColorId) {
            fillCell(gridX, gridY);
        }
    }
});

canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (e.touches && e.touches.length > 1) {
        // Pinch zoom
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
        const scaleAmount = currentDist / lastPinchDist;
        
        const rect = canvas.getBoundingClientRect();
        const midX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
        const midY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

        const newScale = Math.min(Math.max(1, transform.scale * scaleAmount), 10);

        transform.x = midX - (midX - transform.x) * (newScale / transform.scale);
        transform.y = midY - (midY - transform.y) * (newScale / transform.scale);
        transform.scale = newScale;

        lastPinchDist = currentDist;
        drawGrid();
        return;
    }


    if (!isPanning || (e.touches && e.touches.length > 0)) return;
    
    transform.x = e.clientX - startPan.x;
    transform.y = e.clientY - startPan.y;

    drawGrid();
});

canvas.addEventListener('pointerup', () => {
    isPanning = false;
    lastPinchDist = 0;
});
canvas.addEventListener('pointerleave', () => {
    isPanning = false;
    lastPinchDist = 0;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());


window.addEventListener('resize', () => {
    if (gameArea.classList.contains('hidden')) return;
    setupCanvas();
    drawGrid();
});