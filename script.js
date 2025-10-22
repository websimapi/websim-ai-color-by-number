const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const loadingOverlay = document.getElementById('loading-overlay');
const gameArea = document.getElementById('game-area');
const canvas = document.getElementById('color-canvas');
const paletteContainer = document.getElementById('palette');
const completionMessage = document.getElementById('completion-message');
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
}

function processImage(img) {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = GRID_SIZE;
    offscreenCanvas.height = GRID_SIZE;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    offscreenCtx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);

    const imageData = offscreenCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const pixels = imageData.data;

    // --- Color Quantization ---
    const colorCounts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
        // Ignore transparent/white background pixels
        if (pixels[i+3] < 250 || (pixels[i] > 245 && pixels[i+1] > 245 && pixels[i+2] > 245) ) continue;
        
        const colorString = `rgb(${pixels[i]}, ${pixels[i+1]}, ${pixels[i+2]})`;
        colorCounts.set(colorString, (colorCounts.get(colorString) || 0) + 1);
    }
    
    let dominantColors;
    if (colorCounts.size > MAX_COLORS) {
        dominantColors = [...colorCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_COLORS)
            .map(entry => entry[0]);
    } else {
        dominantColors = [...colorCounts.keys()];
    }
    
    const paletteRGB = dominantColors.map(colorStr => {
        const [r, g, b] = colorStr.match(/\d+/g).map(Number);
        return { r, g, b };
    });

    const findClosestColor = (r, g, b) => {
        let minDistance = Infinity;
        let closestColor = dominantColors[0];
        for (let i = 0; i < paletteRGB.length; i++) {
            const pr = paletteRGB[i].r;
            const pg = paletteRGB[i].g;
            const pb = paletteRGB[i].b;
            const distance = Math.sqrt(Math.pow(r - pr, 2) + Math.pow(g - pg, 2) + Math.pow(b - pb, 2));
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = dominantColors[i];
            }
        }
        return closestColor;
    };
    // --- End Color Quantization ---

    let colorIdCounter = 1;
    gridData = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
    
    totalTargetCells = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = (y * GRID_SIZE + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i+3];
            
            // Treat transparent or white pixels as empty background
            if (a < 250 || (r > 245 && g > 245 && b > 245)) {
                gridData[y][x] = 0; // 0 for background
                continue;
            }

            totalTargetCells++;
            const quantizedColor = findClosestColor(r, g, b);
            
            if (!colorMap.has(quantizedColor)) {
                colorMap.set(quantizedColor, { id: colorIdCounter++, count: 0 });
            }
            const colorInfo = colorMap.get(quantizedColor);
            gridData[y][x] = colorInfo.id;
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
    const sortedColors = [...colorMap.entries()].sort((a, b) => a[1].id - b[1].id);

    for (const [color, {id, count}] of sortedColors) {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.dataset.colorId = id;
        
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'palette-color';
        colorSwatch.style.backgroundColor = color;
        
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cellKey = `${x},${y}`;
            if (!filledCells.has(cellKey)) {
                // Draw grid lines
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
                
                // Draw number
                const id = gridData[y][x];
                if (id === 0) continue; // Don't draw numbers for background cells
                
                const color = [...colorMap.keys()].find(key => colorMap.get(key).id === id);
                if (!color) return;

                ctx.fillStyle = '#aaa';
                ctx.font = `${Math.max(6, cellSize * 0.5)}px Poppins`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(id, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
            } else {
                 // Redraw filled cell if needed (e.g. on resize)
                fillCell(x, y, false);
            }
        }
    }
}

function fillCell(x, y, checkCompletion = true) {
    const id = gridData[y][x];
    const color = [...colorMap.keys()].find(key => colorMap.get(key).id === id);
    if (!color) return;

    const cellSize = canvas.width / GRID_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

    const cellKey = `${x},${y}`;
    if(!filledCells.has(cellKey)) {
        filledCells.add(cellKey);
    }
    
    if (checkCompletion) {
        updatePaletteCompletion(id);
        checkGameCompletion();
    }
}


function updatePaletteCompletion(colorId) {
    const colorInfo = [...colorMap.values()].find(info => info.id === colorId);
    if (!colorInfo) return; // Added check
    let filledCount = 0;
     for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (gridData[y][x] === colorId && filledCells.has(`${x},${y}`)) {
                filledCount++;
            }
        }
    }
    
    if (filledCount >= colorInfo.count) {
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


canvas.addEventListener('pointerdown', (e) => {
    if (selectedColorId === null) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const cellSize = canvas.width / GRID_SIZE;
    const x = Math.floor(canvasX / cellSize);
    const y = Math.floor(canvasY / cellSize);
    
    if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        if (gridData[y][x] === selectedColorId) {
            fillCell(x, y);
        }
    }
});

window.addEventListener('resize', () => {
    if (gameArea.classList.contains('hidden')) return;
    setupCanvas();
    drawGrid();
});